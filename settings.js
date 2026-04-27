'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const moodleToggle = document.getElementById('moodle-toggle');
    const panoptoToggle = document.getElementById('panopto-toggle');
    const notificationToggle = document.getElementById('notification-toggle');
    const logoutScopeToggle = document.getElementById('logout-scope-toggle');

    const settings = await chrome.storage.sync.get([
        'moodle_status',
        'panopto_status',
        'notification_status',
        'logout_scope_session',
    ]);

    moodleToggle.checked = settings.moodle_status !== false;
    panoptoToggle.checked = settings.panopto_status !== false;
    notificationToggle.checked = settings.notification_status !== false;
    logoutScopeToggle.checked = settings.logout_scope_session !== false;

    moodleToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ moodle_status: moodleToggle.checked });
    });
    panoptoToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ panopto_status: panoptoToggle.checked });
    });
    notificationToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ notification_status: notificationToggle.checked });
    });
    logoutScopeToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ logout_scope_session: logoutScopeToggle.checked });
    });
});
