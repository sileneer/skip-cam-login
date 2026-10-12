'use strict';

// Shared constants and pure helpers for every extension context.
// Loaded as a classic script: importScripts() in the service worker, before
// content.js in the manifest content_scripts list, via <script> tags in the
// extension pages, and via require() in tests/. Keep it free of top-level
// chrome.* / window / document access.

const SKIP_CAM_SYNC_KEYS = Object.freeze({
    MOODLE_STATUS: 'moodle_status',
    PANOPTO_STATUS: 'panopto_status',
    NOTIFICATION_STATUS: 'notification_status',
    LOGOUT_SCOPE: 'logout_scope',
    LEGACY_LOGOUT_SCOPE_SESSION: 'logout_scope_session',
    CLICK_DELAY_MS: 'click_delay_ms',
    LEGACY_PAUSED_HOSTS: 'paused_hosts',
    KEEP_HISTORY: 'keep_history',
});

const SKIP_CAM_VALID_LOGOUT_SCOPES = Object.freeze(['session', 'tab', 'off']);

// Sentinel pause_until value meaning "until Chrome closes" (session storage
// is cleared on browser restart and on extension update).
const SKIP_CAM_PAUSE_UNTIL_RESTART = Number.MAX_SAFE_INTEGER;

const SKIP_CAM_LOOP_WINDOW_MS = 2 * 60 * 1000;
const SKIP_CAM_LOOP_MAX_AUTO_CLICKS = 2;

const SKIP_CAM_SITES = Object.freeze([
    Object.freeze({
        id: 'moodle',
        name: 'Moodle',
        origin: 'https://www.vle.cam.ac.uk',
        host: 'www.vle.cam.ac.uk',
        pattern: 'https://www.vle.cam.ac.uk/*',
        statusKey: SKIP_CAM_SYNC_KEYS.MOODLE_STATUS,
        target: Object.freeze({
            selector: 'a.btn.btn-secondary',
            allowPostback: false,
            allowCambridgeHosts: true,
        }),
        logoutButtonSelector: null,
    }),
    Object.freeze({
        id: 'panopto',
        name: 'Panopto',
        origin: 'https://cambridgelectures.cloud.panopto.eu',
        host: 'cambridgelectures.cloud.panopto.eu',
        pattern: 'https://cambridgelectures.cloud.panopto.eu/Panopto/*',
        statusKey: SKIP_CAM_SYNC_KEYS.PANOPTO_STATUS,
        target: Object.freeze({
            selector: '#PageContentPlaceholder_loginControl_externalLoginButton',
            allowPostback: true,
            allowCambridgeHosts: true,
        }),
        logoutButtonSelector: 'a.logout-button, a[id$="_Logout"], a[href*="__doPostBack"][href*="Logout"]',
    }),
]);

// ─── URL classification ─────────────────────────────────────────────────────

function skipCamClassifyUrl(href) {
    let url;
    try { url = new URL(href); } catch (err) { return { kind: 'off-domain', site: null }; }
    const site = SKIP_CAM_SITES.find((s) => s.origin === url.origin);
    if (!site) return { kind: 'off-domain', site: null };

    if (site.id === 'moodle') {
        const path = url.pathname;
        if (path === '/login/logout.php') return { kind: 'logout', site };
        if (path === '/login/index.php' || path === '/login/') return { kind: 'login', site };
        return { kind: 'site', site };
    }

    // Panopto (ASP.NET): paths are case-insensitive.
    const path = url.pathname.toLowerCase();
    if (!path.startsWith('/panopto/')) return { kind: 'off-domain', site: null };
    if (path === '/panopto/pages/auth/login.aspx') return { kind: 'login', site };
    return { kind: 'site', site };
}

// ─── Click-target safety ────────────────────────────────────────────────────

