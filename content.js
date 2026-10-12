'use strict';

const SC = globalThis.SkipCam;
const { SYNC_KEYS, SESSION_KEYS, TAB_KEYS, REASONS } = SC;

const OBSERVER_TIMEOUT_MS = 10000;
const SESSION_RETRY_MS = 300;
const MAX_TIMER_MS = 2 ** 31 - 1;
const CLEARABLE_BY_CLICK = new Set(['logout-tab', 'logout-session', 'manual-tab', 'loop-guard']);

let outcome = null;          // failure reason from this page load's click attempt
let attempted = false;       // an auto-click started on this page load
let clickInFlight = false;
let expiryTimer = null;
let clearListenerAttached = false;

chrome.runtime.onMessage.addListener(onMessage);
start().catch((err) => console.warn('Skip Cam Login: error', err));

function currentPage() {
    return SC.classifyUrl(window.location.href);
}

async function start() {
    const page = currentPage();
    if (page.kind === 'off-domain') return;

    if (page.kind === 'logout') {
        await markLoggedOut();
        console.log(`Skip Cam Login: ${page.site.name} sign-out page, auto-click paused`);
        notifyState(page, 'none', 'none');
        return;
    }

    if (page.kind === 'site') {
        installLogoutInterceptor(page.site);
        await reevaluateNow();
        return;
    }

    if (document.referrer && SC.classifyUrl(document.referrer).kind === 'logout') {
        await markLoggedOut();
    }

    const decision = await evaluate(page);
    if (!decision.allow) {
        handleDenied(page, decision);
        return;
    }
    report(page, decision);
    whenVisible(() => runAutoClick(page.site));
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

async function readSession(keys) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await chrome.storage.session.get(keys);
        } catch (err) {
            console.warn('Skip Cam Login: could not read session storage', err);
            if (attempt === 0) await sleep(SESSION_RETRY_MS);
        }
    }
    return null;
}

async function evaluate(page) {
    let sync;
    try {
        sync = await chrome.storage.sync.get([
            page.site.statusKey,
            SYNC_KEYS.LOGOUT_SCOPE,
            SYNC_KEYS.LEGACY_LOGOUT_SCOPE_SESSION,
        ]);
    } catch (err) {
        console.warn('Skip Cam Login: could not read settings', err);
        return { allow: false, reason: 'state-unavailable', pauseUntil: null };
    }

    const session = await readSession([SESSION_KEYS.PAUSE_UNTIL, SESSION_KEYS.SUPPRESS_AUTO_LOGIN]);
    const now = Date.now();
    const pauseUntil = session ? session[SESSION_KEYS.PAUSE_UNTIL] : undefined;
    if (pauseUntil && pauseUntil <= now) {
        chrome.storage.session.remove(SESSION_KEYS.PAUSE_UNTIL).catch(() => {});
    }

    const decision = SC.decideSuppression({
        siteEnabled: sync[page.site.statusKey] !== false,
        sessionUnavailable: session === null,
        pauseUntil,
        now,
        logoutScope: SC.normalizeLogoutScope(sync),
        sessionLogoutFlag: session ? session[SESSION_KEYS.SUPPRESS_AUTO_LOGIN] === true : false,
        tabLogoutFlag: tabFlagGet(TAB_KEYS.LOGOUT_FLAG),
        tabManualPause: tabFlagGet(TAB_KEYS.MANUAL_PAUSE),
        // The loop guard only matters where a click would happen.
        recentAutoClicks: page.kind === 'login' ? readClickHistory() : [],
    });
    return { ...decision, pauseUntil: pauseUntil || null };
}

function effectiveReason(decision) {
    return decision.allow && outcome ? outcome : decision.reason;
}

function report(page, decision) {
    const reason = effectiveReason(decision);
    const state = reason === 'allowed' ? 'active' : REASONS[reason].badge;
    notifyState(page, state, reason);
}

function handleDenied(page, decision) {
    console.log(`Skip Cam Login: ${page.site.name} skipped (${decision.reason})`);
    report(page, decision);
    sendLog({ action: 'suppressed', reason: decision.reason });
    if (page.kind === 'login' && CLEARABLE_BY_CLICK.has(decision.reason)) attachClearOnClick(page.site);
    scheduleExpiryRecheck(decision);
}

