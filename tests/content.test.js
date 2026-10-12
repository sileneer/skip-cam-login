'use strict';

// Runs content.js against a fake DOM and chrome.* in a vm context, so the
// click flow can be checked without a browser. Timers are compressed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHARED = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
const CONTENT = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
const RUNTIME_ID = 'test-extension-id';
const MOODLE_LOGIN = 'https://www.vle.cam.ac.uk/login/index.php';
const SAFE_HREF = 'https://www.vle.cam.ac.uk/auth/saml2/login.php?wants=x';

class FakeElement {
    constructor({ tagName = 'A', href = '', visible = true } = {}) {
        this.tagName = tagName;
        this.href = href;
        this.type = '';
        this.form = null;
        this.visible = visible;
        this.clicks = 0;
    }
    hasAttribute() { return false; }
    getClientRects() { return this.visible ? [{}] : []; }
    closest() { return null; }
    click() { this.clicks += 1; }
}

function storageArea(initial = {}, { failGet = false } = {}) {
    const data = { ...initial };
    return {
        data,
        async get(keys) {
            if (failGet) throw new Error('storage unavailable');
            const out = {};
            for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
            return out;
        },
        async set(obj) { Object.assign(data, obj); },
        async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
    };
}

function loadPage({ url = MOODLE_LOGIN, elements = [], sync = {}, session = {}, tab = {}, failSessionGet = false } = {}) {
    const sent = [];
    const listeners = [];
    const tabStore = new Map(Object.entries(tab));
    const timers = {
        setTimeout: (fn, ms, ...args) => setTimeout(fn, Math.min(ms, 30), ...args),
        clearTimeout: (id) => clearTimeout(id),
    };
    const parsed = new URL(url);
    const context = {
        console: { log() {}, warn() {}, error() {} },
        ...timers,
        URL,
        Element: FakeElement,
        MutationObserver: class { observe() {} disconnect() {} },
        sessionStorage: {
            getItem: (k) => (tabStore.has(k) ? tabStore.get(k) : null),
            setItem: (k, v) => tabStore.set(k, String(v)),
            removeItem: (k) => tabStore.delete(k),
        },
        document: {
            referrer: '',
            visibilityState: 'visible',
            documentElement: {},
            addEventListener() {},
            removeEventListener() {},
            querySelectorAll: () => elements,
        },
        chrome: {
            runtime: {
                id: RUNTIME_ID,
                onMessage: { addListener: (fn) => listeners.push(fn) },
                sendMessage: async (message) => { sent.push(message); return {}; },
            },
            storage: {
                sync: storageArea(sync),
                session: storageArea(session, { failGet: failSessionGet }),
            },
        },
    };
    context.window = context;
    context.globalThis = context;
    context.window.location = { href: url, origin: parsed.origin };
    vm.createContext(context);
    vm.runInContext(SHARED, context);
    vm.runInContext(CONTENT, context);

    const message = (request, sender = { id: RUNTIME_ID }) => new Promise((resolve) => {
        const async = listeners[0](request, sender, resolve);
        if (!async) resolve(undefined);
    });
    return { sent, tabStore, message, settle: () => new Promise((r) => setTimeout(r, 80)) };
}

const ofType = (sent, type) => sent.filter((m) => m.type === type);
const lastState = (sent) => ofType(sent, 'state_update').at(-1);
const logs = (sent) => ofType(sent, 'append_log').map((m) => `${m.entry.action}/${m.entry.reason}`);

test('login page with one safe button: clicks once and records it', async () => {
    const button = new FakeElement({ href: SAFE_HREF });
    const page = loadPage({ elements: [button] });
    await page.settle();
    assert.equal(button.clicks, 1);
    assert.equal(ofType(page.sent, 'login_clicked').length, 1);
    assert.equal(lastState(page.sent).state, 'active');
    assert.equal(lastState(page.sent).kind, 'login');
    assert.equal(JSON.parse(page.tabStore.get('skipcam_click_history')).length, 1);
});

test('other /login/ pages are never clicked', async () => {
    const button = new FakeElement({ href: SAFE_HREF });
    const page = loadPage({ url: 'https://www.vle.cam.ac.uk/login/forgot_password.php', elements: [button] });
    await page.settle();
    assert.equal(button.clicks, 0);
    assert.equal(lastState(page.sent).kind, 'site');
});

