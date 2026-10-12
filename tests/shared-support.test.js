'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared.js');
const SC = globalThis.SkipCam;

const RUNTIME_ID = 'abcdefghijklmnopabcdefghijklmnop';
const MOODLE_LOGIN = 'https://www.vle.cam.ac.uk/login/index.php';

test('senderPage: accepts only this extension\'s content scripts on supported pages', () => {
    const ok = { id: RUNTIME_ID, tab: { id: 7 }, url: MOODLE_LOGIN };
    assert.equal(SC.senderPage(ok, RUNTIME_ID).site.name, 'Moodle');
    assert.equal(SC.senderPage({ ...ok, id: 'other' }, RUNTIME_ID), null);
    assert.equal(SC.senderPage({ ...ok, tab: undefined }, RUNTIME_ID), null);
    assert.equal(SC.senderPage({ ...ok, url: 'https://evil.com/' }, RUNTIME_ID), null);
    assert.equal(SC.senderPage(undefined, RUNTIME_ID), null);
});

test('sanitizeLogEntry: whitelists fields, takes site and ts from the caller', () => {
    assert.deepEqual(
        SC.sanitizeLogEntry({ action: 'clicked', ts: 1, site: 'Evil', extra: 'x' }, 'Moodle', 99),
        { ts: 99, site: 'Moodle', action: 'clicked' },
    );
    assert.deepEqual(
        SC.sanitizeLogEntry({ action: 'suppressed', reason: 'manual-tab', note: 'x' }, 'Panopto', 5),
        { ts: 5, site: 'Panopto', action: 'suppressed', reason: 'manual-tab' },
    );
    assert.equal(SC.sanitizeLogEntry({ action: 'suppressed', reason: 'made-up' }, 'Moodle', 1), null);
    assert.equal(SC.sanitizeLogEntry({ action: 'suppressed', reason: 'site-paused' }, 'Moodle', 1), null);
    assert.equal(SC.sanitizeLogEntry({ action: 'deleted' }, 'Moodle', 1), null);
    assert.equal(SC.sanitizeLogEntry({ action: 'suppressed', reason: '__proto__' }, 'Moodle', 1), null);
    assert.equal(SC.sanitizeLogEntry(null, 'Moodle', 1), null);
});

test('isValidStateUpdate', () => {
    assert.equal(SC.isValidStateUpdate({ state: 'active', reason: 'allowed', kind: 'login' }), true);
    assert.equal(SC.isValidStateUpdate({ state: 'none', reason: 'none' }), true);
    assert.equal(SC.isValidStateUpdate({ state: 'error', reason: 'loop-guard', kind: 'login' }), true);
    assert.equal(SC.isValidStateUpdate({ state: 'rainbow', reason: 'allowed' }), false);
    assert.equal(SC.isValidStateUpdate({ state: 'pause', reason: 'whatever' }), false);
    assert.equal(SC.isValidStateUpdate({ state: 'pause', reason: 'manual-tab', kind: 'admin' }), false);
});

test('every reason has complete, callable copy', () => {
    const ctx = { siteName: 'Moodle', pauseUntil: Date.now() + 60000, now: Date.now(), locale: 'en-GB' };
    for (const [code, r] of Object.entries(SC.REASONS)) {
        assert.ok(SC.BADGE_STATES.includes(r.badge), code);
        assert.equal(typeof r.log, 'string', code);
        for (const fn of ['title', 'detail', 'tooltip']) {
            assert.equal(typeof r[fn](ctx), 'string', `${code}.${fn}`);
        }
    }
    assert.equal(SC.logLabel({ action: 'clicked' }), 'Auto-clicked');
    assert.equal(SC.logLabel({ action: 'failed', reason: 'button-not-found' }), 'Couldn\'t find the login button');
    assert.equal(SC.logLabel({ action: 'suppressed', reason: 'gone' }), 'Skipped');
});

function fakeStore() {
    const data = {};
    const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
    return {
        data,
        async get(key) { await tick(); return { [key]: data[key] }; },
        async set(obj) { await tick(); Object.assign(data, obj); },
    };
}

async function append(store, value) {
    const { log = [] } = await store.get('log');
    await store.set({ log: [value, ...log] });
}

test('control: unserialised read-modify-write loses entries in the fake store', async () => {
    const store = fakeStore();
    await Promise.all(Array.from({ length: 20 }, (_, i) => append(store, i)));
    assert.ok(store.data.log.length < 20, `expected lost writes, got ${store.data.log.length}`);
});

test('createSerialQueue: serialised writes lose nothing and keep order', async () => {
    const store = fakeStore();
    const enqueue = SC.createSerialQueue();
    await Promise.all(Array.from({ length: 20 }, (_, i) => enqueue(() => append(store, i))));
    assert.equal(store.data.log.length, 20);
    assert.deepEqual(store.data.log, Array.from({ length: 20 }, (_, i) => 19 - i));
});

test('createSerialQueue: a failing task does not block later ones', async () => {
    const enqueue = SC.createSerialQueue();
    await assert.rejects(enqueue(async () => { throw new Error('boom'); }));
    assert.equal(await enqueue(async () => 42), 42);
});

test('migratePausedHosts', () => {
    assert.equal(SC.migratePausedHosts({}), null);
    assert.deepEqual(SC.migratePausedHosts({ paused_hosts: ['www.vle.cam.ac.uk'] }), {
        set: { moodle_status: false },
        remove: ['paused_hosts'],
    });
    assert.deepEqual(
        SC.migratePausedHosts({ paused_hosts: ['cambridgelectures.cloud.panopto.eu', 'www.vle.cam.ac.uk', 'x.com'] }).set,
        { moodle_status: false, panopto_status: false },
    );
    assert.deepEqual(SC.migratePausedHosts({ paused_hosts: [] }), { set: {}, remove: ['paused_hosts'] });
    assert.deepEqual(SC.migratePausedHosts({ paused_hosts: 'garbage' }), { set: {}, remove: ['paused_hosts'] });
});

test('formatting helpers', () => {
    assert.equal(SC.formatRemaining(1), '1 min left');
    assert.equal(SC.formatRemaining(52 * 60000 - 5000), '52 min left');
    assert.equal(SC.formatRemaining(60 * 60000), '1 h left');
    assert.equal(SC.formatRemaining(65 * 60000), '1 h 5 min left');
    assert.equal(SC.formatClockTime(new Date(2026, 9, 12, 15, 42).getTime(), 'en-GB'), '15:42');
    assert.equal(SC.formatPause(SC.PAUSE_UNTIL_RESTART, Date.now()), 'until Chrome closes');
    assert.equal(SC.formatDelay(500), '0.5 s');
    assert.equal(SC.formatDelay(1000), '1 s');
    assert.equal(SC.formatClickSavings(1, 3), '1 click saved');
    assert.equal(SC.formatClickSavings(128, 3), '128 clicks saved · ~6 min');
    assert.equal(SC.formatClickSavings(1500, 3), '1,500 clicks saved · ~1 h 15 min');
});

test('feature-update detection for the what\'s-new line', () => {
    assert.equal(SC.isFeatureUpdate('1.3', '1.4'), true);
    assert.equal(SC.isFeatureUpdate('1.4', '1.4.1'), false);
    assert.equal(SC.isFeatureUpdate('1.4', '1.4'), false);
    assert.equal(SC.isFeatureUpdate(undefined, '1.4'), false);
});
