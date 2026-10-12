'use strict';

importScripts('shared.js');

const SC = globalThis.SkipCam;
const { SYNC_KEYS, SESSION_KEYS, LOCAL_KEYS, REASONS } = SC;

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((err) => console.warn('Skip Cam Login: could not set session storage access level', err));

const MENU_ID_PREFIX = 'skipcam-site-';
const PAUSE_COMMAND = 'toggle-pause-everywhere';
const SHORTCUT_PAUSE_MS = 60 * 60 * 1000;

const BADGE_BY_STATE = {
    active: { text: '', color: '#047857' },
    pause: { text: 'II', color: '#B45309' },
    off: { text: 'OFF', color: '#52525B' },
    error: { text: '!', color: '#DC2626' },
    none: { text: '', color: '#00000000' },
};

const warn = (label) => (err) => console.warn(`Skip Cam Login: ${label}`, err);

// ─── Badge and tooltip ──────────────────────────────────────────────────────

function tooltipFor({ state, reason, kind, siteName, clickDelayMs, pauseUntil }) {
    const base = 'Skip Cam Login';
    if (state === 'none') return base;
    if (reason === 'allowed') {
        if (kind === 'site') return `${base} — On. Will click the login button next time you're signed out.`;
        return clickDelayMs > 0
            ? `${base} — Will click the login button after ${SC.formatDelay(clickDelayMs)}.`
            : `${base} — Will click the login button on this page.`;
    }
    const entry = REASONS[reason];
    return entry ? `${base} — ${entry.tooltip({ siteName, pauseUntil, now: Date.now() })}` : base;
}

async function updateBadge(tabId, site, request) {
    const [sync, session] = await Promise.all([
        chrome.storage.sync.get(SYNC_KEYS.CLICK_DELAY_MS).catch(() => ({})),
        chrome.storage.session.get(SESSION_KEYS.PAUSE_UNTIL).catch(() => ({})),
    ]);
    const delay = sync[SYNC_KEYS.CLICK_DELAY_MS];
    const cfg = BADGE_BY_STATE[request.state];
    const title = tooltipFor({
        state: request.state,
        reason: request.reason,
        kind: request.kind,
        siteName: site.name,
        clickDelayMs: Number.isFinite(delay) ? delay : 0,
        pauseUntil: session[SESSION_KEYS.PAUSE_UNTIL],
    });
    try {
        await chrome.action.setBadgeText({ tabId, text: cfg.text });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: cfg.color });
        await chrome.action.setTitle({ tabId, title });
    } catch (err) {
        // Tab closed or navigated away; nothing to update.
    }
}

// ─── Messages from content scripts ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const page = SC.senderPage(sender, chrome.runtime.id);
    if (!page) return false;
    const finish = (promise) => {
        promise.catch(warn('message handling failed')).finally(() => sendResponse({}));
        return true;
    };
    switch (request && request.type) {
        case 'state_update':
            if (!SC.isValidStateUpdate(request)) return false;
            return finish(updateBadge(sender.tab.id, page.site, request));
        case 'login_clicked':
            return finish(handleLoginClicked(page.site));
        case 'append_log':
            return finish(handleLogMessage(page.site, request.entry));
        default:
            return false;
    }
});

async function handleLoginClicked(site) {
    await Promise.all([
        incrementClickCounter().catch(warn('counter update failed')),
        appendLog({ ts: Date.now(), site: site.name, action: 'clicked' }).catch(warn('log append failed')),
        notify(`skipcam-login-${site.id}`, `Signing you in to ${site.name}`,
            'Skip Cam Login clicked the login button for you.'),
    ]);
}

async function handleLogMessage(site, rawEntry) {
    const entry = SC.sanitizeLogEntry(rawEntry, site.name, Date.now());
    // Clicks are only ever recorded through login_clicked.
    if (!entry || entry.action === 'clicked') return;
    await appendLog(entry);
    if (entry.reason === 'loop-guard') {
        await notify(`skipcam-loop-${site.id}`, 'Stopped to avoid a sign-in loop',
            `Auto-click on ${site.name} is paused in this tab. Open the toolbar popup to try again.`);
    }
}

async function notify(id, title, message) {
    const { [SYNC_KEYS.NOTIFICATION_STATUS]: enabled } =
        await chrome.storage.sync.get(SYNC_KEYS.NOTIFICATION_STATUS).catch(() => ({}));
    if (enabled === false) return;
    try {
        await chrome.notifications.create(id, {
            type: 'basic',
            iconUrl: 'icon-128.png',
            title,
            message,
            silent: true,
        });
    } catch (err) {
        console.warn('Skip Cam Login: could not show notification', err);
    }
}

// ─── Counter and activity log (serialised read-modify-write) ────────────────

const enqueueWrite = SC.createSerialQueue();

function incrementClickCounter() {
    return enqueueWrite(async () => {
        const key = LOCAL_KEYS.CLICKS_SAVED;
        const { [key]: count = 0 } = await chrome.storage.local.get(key);
        await chrome.storage.local.set({ [key]: (Number.isFinite(count) ? count : 0) + 1 });
    });
}

function appendLog(entry) {
    return enqueueWrite(async () => {
        const { [SYNC_KEYS.KEEP_HISTORY]: keep } = await chrome.storage.sync.get(SYNC_KEYS.KEEP_HISTORY);
        if (keep === false) return;
        const key = LOCAL_KEYS.ACTIVITY_LOG;
        const { [key]: log } = await chrome.storage.local.get(key);
        const next = [entry, ...(Array.isArray(log) ? log : [])].slice(0, SC.LOG_MAX_ENTRIES);
        await chrome.storage.local.set({ [key]: next });
    });
}