const SKIP_CAM_POSTBACK_HREF = /^javascript:\s*(?:__doPostBack|WebForm_DoPostBackWithOptions)\(/;

function skipCamIsCambridgeHost(hostname) {
    return hostname === 'cam.ac.uk' || hostname.endsWith('.cam.ac.uk');
}

// target: { tagName, href, type, formAction } — a plain description of the
// element, so the rule is testable without a DOM. Never auto-navigate off
// the site or a Cambridge sign-in host.
function skipCamIsSafeLoginTarget(target, rules, pageOrigin) {
    if (!target || !rules) return false;
    const tag = String(target.tagName || '').toUpperCase();

    const allowedDestination = (raw) => {
        let url;
        try { url = new URL(raw, pageOrigin); } catch (err) { return false; }
        if (url.origin === pageOrigin) return true;
        return rules.allowCambridgeHosts === true
            && url.protocol === 'https:'
            && skipCamIsCambridgeHost(url.hostname);
    };

    if (tag === 'A') {
        const href = String(target.href || '');
        if (rules.allowPostback && SKIP_CAM_POSTBACK_HREF.test(href)) return true;
        if (/^javascript:/i.test(href)) return false;
        return href !== '' && allowedDestination(href);
    }

    const type = String(target.type || '').toLowerCase();
    const isSubmit = (tag === 'BUTTON' && (type === '' || type === 'submit'))
        || (tag === 'INPUT' && (type === 'submit' || type === 'image'));
    if (isSubmit && target.formAction) return allowedDestination(target.formAction);
    // ASP.NET postback controls run page script and stay on the page.
    const isScriptButton = isSubmit || ((tag === 'BUTTON' || tag === 'INPUT') && type === 'button');
    return rules.allowPostback === true && isScriptButton;
}

// Destination used to decide whether several matches are really one button.
function skipCamTargetDestination(target) {
    const tag = String(target.tagName || '').toUpperCase();
    return tag === 'A' ? String(target.href || '') : String(target.formAction || '');
}

// ─── Suppression decision ───────────────────────────────────────────────────

function skipCamNormalizeLogoutScope(sync) {
    const scope = sync[SKIP_CAM_SYNC_KEYS.LOGOUT_SCOPE];
    if (SKIP_CAM_VALID_LOGOUT_SCOPES.includes(scope)) return scope;
    return sync[SKIP_CAM_SYNC_KEYS.LEGACY_LOGOUT_SCOPE_SESSION] === false ? 'tab' : 'session';
}

function skipCamRecentClicks(history, now) {
    if (!Array.isArray(history)) return [];
    return history.filter((ts) => Number.isFinite(ts)
        && ts <= now
        && now - ts < SKIP_CAM_LOOP_WINDOW_MS);
}

// Pure: first matching reason wins.
function skipCamDecideSuppression(input) {
    const deny = (reason) => ({ allow: false, reason });
    if (input.siteEnabled === false) return deny('site-disabled');
    if (input.sessionUnavailable) return deny('state-unavailable');
    if (input.pauseUntil && input.pauseUntil > input.now) return deny('timed-pause');
    if (input.logoutScope === 'session' && input.sessionLogoutFlag) return deny('logout-session');
    if (input.logoutScope !== 'off' && input.tabLogoutFlag) return deny('logout-tab');
    if (input.tabManualPause) return deny('manual-tab');
    if (skipCamRecentClicks(input.recentAutoClicks, input.now).length >= SKIP_CAM_LOOP_MAX_AUTO_CLICKS) {
        return deny('loop-guard');
    }
    return { allow: true, reason: 'allowed' };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function skipCamFormatRemaining(ms) {
    const totalMin = Math.max(1, Math.ceil(ms / 60000));
    if (totalMin < 60) return `${totalMin} min left`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return mins === 0 ? `${hours} h left` : `${hours} h ${mins} min left`;
}

function skipCamFormatClockTime(epochMs, locale) {
    return new Date(epochMs).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function skipCamFormatPause(pauseUntil, now, locale) {
    if (pauseUntil === SKIP_CAM_PAUSE_UNTIL_RESTART) return 'until Chrome closes';
    return `${skipCamFormatRemaining(pauseUntil - now)} (until ${skipCamFormatClockTime(pauseUntil, locale)})`;
}

function skipCamFormatDelay(ms) {
    return `${Number((ms / 1000).toFixed(1))} s`;
}

function skipCamFormatClickSavings(count, secondsPerClick) {
    const clicks = count === 1 ? '1 click' : `${count.toLocaleString('en-US')} clicks`;
    const totalSeconds = count * secondsPerClick;
    if (totalSeconds < 60) return `${clicks} saved`;
    const totalMinutes = Math.round(totalSeconds / 60);
    if (totalMinutes < 60) return `${clicks} saved · ~${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins === 0 ? `${clicks} saved · ~${hours} h` : `${clicks} saved · ~${hours} h ${mins} min`;
}

// ─── Reason registry ────────────────────────────────────────────────────────
// badge: active | pause | off | error | none
// action: what the popup offers — resume | enable-site | retry | report | null
// ctx: { siteName, pauseUntil, now, locale }

function skipCamPauseUntilText(ctx) {
    return ctx.pauseUntil === SKIP_CAM_PAUSE_UNTIL_RESTART
        ? 'until Chrome closes'
        : `until ${skipCamFormatClockTime(ctx.pauseUntil, ctx.locale)}`;
}

const SKIP_CAM_REASONS = Object.freeze({
    'site-disabled': Object.freeze({
        badge: 'off',
        action: 'enable-site',
        log: 'Skipped — site turned off',
        title: (ctx) => `${ctx.siteName} is turned off`,
        detail: () => 'Auto-click won\'t run here until you turn it back on.',
        tooltip: (ctx) => `Off for ${ctx.siteName}. Turn it on from the toolbar popup.`,
    }),
    'state-unavailable': Object.freeze({
        badge: 'error',
        action: 'retry',
        log: 'Skipped — couldn\'t read pause settings',
        title: () => 'Couldn\'t read your pause settings',
        detail: () => 'So it didn\'t click. Click the login button yourself, or retry.',
        tooltip: () => 'Couldn\'t read your pause settings, so it didn\'t click.',
    }),
    'timed-pause': Object.freeze({
        badge: 'pause',
        action: null,
        log: 'Skipped — paused everywhere',
        title: () => 'Paused everywhere',
        detail: (ctx) => `On every site, ${skipCamPauseUntilText(ctx)}.`,
        tooltip: (ctx) => `Paused everywhere ${skipCamPauseUntilText(ctx)}.`,
    }),
    'logout-session': Object.freeze({
        badge: 'pause',
        action: 'resume',
        log: 'Skipped — you signed out (all tabs)',
        title: () => 'Paused — you signed out',
        detail: () => 'In all tabs, until you sign in again.',
        tooltip: () => 'Paused because you signed out (all tabs).',
    }),
    'logout-tab': Object.freeze({
        badge: 'pause',
        action: 'resume',
        log: 'Skipped — you signed out (this tab)',
        title: () => 'Paused — you signed out',
        detail: () => 'In this tab only.',
        tooltip: () => 'Paused because you signed out (this tab).',
    }),
    'manual-tab': Object.freeze({
        badge: 'pause',
        action: 'resume',
        log: 'Skipped — paused on this tab',
        title: () => 'Paused on this tab',
        detail: () => 'Until you resume or close this tab.',
        tooltip: () => 'Paused on this tab.',
    }),
    'loop-guard': Object.freeze({
        badge: 'error',
        action: 'retry',
        log: 'Stopped to avoid a sign-in loop',
        title: () => 'Stopped to avoid a sign-in loop',
        detail: () => `${SKIP_CAM_LOOP_MAX_AUTO_CLICKS} attempts in ${SKIP_CAM_LOOP_WINDOW_MS / 60000} minutes didn't finish signing in.`,
        tooltip: () => 'Stopped to avoid a sign-in loop. Open the toolbar popup to try again.',
    }),
    'button-not-found': Object.freeze({
        badge: 'error',
        action: 'report',
        log: 'Couldn\'t find the login button',
        title: () => 'Couldn\'t find the login button',
        detail: () => 'The page may have changed.',
        tooltip: () => 'Couldn\'t find the login button on this page.',
    }),
    'ambiguous-target': Object.freeze({
        badge: 'error',
        action: 'report',
        log: 'Didn\'t click — more than one login button',
        title: () => 'Couldn\'t tell which button to click',
        detail: () => 'The page shows more than one possible login button.',
        tooltip: () => 'Didn\'t click: more than one possible login button.',
    }),
    'unsafe-target': Object.freeze({
        badge: 'error',
        action: 'report',
        log: 'Didn\'t click — button pointed elsewhere',
        title: () => 'Login button looked wrong',
        detail: () => 'It pointed somewhere other than the sign-in page, so it wasn\'t clicked.',
        tooltip: () => 'Didn\'t click: the login button pointed somewhere unexpected.',
    }),
    // Legacy (≤1.3) log entries only.
    'site-paused': Object.freeze({
        badge: 'pause',
        action: null,
        log: 'Skipped — paused on this site',
        title: () => 'Paused on this site',
        detail: () => '',
        tooltip: () => 'Paused on this site.',
    }),
});

