'use strict';

const { SYNC_KEYS } = globalThis.SkipCam;

const TOGGLES = [
    { id: 't-moodle', key: SYNC_KEYS.MOODLE_STATUS },
    { id: 't-panopto', key: SYNC_KEYS.PANOPTO_STATUS },
    { id: 't-notif', key: SYNC_KEYS.NOTIFICATION_STATUS },
];

document.addEventListener('DOMContentLoaded', async () => {
    initPinHint();

    const flash = document.getElementById('saved-flash');
    let flashTimer = null;
    const showSaved = () => {
        flash.classList.add('show');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => flash.classList.remove('show'), 1200);
    };

    const stored = await chrome.storage.sync.get(TOGGLES.map((t) => t.key));
    for (const { id, key } of TOGGLES) {
        const input = document.getElementById(id);
        if (!input) continue;
        input.checked = stored[key] !== false;
        input.addEventListener('change', () => {
            chrome.storage.sync.set({ [key]: input.checked });
            showSaved();
        });
    }
});

// The badge is only visible when the action is pinned to the toolbar.
function initPinHint() {
    const hint = document.getElementById('pin-hint');
    if (!hint || !chrome.action || typeof chrome.action.getUserSettings !== 'function') return;

    const show = (isOnToolbar) => { hint.hidden = isOnToolbar !== false; };
    const check = () => chrome.action.getUserSettings()
        .then((settings) => show(settings.isOnToolbar))
        .catch(() => show(true));

    check();
    if (chrome.action.onUserSettingsChanged) {
        chrome.action.onUserSettingsChanged.addListener((change) => {
            if ('isOnToolbar' in change) show(change.isOnToolbar);
        });
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
    });
}