async function reevaluateNow() {
    const page = currentPage();
    if (page.kind === 'off-domain' || page.kind === 'logout') {
        notifyState(page, 'none', 'none');
        return null;
    }
    const decision = await evaluate(page);
    report(page, decision);
    scheduleExpiryRecheck(decision);
    if (page.kind === 'login' && !decision.allow && CLEARABLE_BY_CLICK.has(decision.reason)) {
        attachClearOnClick(page.site);
    }
    return decision;
}

// A timed pause ends without any storage event, so re-check when it expires.
// Expiry only refreshes the badge; it never clicks.
function scheduleExpiryRecheck(decision) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
    if (decision.reason !== 'timed-pause' || !decision.pauseUntil) return;
    if (decision.pauseUntil === SC.PAUSE_UNTIL_RESTART) return;
    const wait = Math.min(decision.pauseUntil - Date.now() + 1000, MAX_TIMER_MS);
    expiryTimer = setTimeout(() => {
        reevaluateNow().catch((err) => console.warn('Skip Cam Login: re-check failed', err));
    }, Math.max(wait, 0));
}

function notifyState(page, state, reason) {
    const kind = page.kind === 'off-domain' ? undefined : page.kind;
    chrome.runtime.sendMessage({ type: 'state_update', state, reason, kind })
        .catch(() => { /* service worker not ready; ignore */ });
}

function sendLog(entry) {
    chrome.runtime.sendMessage({ type: 'append_log', entry }).catch(() => {});
}

// ─── Per-tab flags (sessionStorage: this tab, this origin) ──────────────────

function tabFlagGet(key) {
    try { return sessionStorage.getItem(key) === '1'; } catch (err) { return false; }
}

function tabFlagSet(key) {
    try { sessionStorage.setItem(key, '1'); } catch (err) {}
}

function tabFlagClear(key) {
    try { sessionStorage.removeItem(key); } catch (err) {}
}

function readClickHistory() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(TAB_KEYS.CLICK_HISTORY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function recordClick() {
    const now = Date.now();
    const history = SC.recentClicks(readClickHistory(), now);
    history.push(now);
    try { sessionStorage.setItem(TAB_KEYS.CLICK_HISTORY, JSON.stringify(history)); } catch (err) {}
}

async function markLoggedOut() {
    tabFlagSet(TAB_KEYS.LOGOUT_FLAG);
    try {
        const sync = await chrome.storage.sync.get([
            SYNC_KEYS.LOGOUT_SCOPE,
            SYNC_KEYS.LEGACY_LOGOUT_SCOPE_SESSION,
        ]);
        if (SC.normalizeLogoutScope(sync) === 'off') return;
        await chrome.storage.session.set({ [SESSION_KEYS.SUPPRESS_AUTO_LOGIN]: true });
    } catch (err) {
        console.warn('Skip Cam Login: could not record sign-out', err);
    }
}

// Same effect as clicking the login button yourself.
async function clearSuppression() {
    tabFlagClear(TAB_KEYS.LOGOUT_FLAG);
    tabFlagClear(TAB_KEYS.MANUAL_PAUSE);
    tabFlagClear(TAB_KEYS.CLICK_HISTORY);
    outcome = null;
    try {
        await chrome.storage.session.remove(SESSION_KEYS.SUPPRESS_AUTO_LOGIN);
    } catch (err) {
        console.warn('Skip Cam Login: could not clear sign-out pause', err);
    }
}

// ─── Clicking ───────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function whenVisible(fn) {
    if (document.visibilityState === 'visible') {
        fn();
        return;
    }
    document.addEventListener('visibilitychange', function onVisible() {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', onVisible);
        fn();
    });
}

async function readClickDelay() {
    try {
        const { [SYNC_KEYS.CLICK_DELAY_MS]: ms } = await chrome.storage.sync.get(SYNC_KEYS.CLICK_DELAY_MS);
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
    } catch (err) {
        return 0;
    }
}

function describeTarget(el) {
    const tag = el.tagName;
    let formAction = '';
    if (tag !== 'A' && el.form) {
        formAction = el.hasAttribute('formaction') ? el.formAction : el.form.action;
    }
    return { tagName: tag, href: tag === 'A' ? el.href : '', type: el.type || '', formAction };
}

function distinctDestinations(elements) {
    return new Set(elements.map((el) => SC.targetDestination(describeTarget(el)))).size;
}

