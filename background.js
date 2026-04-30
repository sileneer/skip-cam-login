'use strict';

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((err) => console.warn('background: failed to set storage.session access level', err));

const tabStates = new Map();

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
    return false;
});

const WATCHED_SYNC_KEYS = ['moodle_status', 'panopto_status', 'logout_scope', 'logout_scope_session', 'click_delay_ms'];
const WATCHED_SESSION_KEYS = ['suppress_auto_login', 'pause_until'];

chrome.storage.onChanged.addListener((changes, area) => {
    const triggered =
        (area === 'sync' && WATCHED_SYNC_KEYS.some((k) => k in changes)) ||
        (area === 'session' && WATCHED_SESSION_KEYS.some((k) => k in changes));
    if (!triggered) return;
    requestReevaluateAll();
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
