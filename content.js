'use strict';

const SITES = [
    {
        name: 'Moodle',
        isLogin: (url) =>
            url.startsWith('https://www.vle.cam.ac.uk/login') &&
            !url.startsWith('https://www.vle.cam.ac.uk/login/logout.php'),
        isLogout: (url) => url.startsWith('https://www.vle.cam.ac.uk/login/logout.php'),
        isAuthenticatedPage: () => false,
        loginButtonSelector: 'a.btn.btn-secondary',
        logoutButtonSelector: null,
        statusKey: 'moodle_status',
    },
    {
        name: 'Panopto',
        isLogin: (url) => url.startsWith('https://cambridgelectures.cloud.panopto.eu/Panopto/Pages/Auth/Login.aspx'),
        isLogout: () => false,
        isAuthenticatedPage: (url) =>
            url.startsWith('https://cambridgelectures.cloud.panopto.eu/Panopto/') &&
            !url.startsWith('https://cambridgelectures.cloud.panopto.eu/Panopto/Pages/Auth/'),
        loginButtonSelector: '#PageContentPlaceholder_loginControl_externalLoginButton',
        logoutButtonSelector: 'a.logout-button, a[id$="_Logout"], a[href*="__doPostBack"][href*="Logout"]',
        statusKey: 'panopto_status',
    },
];

const OBSERVER_TIMEOUT_MS = 10000;
const SESSION_FLAG_KEY = 'suppress_auto_login';
const TAB_FLAG_KEY = 'skipcam_suppress_auto_login';
const MANUAL_PAUSE_KEY = 'skipcam_manual_pause';

(async () => {
    try {
        const url = window.location.href;
        const site = SITES.find((s) =>
            s.isLogin(url) || s.isLogout(url) || s.isAuthenticatedPage(url));
        if (!site) return;

        if (site.isLogout(url)) {
            markLoggedOut();
            console.log(`Auto Clicker: detected ${site.name} logout URL, suppression armed`);
            return;
        }

        if (site.isAuthenticatedPage(url)) {
            notifyState('none', 'authenticated');
            installLogoutInterceptor(site);
            return;
        }

        // Login page from here on.
        if (document.referrer && SITES.some((s) => s.isLogout(document.referrer))) {
            markLoggedOut();
        }

        const evaluation = await evaluateSuppression(site);
        if (!evaluation.allow) {
            console.log(`Auto Clicker: ${site.name} suppressed (${evaluation.reason})`);
            const state = evaluation.reason === 'site-disabled' ? 'off' : 'pause';
            notifyState(state, evaluation.reason);
            if (shouldAttachClearOnClick(evaluation.reason)) {
                attachClearOnClick(site);
            }
            return;
        }

        notifyState('active', 'allowed');

        if (document.visibilityState === 'visible') {
            runAutoClick(site);
        } else {
            document.addEventListener('visibilitychange', function onVisible() {
                if (document.visibilityState !== 'visible') return;
                document.removeEventListener('visibilitychange', onVisible);
                runAutoClick(site);
            });
        }
    } catch (err) {
        console.warn('Auto Clicker: error', err);
    }
})();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type === 'reevaluate') {
        reevaluateNow().finally(() => sendResponse({}));
        return true;
    }
    if (request?.type === 'get_manual_pause_state') {
        let paused = false;
        try { paused = sessionStorage.getItem(MANUAL_PAUSE_KEY) === '1'; } catch (err) {}
        sendResponse({ paused });
        return false;
    }
    if (request?.type === 'set_manual_pause') {
        try {
            if (request.value) sessionStorage.setItem(MANUAL_PAUSE_KEY, '1');
            else sessionStorage.removeItem(MANUAL_PAUSE_KEY);
        } catch (err) {}
        reevaluateNow().finally(() => sendResponse({}));
        return true;
    }
    return false;
});

async function reevaluateNow() {
    const url = window.location.href;
    const site = SITES.find((s) =>
        s.isLogin(url) || s.isLogout(url) || s.isAuthenticatedPage(url));
    if (!site) {
        notifyState('none', 'off-domain');
        return;
    }
    if (site.isLogout(url)) {
        notifyState('none', 'logout-page');
        return;
    }
    if (site.isAuthenticatedPage(url)) {
        notifyState('none', 'authenticated');
        return;
    }
    const evaluation = await evaluateSuppression(site);
    if (!evaluation.allow) {
        const state = evaluation.reason === 'site-disabled' ? 'off' : 'pause';
        notifyState(state, evaluation.reason);
    } else {
        notifyState('active', 'allowed');
    }
}

