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

function tooltipFor(state, reason, clickDelayMs) {
    const base = 'Skip Cam Login';
    if (state === 'active') {
        const tail = clickDelayMs > 0
            ? ` Will auto-click after ${clickDelayMs}ms.`
            : ' Will auto-click on this page.';
        return base + ' —' + tail;
    }
    if (state === 'off') return base + ' — Disabled in settings for this site.';
    if (state === 'pause') {
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
        if (cfg.text) {
            await chrome.action.setBadgeBackgroundColor({ tabId, color: cfg.color });
        }
        await chrome.action.setTitle({
            tabId,
            title: tooltipFor(info.state, info.reason, info.clickDelayMs),
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
        chrome.storage.sync.get('click_delay_ms').then(({ click_delay_ms = 0 }) => {
            const info = {
                state: request.state,
                reason: request.reason,
                clickDelayMs: Number.isFinite(click_delay_ms) ? click_delay_ms : 0,
            };
            tabStates.set(tabId, info);
            applyBadge(tabId, info);
            sendResponse({});
        });
        return true;
    }
    return false;
});

async function handleLoginClicked(siteName) {
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
