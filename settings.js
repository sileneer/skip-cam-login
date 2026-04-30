'use strict';

const VALID_SCOPES = ['session', 'tab', 'off'];

document.addEventListener('DOMContentLoaded', async () => {
    const moodleToggle = document.getElementById('moodle-toggle');
    const panoptoToggle = document.getElementById('panopto-toggle');
    const notificationToggle = document.getElementById('notification-toggle');
    const logoutScopeSelect = document.getElementById('logout-scope-select');
    const clickDelaySelect = document.getElementById('click-delay-select');
    const pauseBtn = document.getElementById('pause-btn');
    const cancelPauseBtn = document.getElementById('cancel-pause-btn');
    const pauseDurationSelect = document.getElementById('pause-duration-select');
    const timedPauseIdle = document.getElementById('timed-pause-idle');
    const timedPauseActive = document.getElementById('timed-pause-active');
    const pauseRemaining = document.getElementById('pause-remaining');

    const settings = await chrome.storage.sync.get([
        'moodle_status',
        'panopto_status',
        'notification_status',
        'logout_scope',
        'logout_scope_session',
        'click_delay_ms',
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

    const validDelays = ['0', '500', '1000', '3000'];
    const rawDelay = settings.click_delay_ms != null ? String(settings.click_delay_ms) : '0';
    const delayValue = validDelays.includes(rawDelay) ? rawDelay : '0';
    clickDelaySelect.value = delayValue;
    if (!validDelays.includes(rawDelay)) {
        await chrome.storage.sync.set({ click_delay_ms: Number(delayValue) });
    }

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
    clickDelaySelect.addEventListener('change', () => {
        chrome.storage.sync.set({ click_delay_ms: Number(clickDelaySelect.value) });
    });

    let countdownTimer = null;

    async function refreshPauseUi() {
        const previouslyFocused = document.activeElement;
        const { pause_until } = await chrome.storage.session.get('pause_until');
        const now = Date.now();
        if (!pause_until || pause_until <= now) {
            timedPauseIdle.style.display = '';
            timedPauseActive.style.display = 'none';
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
            if (pause_until && pause_until <= now) {
                await chrome.storage.session.remove('pause_until');
            }
            if (previouslyFocused === cancelPauseBtn) {
                pauseBtn.focus();
            }
            return;
        }
        timedPauseIdle.style.display = 'none';
        timedPauseActive.style.display = '';
        renderRemaining(pause_until);
        if (!countdownTimer) {
            countdownTimer = setInterval(() => renderRemaining(pause_until), 1000);
        }
        if (previouslyFocused === pauseBtn) {
            cancelPauseBtn.focus();
        }
    }

    function renderRemaining(target) {
        const ms = Math.max(0, target - Date.now());
        if (ms === 0) {
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
            refreshPauseUi();
            return;
        }
        const totalMin = Math.ceil(ms / 60000);
        if (totalMin === 1) {
            pauseRemaining.textContent = '1 more minute';
        } else if (totalMin < 60) {
            pauseRemaining.textContent = `${totalMin} more minutes`;
        } else {
            const hr = Math.floor(totalMin / 60);
            const min = totalMin % 60;
            pauseRemaining.textContent = min === 0
                ? `${hr}h more`
                : `${hr}h ${min}m more`;
        }
    }

    pauseBtn.addEventListener('click', async () => {
        const duration = Number(pauseDurationSelect.value);
        if (!Number.isFinite(duration) || duration <= 0) return;
        await chrome.storage.session.set({ pause_until: Date.now() + duration });
        await refreshPauseUi();
    });

    cancelPauseBtn.addEventListener('click', async () => {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        await chrome.storage.session.remove('pause_until');
        await refreshPauseUi();
    });

    await refreshPauseUi();
});
