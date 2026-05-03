'use strict';

const TOGGLES = [
    { id: 't-moodle', key: 'moodle_status' },
    { id: 't-panopto', key: 'panopto_status' },
    { id: 't-notif', key: 'notification_status' },
];

document.addEventListener('DOMContentLoaded', async () => {
    const flash = document.getElementById('saved-flash');
    let flashTimer = null;

    const showSaved = () => {
        flash.classList.add('show');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => flash.classList.remove('show'), 1200);
    };

    const keys = TOGGLES.map((t) => t.key);
    const stored = await chrome.storage.sync.get(keys);

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
