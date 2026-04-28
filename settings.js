'use strict';

const VALID_SCOPES = ['session', 'tab', 'off'];

document.addEventListener('DOMContentLoaded', async () => {
    const moodleToggle = document.getElementById('moodle-toggle');
    const panoptoToggle = document.getElementById('panopto-toggle');
    const notificationToggle = document.getElementById('notification-toggle');
    const logoutScopeSelect = document.getElementById('logout-scope-select');

    const settings = await chrome.storage.sync.get([
        'moodle_status',
        'panopto_status',
        'notification_status',
        'logout_scope',
        'logout_scope_session',
    ]);

    let logoutScope = settings.logout_scope;
    if (!VALID_SCOPES.includes(logoutScope)) {
        logoutScope = settings.logout_scope_session === false ? 'tab' : 'session';
        await chrome.storage.sync.set({ logout_scope: logoutScope });
        if (settings.logout_scope_session !== undefined) {
            await chrome.storage.sync.remove('logout_scope_session');
        }
    }

    moodleToggle.checked = settings.moodle_status !== false;
    panoptoToggle.checked = settings.panopto_status !== false;
    notificationToggle.checked = settings.notification_status !== false;
    logoutScopeSelect.value = logoutScope;

    moodleToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ moodle_status: moodleToggle.checked });
    });
    panoptoToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ panopto_status: panoptoToggle.checked });
    });
    notificationToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ notification_status: notificationToggle.checked });
    });
    logoutScopeSelect.addEventListener('change', async () => {
        await chrome.storage.sync.set({ logout_scope: logoutScopeSelect.value });
        chrome.storage.session.remove('suppress_auto_login').catch(() => {});
    });
});
