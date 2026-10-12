'use strict';

const SC = globalThis.SkipCam;
const { SYNC_KEYS, SESSION_KEYS, LOCAL_KEYS, REASONS } = SC;

const PAUSE_COMMAND = 'toggle-pause-everywhere';
const REPORT_URL = 'https://github.com/sileneer/skip-cam-login/issues/new';
const RELEASES_URL = 'https://github.com/sileneer/skip-cam-login/releases/tag/';

const $ = (id) => document.getElementById(id);
const warn = (label) => (err) => console.warn(`Skip Cam Login popup: ${label}`, err);

document.addEventListener('DOMContentLoaded', async () => {
    const logoutScope = await migrateLogoutScope();
    initPauseButtons();
    initActivity();
    await Promise.all([
        renderCounter(),
        initWhatsNew(),
        initSiteSwitches(),
        initSettings(logoutScope),
        refreshPause(),
        refreshStatus(),
    ]);
    chrome.storage.onChanged.addListener(onStorageChanged);
});

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// ─── Header, what's new ─────────────────────────────────────────────────────

async function renderCounter() {
    const { [LOCAL_KEYS.CLICKS_SAVED]: count } = await chrome.storage.local.get(LOCAL_KEYS.CLICKS_SAVED);
    if (!Number.isFinite(count) || count <= 0) return;
    const sub = $('header-sub');
    sub.textContent = SC.formatClickSavings(count, SC.SECONDS_PER_CLICK);
    sub.title = `Estimated at ${SC.SECONDS_PER_CLICK} seconds per click`;
}

async function initWhatsNew() {
    const { [LOCAL_KEYS.WHATS_NEW]: version } = await chrome.storage.local.get(LOCAL_KEYS.WHATS_NEW);
    if (typeof version !== 'string' || !version) return;
    const link = $('whats-new-link');
    $('whats-new-version').textContent = version;
    link.href = RELEASES_URL + encodeURIComponent(version);
    $('whats-new').hidden = false;
    const dismiss = () => {
        $('whats-new').hidden = true;
        chrome.storage.local.remove(LOCAL_KEYS.WHATS_NEW).catch(warn('dismiss failed'));
    };
    $('whats-new-dismiss').addEventListener('click', dismiss);
    link.addEventListener('click', dismiss);
}

// ─── Sites and settings ─────────────────────────────────────────────────────

async function migrateLogoutScope() {
    const sync = await chrome.storage.sync.get([
        SYNC_KEYS.LOGOUT_SCOPE,
        SYNC_KEYS.LEGACY_LOGOUT_SCOPE_SESSION,
    ]);
    const scope = sync[SYNC_KEYS.LOGOUT_SCOPE];
    if (SC.VALID_LOGOUT_SCOPES.includes(scope)) return scope;

    const migrated = SC.normalizeLogoutScope(sync);
    await chrome.storage.sync.set({ [SYNC_KEYS.LOGOUT_SCOPE]: migrated });
    if (sync[SYNC_KEYS.LEGACY_LOGOUT_SCOPE_SESSION] !== undefined) {
        await chrome.storage.sync.remove(SYNC_KEYS.LEGACY_LOGOUT_SCOPE_SESSION);
    }
    return migrated;
}

function bindSwitch(id, key, stored) {
    const input = $(id);
    input.checked = stored !== false;
    input.addEventListener('change', () => {
        chrome.storage.sync.set({ [key]: input.checked }).catch(warn('could not save setting'));
    });
}

async function initSiteSwitches() {
    const sync = await chrome.storage.sync.get(SC.SITES.map((s) => s.statusKey));
    for (const site of SC.SITES) {
        bindSwitch(`${site.id}-toggle`, site.statusKey, sync[site.statusKey]);
    }
}

