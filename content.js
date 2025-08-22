'use strict';

const SITES = [
    {
        name: 'Moodle',
        match: (url) => url.startsWith('https://www.vle.cam.ac.uk/login'),
        selector: 'a.btn.btn-secondary',
        statusKey: 'moodle_status',
    },
    {
        name: 'Panopto',
        match: (url) => url.startsWith('https://cambridgelectures.cloud.panopto.eu/Panopto/Pages/Auth/Login.aspx'),
        selector: '#PageContentPlaceholder_loginControl_externalLoginButton',
        statusKey: 'panopto_status',
    },
];

const OBSERVER_TIMEOUT_MS = 10000;

(async () => {
    const site = SITES.find((s) => s.match(window.location.href));
    if (!site) return;

    const settings = await chrome.storage.sync.get(site.statusKey);
    if (settings[site.statusKey] === false) {
        console.log(`Auto Clicker: ${site.name} disabled in settings`);
        return;
    }

    if (document.visibilityState === 'visible') {
        runAutoClick(site);
    } else {
        document.addEventListener('visibilitychange', function onVisible() {
            if (document.visibilityState !== 'visible') return;
            document.removeEventListener('visibilitychange', onVisible);
            runAutoClick(site);
        });
    }
})();

function runAutoClick(site) {
    if (tryClick(site)) return;

    const observer = new MutationObserver(() => {
        if (tryClick(site)) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), OBSERVER_TIMEOUT_MS);
}

function tryClick(site) {
    const target = document.querySelector(site.selector);
    if (!target || typeof target.click !== 'function') return false;

    target.click();
    console.log(`Auto Clicker: clicked ${site.name} login button`);

    chrome.runtime.sendMessage({
        type: 'login_clicked',
        siteName: site.name,
    }).catch((err) => {
        console.warn('Auto Clicker: failed to notify background', err);
    });

    return true;
}
