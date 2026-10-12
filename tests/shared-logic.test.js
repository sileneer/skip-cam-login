'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared.js');
const SC = globalThis.SkipCam;

const NOW = 1_800_000_000_000;

function input(overrides = {}) {
    return {
        siteEnabled: true,
        sessionUnavailable: false,
        pauseUntil: undefined,
        now: NOW,
        logoutScope: 'session',
        sessionLogoutFlag: false,
        tabLogoutFlag: false,
        tabManualPause: false,
        recentAutoClicks: [],
        ...overrides,
    };
}

test('decideSuppression: allows when nothing applies', () => {
    assert.deepEqual(SC.decideSuppression(input()), { allow: true, reason: 'allowed' });
});

test('decideSuppression: priority order, first match wins', () => {
    const everything = input({
        siteEnabled: false,
        sessionUnavailable: true,
        pauseUntil: NOW + 60000,
        sessionLogoutFlag: true,
        tabLogoutFlag: true,
        tabManualPause: true,
        recentAutoClicks: [NOW - 1000, NOW - 2000],
    });
    const order = [
        ['site-disabled', { siteEnabled: true }],
        ['state-unavailable', { sessionUnavailable: false }],
        ['timed-pause', { pauseUntil: undefined }],
        ['logout-session', { sessionLogoutFlag: false }],
        ['logout-tab', { tabLogoutFlag: false }],
        ['manual-tab', { tabManualPause: false }],
        ['loop-guard', { recentAutoClicks: [] }],
    ];
    let current = everything;
    for (const [reason, clear] of order) {
        assert.equal(SC.decideSuppression(current).reason, reason);
        current = { ...current, ...clear };
    }
    assert.equal(SC.decideSuppression(current).reason, 'allowed');
});

test('decideSuppression: expired timed pause does not suppress', () => {
    assert.equal(SC.decideSuppression(input({ pauseUntil: NOW - 1 })).reason, 'allowed');
    assert.equal(SC.decideSuppression(input({ pauseUntil: NOW })).reason, 'allowed');
});

test('decideSuppression: until-restart sentinel suppresses', () => {
    assert.equal(SC.decideSuppression(input({ pauseUntil: SC.PAUSE_UNTIL_RESTART })).reason, 'timed-pause');
});

test('decideSuppression: logout scopes', () => {
    assert.equal(SC.decideSuppression(input({ logoutScope: 'tab', sessionLogoutFlag: true })).reason, 'allowed');
    assert.equal(SC.decideSuppression(input({ logoutScope: 'off', tabLogoutFlag: true })).reason, 'allowed');
    assert.equal(SC.decideSuppression(input({ logoutScope: 'tab', tabLogoutFlag: true })).reason, 'logout-tab');
    assert.equal(SC.decideSuppression(input({ logoutScope: 'off', tabManualPause: true })).reason, 'manual-tab');
});

test('decideSuppression: loop guard blocks the 3rd click within the window only', () => {
    const w = SC.LOOP_WINDOW_MS;
    assert.equal(SC.decideSuppression(input({ recentAutoClicks: [NOW - 1000] })).reason, 'allowed');
    assert.equal(SC.decideSuppression(input({ recentAutoClicks: [NOW - 1000, NOW - w + 1] })).reason, 'loop-guard');
    assert.equal(SC.decideSuppression(input({ recentAutoClicks: [NOW - 1000, NOW - w] })).reason, 'allowed');
    assert.equal(SC.decideSuppression(input({ recentAutoClicks: [NOW - 1000, 'x', null] })).reason, 'allowed');
    assert.equal(SC.decideSuppression(input({ recentAutoClicks: [NOW + 5000, NOW + 6000] })).reason, 'allowed');
});

test('normalizeLogoutScope: valid, legacy and default', () => {
    assert.equal(SC.normalizeLogoutScope({ logout_scope: 'off' }), 'off');
    assert.equal(SC.normalizeLogoutScope({ logout_scope_session: false }), 'tab');
    assert.equal(SC.normalizeLogoutScope({ logout_scope: 'bogus' }), 'session');
    assert.equal(SC.normalizeLogoutScope({}), 'session');
});

test('classifyUrl: Moodle', () => {
    const k = (u) => SC.classifyUrl(u).kind;
    assert.equal(k('https://www.vle.cam.ac.uk/login/index.php'), 'login');
    assert.equal(k('https://www.vle.cam.ac.uk/login/index.php?foo=1#x'), 'login');
    assert.equal(k('https://www.vle.cam.ac.uk/login/'), 'login');
    assert.equal(k('https://www.vle.cam.ac.uk/login/logout.php?sesskey=abc'), 'logout');
    for (const p of ['forgot_password.php', 'signup.php', 'change_password.php', 'confirm.php']) {
        assert.equal(k(`https://www.vle.cam.ac.uk/login/${p}`), 'site', p);
    }
    assert.equal(k('https://www.vle.cam.ac.uk/loginX'), 'site');
    assert.equal(k('https://www.vle.cam.ac.uk/my/'), 'site');
    assert.equal(SC.classifyUrl('https://www.vle.cam.ac.uk/my/').site.id, 'moodle');
});