const SKIP_CAM_BADGE_STATES = Object.freeze(['active', 'pause', 'off', 'error', 'none']);
const SKIP_CAM_PAGE_KINDS = Object.freeze(['login', 'site', 'logout']);
const SKIP_CAM_LOG_ACTIONS = Object.freeze(['clicked', 'suppressed', 'failed']);

function skipCamIsKnownReason(reason) {
    return typeof reason === 'string' && Object.prototype.hasOwnProperty.call(SKIP_CAM_REASONS, reason);
}

function skipCamLogLabel(entry) {
    if (entry.action === 'clicked') return 'Auto-clicked';
    if (skipCamIsKnownReason(entry.reason)) return SKIP_CAM_REASONS[entry.reason].log;
    return entry.action === 'failed' ? 'Failed' : 'Skipped';
}

// ─── Serialised async work ──────────────────────────────────────────────────

function skipCamCreateSerialQueue() {
    let tail = Promise.resolve();
    return function enqueue(task) {
        const run = tail.then(() => task());
        tail = run.catch(() => {});
        return run;
    };
}

// ─── Message validation ─────────────────────────────────────────────────────

// Returns the classified page of a content-script sender, or null.
function skipCamSenderPage(sender, runtimeId) {
    if (!sender || sender.id !== runtimeId) return null;
    if (!sender.tab || sender.tab.id == null) return null;
    const page = skipCamClassifyUrl(sender.url);
    return page.site ? page : null;
}