async function initSettings(logoutScope) {
    const sync = await chrome.storage.sync.get([
        SYNC_KEYS.NOTIFICATION_STATUS,
        SYNC_KEYS.CLICK_DELAY_MS,
        SYNC_KEYS.KEEP_HISTORY,
    ]);
    bindSwitch('notification-toggle', SYNC_KEYS.NOTIFICATION_STATUS, sync[SYNC_KEYS.NOTIFICATION_STATUS]);

    const historyToggle = $('history-toggle');
    historyToggle.checked = sync[SYNC_KEYS.KEEP_HISTORY] !== false;
    historyToggle.addEventListener('change', async () => {
        await chrome.storage.sync.set({ [SYNC_KEYS.KEEP_HISTORY]: historyToggle.checked });
        if (!historyToggle.checked) await chrome.storage.local.remove(LOCAL_KEYS.ACTIVITY_LOG);
        if ($('activity-section').open) await renderLog();
    });

    const delaySelect = $('click-delay-select');
    const allowedDelays = [...delaySelect.options].map((o) => o.value);
    const rawDelay = sync[SYNC_KEYS.CLICK_DELAY_MS] != null ? String(sync[SYNC_KEYS.CLICK_DELAY_MS]) : '0';
    delaySelect.value = allowedDelays.includes(rawDelay) ? rawDelay : '0';
    if (!allowedDelays.includes(rawDelay)) {
        await chrome.storage.sync.set({ [SYNC_KEYS.CLICK_DELAY_MS]: 0 });
    }
    delaySelect.addEventListener('change', () => {
        chrome.storage.sync.set({ [SYNC_KEYS.CLICK_DELAY_MS]: Number(delaySelect.value) })
            .catch(warn('could not save delay'));
    });

    const scopeSelect = $('logout-scope-select');
    scopeSelect.value = logoutScope;
    scopeSelect.addEventListener('change', async () => {
        await chrome.storage.sync.set({ [SYNC_KEYS.LOGOUT_SCOPE]: scopeSelect.value });
        chrome.storage.session.remove(SESSION_KEYS.SUPPRESS_AUTO_LOGIN).catch(() => {});
    });

    await initShortcut();
}

async function initShortcut() {
    let shortcut = '';
    try {
        const commands = await chrome.commands.getAll();
        const command = commands.find((c) => c.name === PAUSE_COMMAND);
        shortcut = command && command.shortcut ? command.shortcut : '';
    } catch (err) {
        warn('could not read shortcuts')(err);
    }
    $('shortcut-desc').textContent = `Pause or resume everywhere: ${shortcut || 'not set'}`;
    const button = $('shortcut-btn');
    button.textContent = shortcut ? 'Change' : 'Set shortcut';
    button.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(warn('could not open shortcuts page'));
    });
}

// ─── Status card ────────────────────────────────────────────────────────────

const TONE_BY_BADGE = { active: 'green', pause: 'amber', off: 'grey', error: 'red', none: 'grey' };

async function refreshStatus() {
    const tab = await getActiveTab();
    const page = tab && tab.url ? SC.classifyUrl(tab.url) : { kind: 'off-domain', site: null };
    if (!tab || page.kind === 'off-domain') {
        renderStatus({
            tone: 'grey',
            title: 'Not a Moodle or Panopto page',
            detail: 'Auto-click runs on Cambridge Moodle and Panopto login pages.',
        });
        return;
    }
    let status = null;
    try {
        status = await chrome.tabs.sendMessage(tab.id, { type: 'get_status' });
    } catch (err) {
        status = null;
    }
    renderStatus(status ? await viewFor(status, page.site, tab) : viewReload(tab));
}

function viewReload(tab) {
    return {
        tone: 'amber',
        title: 'Reload to activate',
        detail: 'This tab was open before Skip Cam Login started.',
        primary: {
            label: 'Reload page',
            run: async () => {
                await chrome.tabs.reload(tab.id);
                window.close();
            },
        },
    };
}

