'use strict';

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((err) => console.warn('background: failed to set storage.session access level', err));

const tabStates = new Map();

const CONTEXT_MENU_ID = 'skip-cam-login-pause-site';
const PAUSED_HOSTS_KEY = 'paused_hosts';
const SUPPORTED_HOST_PATTERNS = [
    'https://www.vle.cam.ac.uk/*',
    'https://cambridgelectures.cloud.panopto.eu/Panopto/*',
];

const BADGE_BY_STATE = {
    active: { text: '', color: '#10B981' },
    pause:  { text: 'II', color: '#F59E0B' },
    off:    { text: 'OFF', color: '#71717A' },
    none:   { text: '', color: '#00000000' },
};

function tooltipFor(state, reason, clickDelayMs, expiresAt) {
    const base = 'Skip Cam Login';
    if (state === 'active') {
        const tail = clickDelayMs > 0
            ? ` Will auto-click after ${clickDelayMs}ms.`
            : ' Will auto-click on this page.';
        return base + ' —' + tail;
    }
    if (state === 'off') return base + ' — Disabled in settings for this site.';
    if (state === 'pause') {
        if (reason === 'timed-pause' && expiresAt && expiresAt > Date.now()) {
            const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000));
            const word = minutes === 1 ? 'minute' : 'minutes';
            return `${base} — Paused for ${minutes} more ${word}.`;
        }
        const reasons = {
            'timed-pause': 'Paused for now (timed).',
            'logout-session': 'Paused after sign-out (all tabs).',
            'logout-tab': 'Paused after sign-out (this tab).',
            'manual-tab': 'Paused on this tab.',
            'site-paused': 'Paused on this site (right-click to resume).',
        };
        return base + ' — ' + (reasons[reason] || 'Paused.');
    }
    return base;
}

async function applyBadge(tabId, info) {
    const cfg = BADGE_BY_STATE[info.state] || BADGE_BY_STATE.none;
    try {
        await chrome.action.setBadgeText({ tabId, text: cfg.text });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: cfg.color });
        await chrome.action.setTitle({
            tabId,
            title: tooltipFor(info.state, info.reason, info.clickDelayMs, info.expiresAt),
        });
    } catch (err) {
        // Tab likely closed; ignore.
    }
}

chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.type === 'login_clicked') {
        handleLoginClicked(request.siteName)
            .catch((err) => console.warn('background: failed to handle login_clicked', err))
            .finally(() => sendResponse({}));
        return true;
    }
    if (request?.type === 'state_update') {
        const tabId = sender.tab?.id;
        if (tabId == null) {
            sendResponse({});
            return false;
        }
        Promise.all([
            chrome.storage.sync.get('click_delay_ms'),
            chrome.storage.session.get('pause_until'),
        ]).then(([sync, session]) => {
            const click_delay_ms = sync.click_delay_ms ?? 0;
            const pause_until = session.pause_until;
            const info = {
                state: request.state,
                reason: request.reason,
                clickDelayMs: Number.isFinite(click_delay_ms) ? click_delay_ms : 0,
                expiresAt: pause_until && pause_until > Date.now() ? pause_until : undefined,
            };
            tabStates.set(tabId, info);
            applyBadge(tabId, info);
            sendResponse({});
        });
        return true;
    }
    if (request?.type === 'append_log') {
        appendLogEntry(request.entry || {})
            .catch((err) => console.warn('background: log append failed', err))
            .finally(() => sendResponse({}));
        return true;
    }
    return false;
});

const WATCHED_SYNC_KEYS = ['moodle_status', 'panopto_status', 'logout_scope', 'logout_scope_session', 'click_delay_ms', PAUSED_HOSTS_KEY];
const WATCHED_SESSION_KEYS = ['suppress_auto_login', 'pause_until'];

chrome.storage.onChanged.addListener((changes, area) => {
    const triggered =
        (area === 'sync' && WATCHED_SYNC_KEYS.some((k) => k in changes)) ||
        (area === 'session' && WATCHED_SESSION_KEYS.some((k) => k in changes));
    if (!triggered) return;
    requestReevaluateAll();
    if (area === 'sync' && PAUSED_HOSTS_KEY in changes) {
        refreshContextMenuForActiveTab();
    }
});