// Builds a log entry from whitelisted fields only; site and ts are never
// taken from the message.
function skipCamSanitizeLogEntry(raw, siteName, now) {
    if (!raw || !SKIP_CAM_LOG_ACTIONS.includes(raw.action)) return null;
    if (raw.action === 'clicked') return { ts: now, site: siteName, action: 'clicked' };
    if (!skipCamIsKnownReason(raw.reason) || raw.reason === 'site-paused') return null;
    return { ts: now, site: siteName, action: raw.action, reason: raw.reason };
}

function skipCamIsValidStateUpdate(request) {
    if (!request || !SKIP_CAM_BADGE_STATES.includes(request.state)) return false;
    if (request.kind !== undefined && !SKIP_CAM_PAGE_KINDS.includes(request.kind)) return false;
    return request.reason === 'allowed' || request.reason === 'none' || skipCamIsKnownReason(request.reason);
}

// ─── Migration and versions ─────────────────────────────────────────────────

// ≤1.3 kept right-click "pause this site" in paused_hosts; 1.4 folds it into
// the per-site switches.
function skipCamMigratePausedHosts(sync) {
    const hosts = sync[SKIP_CAM_SYNC_KEYS.LEGACY_PAUSED_HOSTS];
    if (hosts === undefined) return null;
    const set = {};
    if (Array.isArray(hosts)) {
        for (const site of SKIP_CAM_SITES) {
            if (hosts.includes(site.host)) set[site.statusKey] = false;
        }
    }
    return { set, remove: [SKIP_CAM_SYNC_KEYS.LEGACY_PAUSED_HOSTS] };
}

