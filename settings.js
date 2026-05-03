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
    const manualPauseBtn = document.getElementById('manual-pause-btn');
    const manualPauseLabel = document.getElementById('manual-pause-label');
    const manualPauseDesc = document.getElementById('manual-pause-desc');
    const sitePauseRow = document.getElementById('site-pause-row');
    const sitePauseHost = document.getElementById('site-pause-host');
    const sitePauseBtn = document.getElementById('site-pause-btn');
    const counterRow = document.getElementById('counter-row');
    const counterText = document.getElementById('counter-text');
    const logHeader = document.getElementById('log-header');
    const logBody = document.getElementById('log-body');
    const logChevron = document.getElementById('log-chevron');
    const logList = document.getElementById('log-list');
    const logClear = document.getElementById('log-clear');

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

    async function getActiveTab() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
    }

    async function refreshManualPauseUi() {
        const tab = await getActiveTab();
        if (!tab?.id) {
            manualPauseBtn.disabled = true;
            manualPauseBtn.textContent = 'Pause';
            manualPauseBtn.dataset.paused = '0';
            manualPauseLabel.textContent = 'Pause on this tab';
            manualPauseDesc.textContent = 'No active tab';
            return;
        }
        let response;
        try {
            response = await chrome.tabs.sendMessage(tab.id, { type: 'get_manual_pause_state' });
        } catch (err) {
            manualPauseBtn.disabled = true;
            manualPauseBtn.textContent = 'Pause';
            manualPauseBtn.dataset.paused = '0';
            manualPauseLabel.textContent = 'Pause on this tab';
            manualPauseDesc.textContent = 'Open Moodle or Panopto to use this';
            return;
        }
        manualPauseBtn.disabled = false;
        if (response?.paused) {
            manualPauseBtn.textContent = 'Resume';
            manualPauseBtn.dataset.paused = '1';
            manualPauseLabel.textContent = 'Paused on this tab';
            manualPauseDesc.textContent = 'Auto-click is paused for this tab';
        } else {
            manualPauseBtn.textContent = 'Pause';
            manualPauseBtn.dataset.paused = '0';
            manualPauseLabel.textContent = 'Pause on this tab';
            manualPauseDesc.textContent = 'Stop auto-click here until you close the tab';
        }
    }

    manualPauseBtn.addEventListener('click', async () => {
        const tab = await getActiveTab();
        if (!tab?.id) return;
        const isCurrentlyPaused = manualPauseBtn.dataset.paused === '1';
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'set_manual_pause',
                value: !isCurrentlyPaused,
            });
        } catch (err) {
            return;
        }
        await refreshManualPauseUi();
    });

    await refreshManualPauseUi();

    async function refreshSitePauseUi() {
        const tab = await getActiveTab();
        const host = tab?.url ? safeHost(tab.url) : null;
        if (!host) {
            sitePauseRow.style.display = 'none';
            return;
        }
        const { paused_hosts = [] } = await chrome.storage.sync.get('paused_hosts');
        if (Array.isArray(paused_hosts) && paused_hosts.includes(host)) {
            sitePauseHost.textContent = host;
            sitePauseRow.style.display = '';
        } else {
            sitePauseRow.style.display = 'none';
        }
    }

    function safeHost(url) {
        try { return new URL(url).host; } catch (err) { return null; }
    }

    sitePauseBtn.addEventListener('click', async () => {
        const tab = await getActiveTab();
        const host = tab?.url ? safeHost(tab.url) : null;
        if (!host) return;
        const { paused_hosts = [] } = await chrome.storage.sync.get('paused_hosts');
        const next = (Array.isArray(paused_hosts) ? paused_hosts : []).filter((h) => h !== host);
        await chrome.storage.sync.set({ paused_hosts: next });
        await refreshSitePauseUi();
    });

    await refreshSitePauseUi();

    const SECONDS_PER_CLICK = 3;

    function formatClickSavings(count) {
        const clicks = count === 1 ? '1 click' : `${count.toLocaleString('en-US')} clicks`;
        const totalSeconds = count * SECONDS_PER_CLICK;
        if (totalSeconds < 60) return `${clicks} saved`;
        const totalMinutes = Math.round(totalSeconds / 60);
        if (totalMinutes < 60) return `${clicks} · ~${totalMinutes} min saved`;
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const span = mins === 0 ? `~${hours}h` : `~${hours}h ${mins}m`;
        return `${clicks} · ${span} saved`;
    }

    const local = await chrome.storage.local.get('clicks_saved');
    const count = local.clicks_saved || 0;
    if (count > 0) {
        counterText.textContent = formatClickSavings(count);
        counterRow.style.display = '';
    }

    const SUPPRESSION_LABELS = {
        'site-disabled': 'Suppressed (site disabled)',
        'site-paused': 'Suppressed (paused on this site)',
        'timed-pause': 'Suppressed (timed pause)',
        'logout-session': 'Suppressed (after sign-out, all tabs)',
        'logout-tab': 'Suppressed (after sign-out, this tab)',
        'manual-tab': 'Suppressed (paused on this tab)',
    };

    function relativeTime(ts) {
        const ms = Math.max(0, Date.now() - ts);
        const min = Math.floor(ms / 60000);
        if (min < 1) return 'just now';
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const day = Math.floor(hr / 24);
        return `${day}d ago`;
    }

    function actionLabel(entry) {
        if (entry.action === 'clicked') return 'Auto-clicked';
        if (entry.action === 'failed') return `Failed (${entry.reason || 'unknown'})`;
        if (entry.action === 'suppressed') {
            return SUPPRESSION_LABELS[entry.reason] || 'Suppressed';
        }
        return entry.action || 'Unknown';
    }

    function renderLogEntry(entry) {
        const row = document.createElement('div');
        const action = entry.action === 'clicked' || entry.action === 'suppressed' || entry.action === 'failed'
            ? entry.action
            : '';
        row.className = action ? `log-entry ${action}` : 'log-entry';
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        const ts = document.createElement('span');
        ts.className = 'ts';
        ts.textContent = relativeTime(entry.ts);
        const body = document.createElement('span');
        body.className = 'body';
        body.textContent = `${entry.site || '—'} · ${actionLabel(entry)}`;
        row.appendChild(dot);
        row.appendChild(ts);
        row.appendChild(body);
        return row;
    }

    async function renderLog() {
        const { activity_log = [] } = await chrome.storage.local.get('activity_log');
        logList.replaceChildren();
        if (!activity_log.length) {
            const empty = document.createElement('div');
            empty.className = 'log-empty';
            empty.textContent = 'No activity yet.';
            logList.appendChild(empty);
            return;
        }
        for (const entry of activity_log) {
            logList.appendChild(renderLogEntry(entry));
        }
    }

    async function toggleLogVisibility() {
        const isOpen = logBody.style.display !== 'none';
        if (isOpen) {
            logBody.style.display = 'none';
            logChevron.classList.remove('open');
            logHeader.setAttribute('aria-expanded', 'false');
        } else {
            logBody.style.display = '';
            logChevron.classList.add('open');
            logHeader.setAttribute('aria-expanded', 'true');
            await renderLog();
        }
    }

    logHeader.addEventListener('click', toggleLogVisibility);
    logHeader.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleLogVisibility();
        }
    });

    logClear.addEventListener('click', async () => {
        await chrome.storage.local.remove('activity_log');
        await renderLog();
    });
});