async function requestReevaluateAll() {
    let tabs;
    try { tabs = await chrome.tabs.query({}); } catch (err) { return; }
    for (const tab of tabs) {
        if (tab.id == null) continue;
        chrome.tabs.sendMessage(tab.id, { type: 'reevaluate' })
            .catch(() => { /* not a content-script tab; ignore */ });
    }
}

async function handleLoginClicked(siteName) {
    incrementClickCounter().catch((err) => console.warn('background: counter increment failed', err));
    appendLogEntry({ site: siteName, action: 'clicked' })
        .catch((err) => console.warn('background: log append failed', err));

    const { notification_status } = await chrome.storage.sync.get('notification_status');
    if (notification_status === false) return;

    try {
        const id = await chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Login Skipped',
            message: `Login button on ${siteName} clicked automatically.`,
        });
        console.log('background: notification created', id);
    } catch (err) {
        console.warn('background: chrome.notifications.create failed', err);
    }
}

async function incrementClickCounter() {
    const { clicks_saved = 0 } = await chrome.storage.local.get('clicks_saved');
    await chrome.storage.local.set({ clicks_saved: (clicks_saved || 0) + 1 });
}

const LOG_MAX_ENTRIES = 50;

async function appendLogEntry(partial) {
    const entry = { ts: Date.now(), ...partial };
    const { activity_log = [] } = await chrome.storage.local.get('activity_log');
    activity_log.unshift(entry);
    if (activity_log.length > LOG_MAX_ENTRIES) {
        activity_log.length = LOG_MAX_ENTRIES;
    }
    await chrome.storage.local.set({ activity_log });
}

// ─── Context menu: pause/resume on this site ────────────────────────────────

async function ensureContextMenu() {
    try {
        await chrome.contextMenus.removeAll();
        chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: 'Pause Skip Cam Login on this site',
            contexts: ['all'],
            documentUrlPatterns: SUPPORTED_HOST_PATTERNS,
        });
    } catch (err) {
        console.warn('background: ensureContextMenu failed', err);
    }
}

function hostFromUrl(url) {
    if (!url) return null;
    try { return new URL(url).host; } catch (err) { return null; }
}

async function getPausedHosts() {
    const { [PAUSED_HOSTS_KEY]: paused = [] } = await chrome.storage.sync.get(PAUSED_HOSTS_KEY);
    return Array.isArray(paused) ? paused : [];
}

async function updateContextMenuLabel(host) {
    if (!host) return;
    const paused = await getPausedHosts();
    const isPaused = paused.includes(host);
    try {
        await chrome.contextMenus.update(CONTEXT_MENU_ID, {
            title: isPaused
                ? 'Resume Skip Cam Login on this site'
                : 'Pause Skip Cam Login on this site',
        });
    } catch (err) {
        // Menu may not exist yet on first install; ignore.
    }
}

async function refreshContextMenuForActiveTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            const host = hostFromUrl(tab.url);
            if (host) await updateContextMenuLabel(host);
        }
    } catch (err) {
        // ignore
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    const host = hostFromUrl(info.pageUrl) || hostFromUrl(tab && tab.url);
    if (!host) return;
    const paused = await getPausedHosts();
    const set = new Set(paused);
    if (set.has(host)) set.delete(host);
    else set.add(host);
    await chrome.storage.sync.set({ [PAUSED_HOSTS_KEY]: [...set] });
    await updateContextMenuLabel(host);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        const host = hostFromUrl(tab && tab.url);
        if (host) await updateContextMenuLabel(host);
    } catch (err) {
        // ignore
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    if (!tab || !tab.active) return;
    const host = hostFromUrl(tab.url);
    if (host) await updateContextMenuLabel(host);
});

// ─── First-install welcome ──────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
    await ensureContextMenu();
    await refreshContextMenuForActiveTab();
    if (details.reason === 'install') {
        try {
            await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
        } catch (err) {
            console.warn('background: failed to open welcome page', err);
        }
    }
});

chrome.runtime.onStartup.addListener(() => {
    ensureContextMenu().then(refreshContextMenuForActiveTab);
});