function skipCamMajorMinor(version) {
    const parts = String(version || '').split('.');
    return `${parts[0] || '0'}.${parts[1] || '0'}`;
}

function skipCamIsFeatureUpdate(previousVersion, currentVersion) {
    if (!previousVersion) return false;
    return skipCamMajorMinor(previousVersion) !== skipCamMajorMinor(currentVersion);
}

globalThis.SkipCam = Object.freeze({
    SITES: SKIP_CAM_SITES,
    HOST_PATTERNS: Object.freeze(SKIP_CAM_SITES.map((s) => s.pattern)),
    SYNC_KEYS: SKIP_CAM_SYNC_KEYS,
    SESSION_KEYS: Object.freeze({
        SUPPRESS_AUTO_LOGIN: 'suppress_auto_login',
        PAUSE_UNTIL: 'pause_until',
    }),
    LOCAL_KEYS: Object.freeze({
        CLICKS_SAVED: 'clicks_saved',
        ACTIVITY_LOG: 'activity_log',
        WHATS_NEW: 'whats_new',
    }),
    // window.sessionStorage keys (per tab and origin, content script only)
    TAB_KEYS: Object.freeze({
        LOGOUT_FLAG: 'skipcam_suppress_auto_login',
        MANUAL_PAUSE: 'skipcam_manual_pause',
        CLICK_HISTORY: 'skipcam_click_history',
    }),
    VALID_LOGOUT_SCOPES: SKIP_CAM_VALID_LOGOUT_SCOPES,
    PAUSE_UNTIL_RESTART: SKIP_CAM_PAUSE_UNTIL_RESTART,
    LOOP_WINDOW_MS: SKIP_CAM_LOOP_WINDOW_MS,
    LOOP_MAX_AUTO_CLICKS: SKIP_CAM_LOOP_MAX_AUTO_CLICKS,
    LOG_MAX_ENTRIES: 50,
    SECONDS_PER_CLICK: 3,
    REASONS: SKIP_CAM_REASONS,
    BADGE_STATES: SKIP_CAM_BADGE_STATES,

    siteById: (id) => SKIP_CAM_SITES.find((s) => s.id === id) || null,
    hostFromUrl(url) {
        if (!url) return null;
        try { return new URL(url).host; } catch (err) { return null; }
    },
    classifyUrl: skipCamClassifyUrl,
    isSafeLoginTarget: skipCamIsSafeLoginTarget,
    targetDestination: skipCamTargetDestination,
    normalizeLogoutScope: skipCamNormalizeLogoutScope,
    recentClicks: skipCamRecentClicks,
    decideSuppression: skipCamDecideSuppression,
    formatRemaining: skipCamFormatRemaining,
    formatClockTime: skipCamFormatClockTime,
    formatPause: skipCamFormatPause,
    formatDelay: skipCamFormatDelay,
    formatClickSavings: skipCamFormatClickSavings,
    isKnownReason: skipCamIsKnownReason,
    logLabel: skipCamLogLabel,
    createSerialQueue: skipCamCreateSerialQueue,
    senderPage: skipCamSenderPage,
    sanitizeLogEntry: skipCamSanitizeLogEntry,
    isValidStateUpdate: skipCamIsValidStateUpdate,
    migratePausedHosts: skipCamMigratePausedHosts,
    majorMinor: skipCamMajorMinor,
    isFeatureUpdate: skipCamIsFeatureUpdate,
});
