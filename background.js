'use strict';

const NOTIFICATION_COOLDOWN_MS = 5000;
const NOTIFICATION_ID = 'kill-cam-login-skipped';

chrome.runtime.onMessage.addListener((request) => {
    if (request?.type !== 'login_clicked') return false;
    handleLoginClicked(request.siteName).catch((err) => {
        console.warn('background: failed to show notification', err);
    });
    return false;
});

async function handleLoginClicked(siteName) {
    const { notification_status } = await chrome.storage.sync.get('notification_status');
    if (notification_status === false) return;

    const { last_notification_time = 0 } = await chrome.storage.session.get('last_notification_time');
    const now = Date.now();
    if (now - last_notification_time < NOTIFICATION_COOLDOWN_MS) return;

    await chrome.storage.session.set({ last_notification_time: now });
    chrome.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Login Skipped',
        message: `Login button on ${siteName} clicked automatically.`,
    });
}