async function readDelay() {
    const { [SYNC_KEYS.CLICK_DELAY_MS]: ms } = await chrome.storage.sync.get(SYNC_KEYS.CLICK_DELAY_MS);
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

async function sendToTab(tab, message) {
    return chrome.tabs.sendMessage(tab.id, message);
}

function resumeAction(tab, label, signIn) {
    return {
        label,
        run: async () => {
            await sendToTab(tab, { type: 'resume', signIn });
            if (signIn) window.close();
        },
    };
}

function pauseTabAction(tab) {
    return {
        label: 'Pause this tab',
        run: () => sendToTab(tab, { type: 'set_manual_pause', value: true }),
    };
}

async function viewFor(status, site, tab) {
    const login = status.kind === 'login';
    if (status.kind === 'logout') {
        return { tone: 'grey', title: `Signing out of ${site.name}`, detail: 'Auto-click stays paused after you sign out.' };
    }
    if (status.allow) {
        if (login && !status.attempted) {
            return {
                tone: 'green',
                title: 'Ready',
                detail: 'Auto-click was paused when this page loaded.',
                primary: resumeAction(tab, 'Sign in now', true),
                secondary: pauseTabAction(tab),
            };
        }
        const delay = login ? await readDelay() : 0;
        let detail = 'Next time you\'re signed out, it\'ll click the login button.';
        if (login) {
            detail = delay > 0
                ? `Will click the login button after ${SC.formatDelay(delay)}.`
                : 'Will click the login button.';
        }
        return { tone: 'green', title: login ? 'Ready' : 'On', detail, secondary: pauseTabAction(tab) };
    }

    const reason = REASONS[status.reason];
    if (!reason) return { tone: 'grey', title: 'Paused', detail: '' };
    const ctx = { siteName: site.name, pauseUntil: status.pauseUntil, now: Date.now() };
    const view = { tone: TONE_BY_BADGE[reason.badge], title: reason.title(ctx), detail: reason.detail(ctx) };

    switch (reason.action) {
        case 'resume':
            view.primary = resumeAction(tab, login ? 'Resume & sign in' : 'Resume', login);
            break;
        case 'retry':
            view.primary = resumeAction(tab, 'Try again', login);
            if (status.reason === 'loop-guard') view.report = reportUrl(site, status.reason);
            break;
        case 'enable-site':
            view.primary = {
                label: login ? 'Turn on & sign in' : `Turn on ${site.name}`,
                run: async () => {
                    await chrome.storage.sync.set({ [site.statusKey]: true });
                    if (login) await resumeAction(tab, '', true).run();
                },
            };
            break;
        case 'report':
            if (login) view.primary = resumeAction(tab, 'Try again', true);
            view.report = reportUrl(site, status.reason);
            break;
        default:
            break;
    }
    return view;
}

function reportUrl(site, reason) {
    return `${REPORT_URL}?title=${encodeURIComponent(`Login page problem: ${site.name} (${reason})`)}`;
}

function setAction(button, action) {
    button.hidden = !action;
    button.onclick = null;
    if (!action) return;
    button.textContent = action.label;
    button.disabled = false;
    button.onclick = async () => {
        button.disabled = true;
        try {
            await action.run();
        } catch (err) {
            warn('action failed')(err);
        }
        button.disabled = false;
        await refreshStatus();
    };
}

function renderStatus(view) {
    $('status').dataset.tone = view.tone;
    $('status-title').textContent = view.title;
    $('status-detail').textContent = view.detail || '';
    setAction($('status-primary'), view.primary);
    setAction($('status-secondary'), view.secondary);
    const report = $('status-report');
    report.hidden = !view.report;
    if (view.report) report.href = view.report;
    $('status-actions').hidden = !view.primary && !view.secondary && !view.report;
}

// ─── Pause everywhere ───────────────────────────────────────────────────────

let countdownTimer = null;

function initPauseButtons() {
    $('pause-btn').addEventListener('click', async () => {
        const value = $('pause-duration-select').value;
        const duration = Number(value);
        if (value !== 'restart' && !(duration > 0)) return;
        const until = value === 'restart' ? SC.PAUSE_UNTIL_RESTART : Date.now() + duration;
        await chrome.storage.session.set({ [SESSION_KEYS.PAUSE_UNTIL]: until });
        await refreshPause();
        $('resume-btn').focus();
    });
    $('resume-btn').addEventListener('click', async () => {
        await chrome.storage.session.remove(SESSION_KEYS.PAUSE_UNTIL);
        await refreshPause();
        $('pause-btn').focus();
    });
}

async function refreshPause() {
    const { [SESSION_KEYS.PAUSE_UNTIL]: until } = await chrome.storage.session.get(SESSION_KEYS.PAUSE_UNTIL);
    const active = Boolean(until && until > Date.now());
    $('pause-idle').hidden = active;
    $('pause-active').hidden = !active;
    clearInterval(countdownTimer);
    countdownTimer = null;
    if (!active) return;

    const remaining = $('pause-remaining');
    if (until === SC.PAUSE_UNTIL_RESTART) {
        remaining.textContent = 'Until Chrome closes';
        return;
    }
    const render = () => {
        if (until <= Date.now()) {
            refreshPause().catch(warn('pause refresh failed'));
            scheduleStatusRefresh();
            return;
        }
        remaining.textContent = `${SC.formatRemaining(until - Date.now())} · until ${SC.formatClockTime(until)}`;
    };
    render();
    countdownTimer = setInterval(render, 1000);
}

// ─── Activity ───────────────────────────────────────────────────────────────

function initActivity() {
    const section = $('activity-section');
    section.addEventListener('toggle', () => {
        if (section.open) renderLog().catch(warn('could not show activity'));
    });
    $('log-clear').addEventListener('click', async () => {
        await chrome.storage.local.remove(LOCAL_KEYS.ACTIVITY_LOG);
        await renderLog();
        section.querySelector('summary').focus();
    });
}

function relativeTime(ts) {
    const min = Math.floor(Math.max(0, Date.now() - ts) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
}

function renderEntry(entry) {
    const action = ['clicked', 'suppressed', 'failed'].includes(entry.action) ? entry.action : '';
    const item = el('li', action ? `log-entry ${action}` : 'log-entry');
    const dot = el('span', 'dot');
    dot.setAttribute('aria-hidden', 'true');
    const time = el('time', 'ts', Number.isFinite(entry.ts) ? relativeTime(entry.ts) : '—');
    if (Number.isFinite(entry.ts)) {
        const date = new Date(entry.ts);
        time.dateTime = date.toISOString();
        time.title = date.toLocaleString();
    }
    const body = el('span', 'body', `${entry.site || '—'} · ${SC.logLabel(entry)}`);
    item.append(dot, time, body);
    return item;
}

async function renderLog() {
    const [{ [LOCAL_KEYS.ACTIVITY_LOG]: log }, { [SYNC_KEYS.KEEP_HISTORY]: keep }] = await Promise.all([
        chrome.storage.local.get(LOCAL_KEYS.ACTIVITY_LOG),
        chrome.storage.sync.get(SYNC_KEYS.KEEP_HISTORY),
    ]);
    const entries = keep === false || !Array.isArray(log) ? [] : log;
    const list = $('log-list');
    let empty = 'No activity yet.';
    if (keep === false) empty = 'Activity history is off. Turn it on in Settings.';
    list.replaceChildren(...(entries.length ? entries.map(renderEntry) : [el('li', 'log-empty', empty)]));
    $('log-clear').hidden = entries.length === 0;
}

// ─── Live updates while the popup is open ───────────────────────────────────

let statusTimer = null;

function scheduleStatusRefresh() {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => refreshStatus().catch(warn('status refresh failed')), 150);
}

function onStorageChanged(changes, area) {
    if (area === 'sync') {
        for (const site of SC.SITES) {
            if (site.statusKey in changes) $(`${site.id}-toggle`).checked = changes[site.statusKey].newValue !== false;
        }
        if (SYNC_KEYS.KEEP_HISTORY in changes) {
            $('history-toggle').checked = changes[SYNC_KEYS.KEEP_HISTORY].newValue !== false;
        }
        scheduleStatusRefresh();
    } else if (area === 'session') {
        if (SESSION_KEYS.PAUSE_UNTIL in changes) refreshPause().catch(warn('pause refresh failed'));
        scheduleStatusRefresh();
    } else if (area === 'local') {
        if (LOCAL_KEYS.ACTIVITY_LOG in changes && $('activity-section').open) {
            renderLog().catch(warn('could not show activity'));
        }
        if (LOCAL_KEYS.CLICKS_SAVED in changes) renderCounter().catch(warn('counter failed'));
    }
}