// ─── React to settings changes ──────────────────────────────────────────────

const WATCHED_SYNC_KEYS = [
    SYNC_KEYS.MOODLE_STATUS,
    SYNC_KEYS.PANOPTO_STATUS,
    SYNC_KEYS.LOGOUT_SCOPE,
    SYNC_KEYS.LEGACY_LOGOUT_SCOPE_SESSION,
    SYNC_KEYS.CLICK_DELAY_MS,
];
const WATCHED_SESSION_KEYS = [SESSION_KEYS.SUPPRESS_AUTO_LOGIN, SESSION_KEYS.PAUSE_UNTIL];

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        const legacy = changes[SYNC_KEYS.LEGACY_PAUSED_HOSTS];
        if (legacy && legacy.newValue !== undefined) {
            migratePausedHosts().catch(warn('paused_hosts migration failed'));
        }
        if (SC.SITES.some((site) => site.statusKey in changes)) syncMenuChecks();
    }
    const triggered =
        (area === 'sync' && WATCHED_SYNC_KEYS.some((k) => k in changes)) ||
        (area === 'session' && WATCHED_SESSION_KEYS.some((k) => k in changes));
    if (triggered) requestReevaluateAll();
});

async function requestReevaluateAll() {
    let tabs;
    try { tabs = await chrome.tabs.query({}); } catch (err) { return; }
    for (const tab of tabs) {
        if (tab.id == null) continue;
        chrome.tabs.sendMessage(tab.id, { type: 'reevaluate' })
            .catch(() => { /* no content script in this tab */ });
    }
}

// ─── Right-click menu: one checkbox per site ────────────────────────────────

function ignoreLastError() {
    void chrome.runtime.lastError;
}

async function ensureContextMenus() {
    const sync = await chrome.storage.sync.get(SC.SITES.map((s) => s.statusKey));
    await new Promise((resolve) => chrome.contextMenus.removeAll(() => {
        ignoreLastError();
        resolve();
    }));
    for (const site of SC.SITES) {
        chrome.contextMenus.create({
            id: MENU_ID_PREFIX + site.id,
            type: 'checkbox',
            title: `Auto-click on ${site.name}`,
            checked: sync[site.statusKey] !== false,
            contexts: ['all'],
            documentUrlPatterns: [site.pattern],
        }, ignoreLastError);
    }
}

async function syncMenuChecks() {
    const sync = await chrome.storage.sync.get(SC.SITES.map((s) => s.statusKey)).catch(() => null);
    if (!sync) return;
    for (const site of SC.SITES) {
        chrome.contextMenus.update(MENU_ID_PREFIX + site.id,
            { checked: sync[site.statusKey] !== false }, ignoreLastError);
    }
}

chrome.contextMenus.onClicked.addListener((info) => {
    const id = String(info.menuItemId);
    if (!id.startsWith(MENU_ID_PREFIX)) return;
    const site = SC.siteById(id.slice(MENU_ID_PREFIX.length));
    if (!site) return;
    chrome.storage.sync.set({ [site.statusKey]: info.checked === true })
        .catch(warn('could not save site switch'));
});

async function migratePausedHosts() {
    const sync = await chrome.storage.sync.get(SYNC_KEYS.LEGACY_PAUSED_HOSTS);
    const plan = SC.migratePausedHosts(sync);
    if (!plan) return;
    if (Object.keys(plan.set).length > 0) await chrome.storage.sync.set(plan.set);
    await chrome.storage.sync.remove(plan.remove);
}

// ─── Keyboard shortcut (no default key; set at chrome://extensions/shortcuts)

chrome.commands.onCommand.addListener((command) => {
    if (command === PAUSE_COMMAND) togglePauseEverywhere().catch(warn('shortcut failed'));
});

async function togglePauseEverywhere() {
    const key = SESSION_KEYS.PAUSE_UNTIL;
    const { [key]: until } = await chrome.storage.session.get(key);
    if (until && until > Date.now()) {
        await chrome.storage.session.remove(key);
        await notify('skipcam-pause', 'Auto-click resumed', 'Skip Cam Login will click login buttons again.');
        return;
    }
    const next = Date.now() + SHORTCUT_PAUSE_MS;
    await chrome.storage.session.set({ [key]: next });
    await notify('skipcam-pause', 'Paused everywhere',
        `Skip Cam Login won't click login buttons until ${SC.formatClockTime(next)}.`);
}

// ─── Install, update, startup ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
    await migratePausedHosts().catch(warn('paused_hosts migration failed'));
    await ensureContextMenus().catch(warn('could not create menus'));
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') })
            .catch(warn('could not open welcome page'));
    } else if (details.reason === 'update') {
        const version = chrome.runtime.getManifest().version;
        if (SC.isFeatureUpdate(details.previousVersion, version)) {
            await chrome.storage.local.set({ [LOCAL_KEYS.WHATS_NEW]: SC.majorMinor(version) })
                .catch(warn('could not flag what\'s new'));
        }
    }
});

chrome.runtime.onStartup.addListener(() => {
    ensureContextMenus().catch(warn('could not create menus'));
});

// Another device on ≤1.3 may sync paused_hosts at any time.
migratePausedHosts().catch(warn('paused_hosts migration failed'));
