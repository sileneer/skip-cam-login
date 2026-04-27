'use strict';

chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((err) => console.warn('background: failed to set storage.session access level', err));

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type !== 'login_clicked') return false;
    handleLoginClicked(request.siteName)
        .catch((err) => console.warn('background: failed to handle login_clicked', err))
        .finally(() => sendResponse({}));
    return true;
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