function markLoggedOut() {
    try { sessionStorage.setItem(TAB_FLAG_KEY, '1'); } catch (err) {}
    setSessionFlagIfEnabled();
}

async function setSessionFlagIfEnabled() {
    try {
        const sync = await chrome.storage.sync.get(['logout_scope', 'logout_scope_session']);
        const scope = normalizeLogoutScope(sync);
        if (scope === 'off') return;
        await chrome.storage.session.set({ [SESSION_FLAG_KEY]: true });
    } catch (err) {
        console.warn('Auto Clicker: failed to set session flag', err);
    }
}

async function clearSuppression() {
    try { sessionStorage.removeItem(TAB_FLAG_KEY); } catch (err) {}
    try { sessionStorage.removeItem(MANUAL_PAUSE_KEY); } catch (err) {}
    try {
        await chrome.storage.session.remove(SESSION_FLAG_KEY);
    } catch (err) {
        console.warn('Auto Clicker: failed to clear session flag', err);
    }
}

async function evaluateSuppression(site) {
    const sync = await chrome.storage.sync.get([site.statusKey, 'logout_scope', 'logout_scope_session']);

    if (sync[site.statusKey] === false) {
        return { allow: false, reason: 'site-disabled' };
    }

    const session = await chrome.storage.session.get(['pause_until', SESSION_FLAG_KEY]);
    if (session.pause_until) {
        if (session.pause_until > Date.now()) {
            return { allow: false, reason: 'timed-pause' };
        }
        chrome.storage.session.remove('pause_until').catch(() => {});
    }

    const scope = normalizeLogoutScope(sync);

    if (scope === 'session' && session[SESSION_FLAG_KEY] === true) {
        return { allow: false, reason: 'logout-session' };
    }

    let logoutTabFlag = false;
    try { logoutTabFlag = sessionStorage.getItem(TAB_FLAG_KEY) === '1'; } catch (err) {}
    if (scope !== 'off' && logoutTabFlag) {
        return { allow: false, reason: 'logout-tab' };
    }

    let manualPause = false;
    try { manualPause = sessionStorage.getItem(MANUAL_PAUSE_KEY) === '1'; } catch (err) {}
    if (manualPause) {
        return { allow: false, reason: 'manual-tab' };
    }

    return { allow: true, reason: 'allowed' };
}

function normalizeLogoutScope({ logout_scope, logout_scope_session }) {
    if (logout_scope === 'session' || logout_scope === 'tab' || logout_scope === 'off') {
        return logout_scope;
    }
    return logout_scope_session === false ? 'tab' : 'session';
}

function shouldAttachClearOnClick(reason) {
    return reason === 'logout-tab'
        || reason === 'logout-session'
        || reason === 'manual-tab';
}

function installLogoutInterceptor(site) {
    document.addEventListener('click', (event) => {
        const target = event.target.closest && event.target.closest(site.logoutButtonSelector);
        if (target) {
            console.log(`Auto Clicker: ${site.name} sign-out clicked, suppression armed`);
            markLoggedOut();
        }
    }, { capture: true });
}

function attachClearOnClick(site) {
    const attach = (target) => {
        target.addEventListener('click', () => {
            clearSuppression().catch((err) => console.warn('Auto Clicker: clear failed', err));
        }, { once: true });
    };

    const existing = document.querySelector(site.loginButtonSelector);
    if (existing) {
        attach(existing);
        return;
    }

    const observer = new MutationObserver(() => {
        const target = document.querySelector(site.loginButtonSelector);
        if (target) {
            attach(target);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), OBSERVER_TIMEOUT_MS);
}

async function runAutoClick(site) {
    const { click_delay_ms } = await chrome.storage.sync.get('click_delay_ms');
    const delay = Number.isFinite(click_delay_ms) && click_delay_ms > 0 ? click_delay_ms : 0;
    if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (tryClick(site)) return;

    const observer = new MutationObserver(() => {
        if (tryClick(site)) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), OBSERVER_TIMEOUT_MS);
}

function notifyState(state, reason) {
    chrome.runtime.sendMessage({ type: 'state_update', state, reason })
        .catch(() => { /* background not ready; ignore */ });
}

function tryClick(site) {
    const target = document.querySelector(site.loginButtonSelector);
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