test('a button pointing off-site is not clicked', async () => {
    const button = new FakeElement({ href: 'https://evil.example/phish' });
    const page = loadPage({ elements: [button] });
    await page.settle();
    assert.equal(button.clicks, 0);
    assert.deepEqual(logs(page.sent), ['failed/unsafe-target']);
    assert.equal(lastState(page.sent).state, 'error');
});

test('two visible safe buttons with different destinations are ambiguous', async () => {
    const a = new FakeElement({ href: SAFE_HREF });
    const b = new FakeElement({ href: 'https://www.vle.cam.ac.uk/other' });
    const page = loadPage({ elements: [a, b] });
    await page.settle();
    assert.equal(a.clicks + b.clicks, 0);
    assert.deepEqual(logs(page.sent), ['failed/ambiguous-target']);
});

test('a hidden duplicate does not make the target ambiguous', async () => {
    const shown = new FakeElement({ href: SAFE_HREF });
    const hidden = new FakeElement({ href: 'https://www.vle.cam.ac.uk/other', visible: false });
    const page = loadPage({ elements: [shown, hidden] });
    await page.settle();
    assert.equal(shown.clicks, 1);
    assert.equal(hidden.clicks, 0);
});

test('missing button: reports button-not-found after the wait', async () => {
    const page = loadPage({ elements: [] });
    await page.settle();
    assert.deepEqual(logs(page.sent), ['failed/button-not-found']);
    assert.equal(lastState(page.sent).reason, 'button-not-found');
});

test('loop guard: two recent clicks in this tab block the third', async () => {
    const button = new FakeElement({ href: SAFE_HREF });
    const now = Date.now();
    const page = loadPage({
        elements: [button],
        tab: { skipcam_click_history: JSON.stringify([now - 30000, now - 5000]) },
    });
    await page.settle();
    assert.equal(button.clicks, 0);
    assert.deepEqual(logs(page.sent), ['suppressed/loop-guard']);
    assert.equal(lastState(page.sent).state, 'error');
});

test('a pause set during the click delay is honoured', async () => {
    const button = new FakeElement({ href: SAFE_HREF });
    const page = loadPage({ elements: [button], sync: { click_delay_ms: 3000 } });
    for (let i = 0; i < 200 && !(lastState(page.sent) && lastState(page.sent).state === 'active'); i++) {
        await new Promise((r) => setTimeout(r, 1));
    }
    assert.equal(lastState(page.sent).state, 'active', 'should be waiting out the delay');
    await page.message({ type: 'set_manual_pause', value: true });
    await page.settle();
    assert.equal(button.clicks, 0);
    assert.deepEqual(logs(page.sent), ['suppressed/manual-tab']);
});

test('unreadable session storage fails closed and says so', async () => {
    const button = new FakeElement({ href: SAFE_HREF });
    const page = loadPage({ elements: [button], failSessionGet: true });
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(button.clicks, 0);
    assert.deepEqual(logs(page.sent), ['suppressed/state-unavailable']);
    assert.equal(lastState(page.sent).state, 'error');
});

test('get_status, then Resume & sign in clicks the button', async () => {
    const button = new FakeElement({ href: SAFE_HREF });
    const page = loadPage({ elements: [button], tab: { skipcam_manual_pause: '1' } });
    await page.settle();
    assert.equal(button.clicks, 0);
    const status = await page.message({ type: 'get_status' });
    assert.equal(status.reason, 'manual-tab');
    assert.equal(status.allow, false);
    const after = await page.message({ type: 'resume', signIn: true });
    assert.equal(after.allow, true);
    await page.settle();
    assert.equal(button.clicks, 1);
    assert.equal(page.tabStore.has('skipcam_manual_pause'), false);
});

test('messages from other extensions are ignored', async () => {
    const page = loadPage({ elements: [new FakeElement({ href: SAFE_HREF })] });
    const reply = await page.message({ type: 'get_status' }, { id: 'someone-else' });
    assert.equal(reply, undefined);
});