function findTarget(site) {
    const matches = [...document.querySelectorAll(site.target.selector)];
    if (matches.length === 0) return { ok: false, reason: 'button-not-found' };
    const safe = matches.filter((el) =>
        SC.isSafeLoginTarget(describeTarget(el), site.target, window.location.origin));
    if (safe.length === 0) return { ok: false, reason: 'unsafe-target' };
    let pool = safe;
    if (distinctDestinations(pool) > 1) pool = pool.filter((el) => el.getClientRects().length > 0);
    if (pool.length === 0 || distinctDestinations(pool) > 1) return { ok: false, reason: 'ambiguous-target' };
    return { ok: true, el: pool[0] };
}

function waitForTarget(site) {
    return new Promise((resolve) => {
        let last = findTarget(site);
        if (last.ok) {
            resolve(last);
            return;
        }
        const observer = new MutationObserver(() => {
            last = findTarget(site);
            if (last.ok) finish();
        });
        const timer = setTimeout(finish, OBSERVER_TIMEOUT_MS);
        function finish() {
            observer.disconnect();
            clearTimeout(timer);
            resolve(last);
        }
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'class', 'id'],
        });
    });
}

async function runAutoClick(site, { skipDelay = false } = {}) {
    if (clickInFlight) return;
    clickInFlight = true;
    attempted = true;
    try {
        if (!skipDelay) {
            const delay = await readClickDelay();
            if (delay > 0) await sleep(delay);
        }

        const found = await waitForTarget(site);
        const page = currentPage();
        if (!found.ok) {
            outcome = found.reason;
            console.log(`Skip Cam Login: ${site.name} not clicked (${found.reason})`);
            report(page, { allow: true, reason: 'allowed' });
            sendLog({ action: 'failed', reason: found.reason });
            return;
        }

        // A pause may have been set during the delay or the wait; honour it.
        const decision = await evaluate(page);
        if (!decision.allow) {
            handleDenied(page, decision);
            return;
        }

        found.el.click();
        recordClick();
        outcome = null;
        console.log(`Skip Cam Login: clicked the ${site.name} login button`);
        chrome.runtime.sendMessage({ type: 'login_clicked' })
            .catch((err) => console.warn('Skip Cam Login: could not notify background', err));
    } finally {
        clickInFlight = false;
    }
}

function installLogoutInterceptor(site) {
    if (!site.logoutButtonSelector) return;
    document.addEventListener('click', (event) => {
        const target = event.target instanceof Element && event.target.closest(site.logoutButtonSelector);
        if (target) {
            console.log(`Skip Cam Login: ${site.name} sign-out clicked, auto-click paused`);
            markLoggedOut();
        }
    }, { capture: true });
}

// Clicking the login button yourself clears tab and sign-out pauses and the
// loop guard. Only real (trusted) clicks count, never our own.
function attachClearOnClick(site) {
    if (clearListenerAttached) return;
    clearListenerAttached = true;
    document.addEventListener('click', (event) => {
        if (!event.isTrusted) return;
        if (!(event.target instanceof Element) || !event.target.closest(site.target.selector)) return;
        clearSuppression().catch((err) => console.warn('Skip Cam Login: clear failed', err));
    }, { capture: true });
}

// ─── Popup messages ─────────────────────────────────────────────────────────

async function getStatus() {
    const page = currentPage();
    if (page.kind === 'off-domain' || page.kind === 'logout') {
        return { kind: page.kind, siteId: page.site ? page.site.id : null };
    }
    const decision = await evaluate(page);
    const reason = effectiveReason(decision);
    return {
        kind: page.kind,
        siteId: page.site.id,
        allow: reason === 'allowed',
        reason,
        pauseUntil: decision.pauseUntil,
        attempted,
    };
}

async function resume(signIn) {
    await clearSuppression();
    const decision = await reevaluateNow();
    const page = currentPage();
    if (signIn && page.kind === 'login' && decision && decision.allow) {
        runAutoClick(page.site, { skipDelay: true });
    }
    return getStatus();
}

function onMessage(request, sender, sendResponse) {
    if (!sender || sender.id !== chrome.runtime.id) return false;
    const reply = (promise) => {
        promise.then(sendResponse, (err) => {
            console.warn('Skip Cam Login: message failed', err);
            sendResponse(null);
        });
        return true;
    };
    switch (request && request.type) {
        case 'reevaluate':
            return reply(reevaluateNow().then(() => ({})));
        case 'get_status':
            return reply(getStatus());
        case 'set_manual_pause':
            if (request.value) tabFlagSet(TAB_KEYS.MANUAL_PAUSE);
            else tabFlagClear(TAB_KEYS.MANUAL_PAUSE);
            return reply(reevaluateNow().then(getStatus));
        case 'resume':
            return reply(resume(request.signIn === true));
        default:
            return false;
    }
}