test('classifyUrl: Panopto is case-insensitive and scoped to /Panopto/', () => {
    const k = (u) => SC.classifyUrl(u).kind;
    const base = 'https://cambridgelectures.cloud.panopto.eu';
    assert.equal(k(`${base}/Panopto/Pages/Auth/Login.aspx?ReturnUrl=%2f`), 'login');
    assert.equal(k(`${base}/panopto/pages/auth/login.aspx`), 'login');
    assert.equal(k(`${base}/Panopto/Pages/Home.aspx`), 'site');
    assert.equal(k(`${base}/Panopto/Pages/Auth/Logout.aspx`), 'site');
    assert.equal(k(`${base}/Other/Pages/Auth/Login.aspx`), 'off-domain');
});

test('classifyUrl: rejects look-alikes, other schemes and garbage', () => {
    const k = (u) => SC.classifyUrl(u).kind;
    assert.equal(k('https://www.vle.cam.ac.uk.evil.com/login/index.php'), 'off-domain');
    assert.equal(k('http://www.vle.cam.ac.uk/login/index.php'), 'off-domain');
    assert.equal(k('https://www.vle.cam.ac.uk:8443/login/index.php'), 'off-domain');
    assert.equal(k('https://vle.cam.ac.uk/login/index.php'), 'off-domain');
    assert.equal(k('not a url'), 'off-domain');
    assert.equal(k(undefined), 'off-domain');
});

test('isSafeLoginTarget: Moodle anchors', () => {
    const rules = SC.siteById('moodle').target;
    const origin = 'https://www.vle.cam.ac.uk';
    const a = (href) => SC.isSafeLoginTarget({ tagName: 'A', href }, rules, origin);
    assert.equal(a('https://www.vle.cam.ac.uk/auth/saml2/login.php?wants=x'), true);
    assert.equal(a('/auth/saml2/login.php'), true);
    assert.equal(a('https://shib.raven.cam.ac.uk/idp/profile/SAML2/Redirect/SSO'), true);
    assert.equal(a('https://raven.cam.ac.uk/auth/authenticate.html'), true);
    assert.equal(a('http://raven.cam.ac.uk/'), false);
    assert.equal(a('https://evil.com/login'), false);
    assert.equal(a('https://cam.ac.uk.evil.com/'), false);
    assert.equal(a('javascript:alert(1)'), false);
    assert.equal(a('javascript:__doPostBack(\'x\',\'\')'), false);
    assert.equal(a(''), false);
});

test('isSafeLoginTarget: Panopto postback controls and same-origin forms', () => {
    const rules = SC.siteById('panopto').target;
    const origin = 'https://cambridgelectures.cloud.panopto.eu';
    const t = (target) => SC.isSafeLoginTarget(target, rules, origin);
    assert.equal(t({ tagName: 'A', href: 'javascript:__doPostBack(\'ctl00$x$externalLoginButton\',\'\')' }), true);
    assert.equal(t({ tagName: 'A', href: 'javascript:WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions("x"))' }), true);
    assert.equal(t({ tagName: 'A', href: 'javascript:alert(1)' }), false);
    assert.equal(t({ tagName: 'A', href: 'https://evil.com/' }), false);
    assert.equal(t({ tagName: 'INPUT', type: 'submit', formAction: `${origin}/Panopto/Pages/Auth/Login.aspx` }), true);
    assert.equal(t({ tagName: 'BUTTON', type: '', formAction: `${origin}/Panopto/Pages/Auth/Login.aspx` }), true);
    assert.equal(t({ tagName: 'INPUT', type: 'submit', formAction: 'https://evil.com/steal' }), false);
    assert.equal(t({ tagName: 'INPUT', type: 'button' }), true);
    assert.equal(t({ tagName: 'BUTTON', type: 'button', formAction: `${origin}/x` }), true);
    assert.equal(t({ tagName: 'BUTTON', type: 'submit', formAction: '' }), true);
    assert.equal(t({ tagName: 'BUTTON', type: 'reset' }), false);
    assert.equal(t({ tagName: 'DIV' }), false);
    assert.equal(t(null), false);
});

test('isSafeLoginTarget: Moodle never accepts script-only controls', () => {
    const rules = SC.siteById('moodle').target;
    const origin = 'https://www.vle.cam.ac.uk';
    const m = (target) => SC.isSafeLoginTarget(target, rules, origin);
    assert.equal(m({ tagName: 'BUTTON', type: 'button' }), false);
    assert.equal(m({ tagName: 'BUTTON', type: 'submit', formAction: '' }), false);
    assert.equal(m({ tagName: 'A', href: 'javascript:WebForm_DoPostBackWithOptions(x)' }), false);
    assert.equal(m({ tagName: 'INPUT', type: 'submit', formAction: `${origin}/login/index.php` }), true);
});
