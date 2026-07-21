// js/goals.js
// Agent daily target system — Firebase RTDB is authoritative with a small local cache
// so the widget and popup remain usable while Firebase is still connecting.

(() => {
    'use strict';

    const STATE = {
        initialized: false,
        profile: null,
        agentId: '',
        agentKey: '',
        date: '',
        goals: null,
        actual: 0,
        goalUnsubscribe: null,
        firebaseWaitTimer: null,
        widgetRetryTimer: null,
        syncRetryTimer: null,
        autoPromptTimer: null,
        listenersReady: false,
        lastPersistedHitSignature: ''
    };

    const CACHE_PREFIX = 'biz_agent_goal_cache_v3';
    const PENDING_PREFIX = 'biz_agent_goal_pending_v3';
    const PROMPT_PREFIX = 'biz_goal_prompt_shown_v3';
    const SKIP_PREFIX = 'biz_goal_skipped_v3';

    function isAgentSession() {
        return sessionStorage.getItem('bizUserRole') === 'agent' &&
            sessionStorage.getItem('agentLoggedIn') === '1';
    }

    function parseJSON(value, fallback = null) {
        try { return JSON.parse(value); } catch (_) { return fallback; }
    }

    function getAgentProfile() {
        const profile = parseJSON(sessionStorage.getItem('currentAgentProfile') || '{}', {});
        if (!profile || typeof profile !== 'object') return null;

        const agentId = String(profile.ytelId || profile.userId || profile.id || '').trim();
        const agentName = String(profile.fullName || profile.name || profile.ytelName || '').trim();
        if (!agentId && !agentName) return null;

        return {
            ...profile,
            ytelId: agentId || agentName,
            name: agentName || 'Agent'
        };
    }

    function safeFirebaseKey(value) {
        return String(value || '')
            .trim()
            .replace(/[.#$\[\]\/]/g, '_')
            .replace(/\s+/g, '_') || 'unknown_agent';
    }

    function getGuyanaDateISO() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Guyana',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function getGuyanaDisplayDate() {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Guyana',
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        }).format(new Date());
    }

    function cacheKey(prefix = CACHE_PREFIX) {
        return `${prefix}:${STATE.agentKey}:${STATE.date}`;
    }

    function normalizeGoals(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const low = Number.parseInt(raw.low, 10);
        const high = Number.parseInt(raw.high, 10);
        if (!Number.isFinite(low) || !Number.isFinite(high) || low < 1 || high < low) return null;
        return {
            ...raw,
            low,
            high,
            hitLow: Boolean(raw.hitLow),
            hitHigh: Boolean(raw.hitHigh),
            date: raw.date || STATE.date,
            agentId: raw.agentId || STATE.agentId
        };
    }

    function readCachedGoals() {
        return normalizeGoals(parseJSON(localStorage.getItem(cacheKey()), null));
    }

    function writeCachedGoals(goals) {
        try { localStorage.setItem(cacheKey(), JSON.stringify(goals)); } catch (_) {}
    }

    function markPendingSync(goals) {
        try { localStorage.setItem(cacheKey(PENDING_PREFIX), JSON.stringify(goals)); } catch (_) {}
    }

    function clearPendingSync() {
        try { localStorage.removeItem(cacheKey(PENDING_PREFIX)); } catch (_) {}
    }

    function readPendingSync() {
        return normalizeGoals(parseJSON(localStorage.getItem(cacheKey(PENDING_PREFIX)), null));
    }

    function firebaseReady() {
        return typeof window.rtdbRef === 'function' &&
            typeof window.rtdbSet === 'function' &&
            typeof window.rtdbGet === 'function';
    }

    function goalPath() {
        return `agent_goals/${STATE.agentKey}/${STATE.date}`;
    }

    function ensureStateFromSession() {
        if (!isAgentSession()) return false;
        const profile = getAgentProfile();
        if (!profile) return false;

        const nextAgentId = String(profile.ytelId || profile.userId || profile.name || '').trim();
        const nextAgentKey = safeFirebaseKey(nextAgentId);
        const nextDate = getGuyanaDateISO();
        const identityChanged = nextAgentKey !== STATE.agentKey || nextDate !== STATE.date;

        STATE.profile = profile;
        STATE.agentId = nextAgentId;
        STATE.agentKey = nextAgentKey;
        STATE.date = nextDate;

        if (identityChanged) {
            STATE.goals = readCachedGoals();
            STATE.lastPersistedHitSignature = '';
        }
        return true;
    }

    function initGoalSystem() {
        if (!ensureStateFromSession()) {
            if (sessionStorage.getItem('bizUserRole') === 'agent') {
                clearTimeout(STATE.firebaseWaitTimer);
                STATE.firebaseWaitTimer = setTimeout(initGoalSystem, 350);
            }
            return;
        }

        injectGoalStyles();
        createGoalModal();

        if (!STATE.initialized) {
            STATE.initialized = true;
            setupGoalStatsListener();
            setupGoalLifecycleListeners();
        }

        refreshActualTransfers();
        renderAgentGoalWidget();
        connectGoalRecord();
    }

    function setupGoalLifecycleListeners() {
        document.addEventListener('keydown', (event) => {
            const modal = document.getElementById('biz-goal-modal');
            if (!modal || modal.hidden) return;
            if (event.key === 'Escape') closeGoalPopup();
            if (event.key === 'Enter' && event.target && event.target.matches('.biz-goal-input')) {
                event.preventDefault();
                saveGoalPopup();
            }
        });

        window.addEventListener('storageChange', (event) => {
            if (event.key === 'currentAgentProfile' || event.key === 'bizUserRole') {
                initGoalSystem();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && isAgentSession()) {
                ensureStateFromSession();
                refreshActualTransfers();
                renderAgentGoalWidget();
                connectGoalRecord();
            }
        });
    }

    function connectGoalRecord(attempt = 0) {
        if (!ensureStateFromSession()) return;

        if (!firebaseReady()) {
            clearTimeout(STATE.firebaseWaitTimer);
            const delay = Math.min(2500, 250 + (attempt * 150));
            STATE.firebaseWaitTimer = setTimeout(() => connectGoalRecord(attempt + 1), delay);

            // Do not make the agent wait forever for the modal if Firebase is slow.
            if (attempt === 5 && !STATE.goals) scheduleAutomaticPrompt();
            return;
        }

        clearTimeout(STATE.firebaseWaitTimer);
        flushPendingGoalSync();

        if (typeof STATE.goalUnsubscribe === 'function') {
            try { STATE.goalUnsubscribe(); } catch (_) {}
            STATE.goalUnsubscribe = null;
        }

        if (typeof window.rtdbOnValue === 'function') {
            try {
                STATE.goalUnsubscribe = window.rtdbOnValue(
                    window.rtdbRef(goalPath()),
                    (snapshot) => handleGoalSnapshot(snapshot),
                    (error) => handleGoalReadError(error)
                );
                return;
            } catch (error) {
                console.warn('[Goals] Realtime goal listener failed; using one-time read.', error);
            }
        }

        window.rtdbGet(window.rtdbRef(goalPath()))
            .then(handleGoalSnapshot)
            .catch(handleGoalReadError);
    }

    function handleGoalSnapshot(snapshot) {
        const value = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
        const remoteGoals = normalizeGoals(value);

        if (remoteGoals) {
            STATE.goals = remoteGoals;
            writeCachedGoals(remoteGoals);
            clearPendingSync();
            clearAutomaticPrompt();
            renderAgentGoalWidget();
            return;
        }

        const pending = readPendingSync();
        if (pending) {
            STATE.goals = pending;
            renderAgentGoalWidget();
            flushPendingGoalSync();
            return;
        }

        STATE.goals = readCachedGoals();
        renderAgentGoalWidget();
        if (!STATE.goals) scheduleAutomaticPrompt();
    }

    function handleGoalReadError(error) {
        console.warn('[Goals] Goal read failed:', error);
        STATE.goals = STATE.goals || readCachedGoals();
        renderAgentGoalWidget();
        if (!STATE.goals) scheduleAutomaticPrompt();
    }

    function scheduleAutomaticPrompt() {
        if (!isAgentSession() || STATE.goals) return;
        const promptKey = `${PROMPT_PREFIX}:${STATE.agentKey}:${STATE.date}`;
        const skipKey = `${SKIP_PREFIX}:${STATE.agentKey}:${STATE.date}`;
        if (sessionStorage.getItem(promptKey) === '1' || sessionStorage.getItem(skipKey) === '1') return;

        clearAutomaticPrompt();
        STATE.autoPromptTimer = setTimeout(() => {
            if (!STATE.goals && isAgentSession()) {
                sessionStorage.setItem(promptKey, '1');
                showGoalPopup({ automatic: true });
            }
        }, 650);
    }

    function clearAutomaticPrompt() {
        clearTimeout(STATE.autoPromptTimer);
        STATE.autoPromptTimer = null;
    }

    function createGoalModal() {
        if (document.getElementById('biz-goal-modal') || !document.body) return;

        const modal = document.createElement('div');
        modal.id = 'biz-goal-modal';
        modal.className = 'biz-goal-modal';
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'biz-goal-title');
        modal.innerHTML = `
            <div class="biz-goal-dialog" role="document">
                <div class="biz-goal-dialog-accent"></div>
                <div class="biz-goal-dialog-header">
                    <div class="biz-goal-title-wrap">
                        <span class="biz-goal-title-icon"><i class="fas fa-bullseye"></i></span>
                        <div>
                            <div class="biz-goal-eyebrow">DAILY PERFORMANCE TARGET</div>
                            <h2 id="biz-goal-title">Set Your Goals</h2>
                        </div>
                    </div>
                    <button type="button" class="biz-goal-close" aria-label="Close goal window">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="biz-goal-dialog-body">
                    <div class="biz-goal-date" id="biz-goal-date"></div>
                    <p class="biz-goal-intro">Choose a realistic low target and a stronger high target for today.</p>

                    <div class="biz-goal-input-grid">
                        <label class="biz-goal-field biz-goal-field-low">
                            <span class="biz-goal-field-label"><i class="fas fa-flag"></i> Low Target</span>
                            <input class="biz-goal-input" id="biz-goal-low" type="number" inputmode="numeric" min="1" max="999" step="1" placeholder="3" autocomplete="off">
                            <small>Your minimum target</small>
                        </label>

                        <label class="biz-goal-field biz-goal-field-high">
                            <span class="biz-goal-field-label"><i class="fas fa-trophy"></i> High Target</span>
                            <input class="biz-goal-input" id="biz-goal-high" type="number" inputmode="numeric" min="1" max="999" step="1" placeholder="5" autocomplete="off">
                            <small>Your stretch target</small>
                        </label>
                    </div>

                    <div class="biz-goal-preview" id="biz-goal-preview">
                        <span class="biz-goal-preview-dot"></span>
                        <span>Enter both targets to preview today's goal.</span>
                    </div>
                    <div class="biz-goal-error" id="biz-goal-error" role="alert"></div>
                </div>

                <div class="biz-goal-dialog-footer">
                    <button type="button" class="biz-goal-later">Set Later</button>
                    <button type="button" class="biz-goal-save">
                        <i class="fas fa-check"></i>
                        <span>Save Goals</span>
                    </button>
                </div>
            </div>`;

        document.body.appendChild(modal);

        modal.querySelector('.biz-goal-close').addEventListener('click', closeGoalPopup);
        modal.querySelector('.biz-goal-later').addEventListener('click', skipGoalPopup);
        modal.querySelector('.biz-goal-save').addEventListener('click', saveGoalPopup);
        modal.querySelector('#biz-goal-low').addEventListener('input', updateGoalPreview);
        modal.querySelector('#biz-goal-high').addEventListener('input', updateGoalPreview);
        modal.addEventListener('mousedown', (event) => {
            if (event.target === modal) closeGoalPopup();
        });
    }

    function showGoalPopup(options = {}) {
        if (!ensureStateFromSession()) {
            showGoalToast('Your agent session is not ready. Please refresh and try again.', 'error');
            return;
        }

        injectGoalStyles();
        createGoalModal();
        const modal = document.getElementById('biz-goal-modal');
        if (!modal) return;

        const lowInput = document.getElementById('biz-goal-low');
        const highInput = document.getElementById('biz-goal-high');
        const errorEl = document.getElementById('biz-goal-error');
        const dateEl = document.getElementById('biz-goal-date');

        const goals = STATE.goals || readCachedGoals();
        lowInput.value = goals ? goals.low : '';
        highInput.value = goals ? goals.high : '';
        errorEl.textContent = '';
        dateEl.textContent = getGuyanaDisplayDate();
        modal.dataset.automatic = options.automatic ? '1' : '0';

        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('is-open'));
        document.documentElement.classList.add('biz-goal-modal-open');
        updateGoalPreview();
        setTimeout(() => lowInput.focus(), 80);
    }

    function closeGoalPopup() {
        const modal = document.getElementById('biz-goal-modal');
        if (!modal || modal.hidden) return;
        modal.classList.remove('is-open');
        document.documentElement.classList.remove('biz-goal-modal-open');
        setTimeout(() => { modal.hidden = true; }, 180);
    }

    function skipGoalPopup() {
        if (ensureStateFromSession()) {
            sessionStorage.setItem(`${SKIP_PREFIX}:${STATE.agentKey}:${STATE.date}`, '1');
        }
        closeGoalPopup();
        showGoalToast('You can set your targets anytime using Edit Goals.', 'info');
    }

    function updateGoalPreview() {
        const preview = document.getElementById('biz-goal-preview');
        const low = Number.parseInt(document.getElementById('biz-goal-low')?.value, 10);
        const high = Number.parseInt(document.getElementById('biz-goal-high')?.value, 10);
        if (!preview) return;

        if (!Number.isFinite(low) || !Number.isFinite(high)) {
            preview.className = 'biz-goal-preview';
            preview.innerHTML = '<span class="biz-goal-preview-dot"></span><span>Enter both targets to preview today\'s goal.</span>';
            return;
        }

        if (low < 1 || high < low) {
            preview.className = 'biz-goal-preview is-warning';
            preview.innerHTML = '<span class="biz-goal-preview-dot"></span><span>High target must be equal to or greater than low target.</span>';
            return;
        }

        preview.className = 'biz-goal-preview is-ready';
        preview.innerHTML = `<span class="biz-goal-preview-dot"></span><span>Reach <strong>${low}</strong> for Low Hit and <strong>${high}</strong> for High Hit.</span>`;
    }

    async function saveGoalPopup() {
        if (!ensureStateFromSession()) return;
        const lowInput = document.getElementById('biz-goal-low');
        const highInput = document.getElementById('biz-goal-high');
        const errorEl = document.getElementById('biz-goal-error');
        const saveButton = document.querySelector('.biz-goal-save');

        const low = Number.parseInt(lowInput?.value, 10);
        const high = Number.parseInt(highInput?.value, 10);

        if (!Number.isFinite(low) || low < 1) {
            errorEl.textContent = 'Enter a valid low target of 1 or more.';
            lowInput?.focus();
            return;
        }
        if (!Number.isFinite(high) || high < 1) {
            errorEl.textContent = 'Enter a valid high target of 1 or more.';
            highInput?.focus();
            return;
        }
        if (high < low) {
            errorEl.textContent = 'High target cannot be lower than the low target.';
            highInput?.focus();
            return;
        }

        errorEl.textContent = '';
        setSaveButtonLoading(saveButton, true);

        const existing = STATE.goals || {};
        const payload = {
            agentId: STATE.agentId,
            agentName: STATE.profile?.name || STATE.profile?.fullName || '',
            ytelName: STATE.profile?.ytelName || '',
            team: STATE.profile?.team || 'PR',
            date: STATE.date,
            low,
            high,
            hitLow: STATE.actual >= low,
            hitHigh: STATE.actual >= high,
            setByAdmin: Boolean(existing.setByAdmin),
            createdAt: existing.createdAt || Date.now(),
            updatedAt: Date.now()
        };

        // Update immediately so the button and strip never appear broken.
        STATE.goals = payload;
        writeCachedGoals(payload);
        markPendingSync(payload);
        renderAgentGoalWidget();

        try {
            await waitForFirebase(18, 220);
            await window.rtdbSet(window.rtdbRef(goalPath()), payload);
            clearPendingSync();
            closeGoalPopup();
            showGoalToast('Goals saved and synced.', 'success');
        } catch (error) {
            console.error('[Goals] Save failed:', error);
            closeGoalPopup();
            showGoalToast('Goals saved on this device. Firebase will retry automatically.', 'warning');
            schedulePendingSyncRetry();
        } finally {
            setSaveButtonLoading(saveButton, false);
        }
    }

    function setSaveButtonLoading(button, loading) {
        if (!button) return;
        button.disabled = loading;
        button.innerHTML = loading
            ? '<i class="fas fa-spinner fa-spin"></i><span>Saving...</span>'
            : '<i class="fas fa-check"></i><span>Save Goals</span>';
    }

    function waitForFirebase(maxAttempts = 12, interval = 250) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                if (firebaseReady()) return resolve();
                attempts += 1;
                if (attempts >= maxAttempts) return reject(new Error('Firebase is not ready'));
                setTimeout(check, interval);
            };
            check();
        });
    }

    async function flushPendingGoalSync() {
        if (!firebaseReady() || !ensureStateFromSession()) return;
        const pending = readPendingSync();
        if (!pending) return;
        try {
            await window.rtdbSet(window.rtdbRef(goalPath()), pending);
            clearPendingSync();
        } catch (error) {
            console.warn('[Goals] Pending goal sync failed:', error);
            schedulePendingSyncRetry();
        }
    }

    function schedulePendingSyncRetry() {
        clearTimeout(STATE.syncRetryTimer);
        STATE.syncRetryTimer = setTimeout(() => {
            if (firebaseReady()) flushPendingGoalSync();
            else schedulePendingSyncRetry();
        }, 3000);
    }

    function refreshActualTransfers() {
        if (!STATE.profile) return 0;

        let agents = [];
        if (window._asLastLiveState && Array.isArray(window._asLastLiveState.agents)) {
            agents = window._asLastLiveState.agents;
        } else if (Array.isArray(window.allAgents)) {
            agents = window.allAgents;
        }

        const profileNames = [
            STATE.profile.name,
            STATE.profile.fullName,
            STATE.profile.ytelName
        ].filter(Boolean).map(normalizeName);
        const profileIds = [
            STATE.profile.ytelId,
            STATE.profile.userId,
            STATE.profile.id
        ].filter(Boolean).map(value => String(value).trim().toLowerCase());

        const match = agents.find(agent => {
            const agentIds = [agent.ytelId, agent.userId, agent.id, agent.agentId]
                .filter(Boolean).map(value => String(value).trim().toLowerCase());
            const agentNames = [agent.name, agent.fullName, agent.agentName, agent.ytelName]
                .filter(Boolean).map(normalizeName);
            return profileIds.some(id => agentIds.includes(id)) || profileNames.some(name => agentNames.includes(name));
        });

        const value = match ? Number(match.dailyLeads ?? match.transfers ?? match.count ?? 0) : 0;
        STATE.actual = Number.isFinite(value) && value >= 0 ? value : 0;
        return STATE.actual;
    }

    function normalizeName(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function getGoalStatus(low, high, actual) {
        const hitLow = actual >= low;
        const hitHigh = actual >= high;
        if (hitHigh) {
            return {
                hitLow,
                hitHigh,
                icon: 'fa-trophy',
                text: 'High target achieved!',
                detail: `${actual} transfers completed today`,
                className: 'is-high'
            };
        }
        if (hitLow) {
            return {
                hitLow,
                hitHigh,
                icon: 'fa-check-circle',
                text: 'Low target hit!',
                detail: `${high - actual} more for high target`,
                className: 'is-low'
            };
        }
        return {
            hitLow,
            hitHigh,
            icon: 'fa-bolt',
            text: `${low - actual} more to reach low target`,
            detail: `${high - actual} more for high target`,
            className: 'is-pending'
        };
    }

    function renderAgentGoalWidget() {
        if (!isAgentSession()) return;
        ensureStateFromSession();
        refreshActualTransfers();

        const container = document.getElementById('agent-goal-widget-container');
        if (!container) {
            clearTimeout(STATE.widgetRetryTimer);
            STATE.widgetRetryTimer = setTimeout(renderAgentGoalWidget, 350);
            return;
        }

        injectGoalStyles();
        container.style.display = 'block';
        const toolsRow = document.getElementById('dashboard-daily-tools');
        if (toolsRow) toolsRow.classList.add('has-agent-goal');

        const goals = normalizeGoals(STATE.goals) || readCachedGoals();
        if (!goals) {
            container.innerHTML = `
                <button type="button" class="biz-goal-empty" id="biz-goal-empty-button">
                    <span class="biz-goal-empty-icon"><i class="fas fa-bullseye"></i></span>
                    <span class="biz-goal-empty-copy">
                        <strong>Set today's performance targets</strong>
                        <small>Choose your low and high transfer goals to track progress live.</small>
                    </span>
                    <span class="biz-goal-empty-action">Set Goals <i class="fas fa-arrow-right"></i></span>
                </button>
                <div class="biz-goal-motivation" role="note">
                    <i class="fas fa-bolt" aria-hidden="true"></i>
                    <span>See the goal. Visualize the win. Embrace the work. Go get it.</span>
                </div>`;
            container.querySelector('#biz-goal-empty-button')?.addEventListener('click', () => showGoalPopup());
            return;
        }

        STATE.goals = goals;
        const { low, high } = goals;
        const actual = STATE.actual;
        const status = getGoalStatus(low, high, actual);
        const highProgress = Math.max(0, Math.min(100, (actual / high) * 100));
        const lowMarker = Math.max(0, Math.min(100, (low / high) * 100));

        container.innerHTML = `
            <section class="biz-goal-strip" aria-label="My daily transfer targets">
                <div class="biz-goal-strip-accent"></div>

                <div class="biz-goal-metrics">
                    <div class="biz-goal-metric is-low">
                        <strong>${low}</strong>
                        <span>Low Target</span>
                    </div>
                    <div class="biz-goal-metric is-high">
                        <strong>${high}</strong>
                        <span>High Target</span>
                    </div>
                    <div class="biz-goal-metric is-actual">
                        <strong>${actual}</strong>
                        <span>Transfers</span>
                    </div>
                </div>

                <div class="biz-goal-progress-zone">
                    <div class="biz-goal-status-line ${status.className}">
                        <i class="fas ${status.icon}"></i>
                        <span><strong>${escapeHTML(status.text)}</strong> ${escapeHTML(status.detail)}</span>
                    </div>
                    <div class="biz-goal-progress-track" aria-label="${Math.round(highProgress)} percent of high target">
                        <div class="biz-goal-progress-fill" style="width:${highProgress}%"></div>
                        <span class="biz-goal-target-marker is-low" style="left:${lowMarker}%" title="Low target: ${low}"></span>
                        <span class="biz-goal-target-marker is-high" style="left:100%" title="High target: ${high}"></span>
                    </div>
                    <div class="biz-goal-progress-labels">
                        <span>0</span>
                        <span style="left:${lowMarker}%">LOW ${low}</span>
                        <span>HIGH ${high}</span>
                    </div>
                </div>

                <div class="biz-goal-actions">
                    <div class="biz-goal-hit-badges">
                        <span class="biz-goal-hit-badge ${status.hitLow ? 'is-complete is-low' : ''}">
                            <i class="fas ${status.hitLow ? 'fa-check' : 'fa-hourglass-half'}"></i> Low Hit
                        </span>
                        <span class="biz-goal-hit-badge ${status.hitHigh ? 'is-complete is-high' : ''}">
                            <i class="fas ${status.hitHigh ? 'fa-check' : 'fa-hourglass-half'}"></i> High Hit
                        </span>
                    </div>
                    <button type="button" class="biz-goal-edit" id="biz-goal-edit-button">
                        <i class="fas fa-sliders-h"></i> Edit Goals
                    </button>
                </div>
            </section>
            <div class="biz-goal-motivation" role="note">
                <i class="fas fa-bolt" aria-hidden="true"></i>
                <span>See the goal. Visualize the win. Embrace the work. Go get it.</span>
            </div>`;

        container.querySelector('#biz-goal-edit-button')?.addEventListener('click', () => showGoalPopup());
        persistHitStateIfNeeded(goals, status);
    }

    function persistHitStateIfNeeded(goals, status) {
        if (!firebaseReady() || !goals) return;
        const signature = `${STATE.date}:${status.hitLow}:${status.hitHigh}`;
        if (signature === STATE.lastPersistedHitSignature) return;
        if (Boolean(goals.hitLow) === status.hitLow && Boolean(goals.hitHigh) === status.hitHigh) {
            STATE.lastPersistedHitSignature = signature;
            return;
        }

        STATE.lastPersistedHitSignature = signature;
        STATE.goals = { ...goals, hitLow: status.hitLow, hitHigh: status.hitHigh, updatedAt: Date.now() };
        writeCachedGoals(STATE.goals);

        const update = typeof window.rtdbUpdate === 'function'
            ? window.rtdbUpdate(window.rtdbRef(goalPath()), {
                hitLow: status.hitLow,
                hitHigh: status.hitHigh,
                updatedAt: Date.now()
            })
            : window.rtdbSet(window.rtdbRef(goalPath()), STATE.goals);

        Promise.resolve(update).catch(error => {
            console.warn('[Goals] Could not persist hit state:', error);
            STATE.lastPersistedHitSignature = '';
        });
    }

    function setupGoalStatsListener() {
        if (STATE.listenersReady) return;
        STATE.listenersReady = true;

        const handleUpdate = (state) => {
            if (state && Array.isArray(state.agents)) window._asLastLiveState = state;
            refreshActualTransfers();
            renderAgentGoalWidget();
        };

        const attach = (attempt = 0) => {
            if (!isAgentSession()) return;
            if (typeof window.listenForLiveDashboardState === 'function') {
                try { window.listenForLiveDashboardState(handleUpdate); } catch (error) {
                    console.warn('[Goals] Live dashboard listener failed:', error);
                }
            } else if (attempt < 30) {
                setTimeout(() => attach(attempt + 1), 300);
            }
        };
        attach();

        // Some report uploads refresh the dashboard outside the RTDB state listener.
        if (typeof window.listenForAgentReports === 'function') {
            try {
                window.listenForAgentReports(() => {
                    setTimeout(() => {
                        refreshActualTransfers();
                        renderAgentGoalWidget();
                    }, 120);
                });
            } catch (_) {}
        }
    }

    function showGoalToast(message, type = 'info') {
        let toast = document.getElementById('biz-goal-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'biz-goal-toast';
            toast.className = 'biz-goal-toast';
            document.body.appendChild(toast);
        }
        toast.className = `biz-goal-toast is-${type}`;
        toast.innerHTML = `<i class="fas ${toastIcon(type)}"></i><span>${escapeHTML(message)}</span>`;
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        clearTimeout(showGoalToast._timer);
        showGoalToast._timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
    }

    function toastIcon(type) {
        if (type === 'success') return 'fa-check-circle';
        if (type === 'error') return 'fa-exclamation-circle';
        if (type === 'warning') return 'fa-sync-alt';
        return 'fa-info-circle';
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function injectGoalStyles() {
        if (document.getElementById('biz-goal-styles')) return;
        const style = document.createElement('style');
        style.id = 'biz-goal-styles';
        style.textContent = `
            html.biz-goal-modal-open, html.biz-goal-modal-open body { overflow: hidden !important; }

            .biz-goal-modal[hidden] { display: none !important; }
            .biz-goal-modal {
                position: fixed;
                inset: 0;
                z-index: 1000000;
                display: grid;
                place-items: center;
                padding: 20px;
                background: rgba(1, 5, 18, .84);
                backdrop-filter: blur(14px);
                opacity: 0;
                transition: opacity .18s ease;
                font-family: 'Inter', sans-serif;
            }
            .biz-goal-modal.is-open { opacity: 1; }
            .biz-goal-dialog {
                position: relative;
                width: min(100%, 520px);
                overflow: hidden;
                border: 1px solid rgba(255, 119, 28, .28);
                border-radius: 22px;
                background:
                    radial-gradient(circle at 12% 0%, rgba(255, 153, 0, .10), transparent 32%),
                    linear-gradient(145deg, #0b1223 0%, #070c19 100%);
                box-shadow: 0 30px 90px rgba(0, 0, 0, .58), 0 0 48px rgba(255, 88, 0, .08);
                transform: translateY(16px) scale(.98);
                transition: transform .22s cubic-bezier(.2,.8,.2,1);
            }
            .biz-goal-modal.is-open .biz-goal-dialog { transform: translateY(0) scale(1); }
            .biz-goal-dialog-accent {
                height: 3px;
                background: linear-gradient(90deg, #ffb000 0%, #ff6a00 52%, #ff2e1f 100%);
                box-shadow: 0 0 20px rgba(255, 106, 0, .5);
            }
            .biz-goal-dialog-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 21px 22px 17px;
                border-bottom: 1px solid rgba(148, 163, 184, .10);
            }
            .biz-goal-title-wrap { display: flex; align-items: center; gap: 12px; min-width: 0; }
            .biz-goal-title-icon {
                display: grid;
                place-items: center;
                width: 42px;
                height: 42px;
                flex: 0 0 auto;
                border: 1px solid rgba(255, 135, 24, .25);
                border-radius: 13px;
                background: rgba(255, 107, 0, .09);
                color: #ff9f1a;
                font-size: 17px;
            }
            .biz-goal-eyebrow {
                margin-bottom: 4px;
                color: #ff8a1c;
                font-family: 'Orbitron', sans-serif;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .16em;
            }
            .biz-goal-dialog h2 {
                margin: 0;
                color: #f8fafc;
                font-family: 'Orbitron', sans-serif;
                font-size: 19px;
                font-weight: 900;
                letter-spacing: -.02em;
            }
            .biz-goal-close {
                display: grid;
                place-items: center;
                width: 34px;
                height: 34px;
                flex: 0 0 auto;
                border: 1px solid rgba(148, 163, 184, .16);
                border-radius: 10px;
                background: rgba(15, 23, 42, .72);
                color: #64748b;
                cursor: pointer;
                transition: .16s ease;
            }
            .biz-goal-close:hover { border-color: rgba(248, 113, 113, .38); color: #f87171; background: rgba(127, 29, 29, .16); }
            .biz-goal-dialog-body { padding: 20px 22px 18px; }
            .biz-goal-date {
                color: #60a5fa;
                font-family: 'Orbitron', sans-serif;
                font-size: 9px;
                font-weight: 800;
                letter-spacing: .10em;
                text-transform: uppercase;
            }
            .biz-goal-intro { margin: 8px 0 18px; color: #8290a7; font-size: 12px; font-weight: 600; line-height: 1.55; }
            .biz-goal-input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .biz-goal-field {
                display: block;
                padding: 14px;
                border: 1px solid rgba(148, 163, 184, .13);
                border-radius: 15px;
                background: rgba(2, 6, 23, .48);
                transition: border-color .18s ease, background .18s ease;
            }
            .biz-goal-field:focus-within { background: rgba(8, 15, 31, .88); }
            .biz-goal-field-low:focus-within { border-color: rgba(16, 185, 129, .52); box-shadow: 0 0 0 3px rgba(16, 185, 129, .07); }
            .biz-goal-field-high:focus-within { border-color: rgba(59, 130, 246, .55); box-shadow: 0 0 0 3px rgba(59, 130, 246, .07); }
            .biz-goal-field-label {
                display: flex;
                align-items: center;
                gap: 7px;
                margin-bottom: 8px;
                font-family: 'Orbitron', sans-serif;
                font-size: 8px;
                font-weight: 900;
                letter-spacing: .10em;
                text-transform: uppercase;
            }
            .biz-goal-field-low .biz-goal-field-label { color: #2dd4bf; }
            .biz-goal-field-high .biz-goal-field-label { color: #60a5fa; }
            .biz-goal-input {
                width: 100%;
                box-sizing: border-box;
                border: 0;
                outline: 0;
                background: transparent;
                color: #f8fafc;
                font-family: 'Orbitron', sans-serif;
                font-size: 31px;
                font-weight: 900;
                line-height: 1;
                appearance: textfield;
            }
            .biz-goal-input::-webkit-inner-spin-button, .biz-goal-input::-webkit-outer-spin-button { appearance: none; margin: 0; }
            .biz-goal-field small { display: block; margin-top: 7px; color: #445269; font-size: 9px; font-weight: 700; }
            .biz-goal-preview {
                display: flex;
                align-items: center;
                gap: 9px;
                min-height: 38px;
                margin-top: 13px;
                padding: 9px 11px;
                border: 1px solid rgba(148, 163, 184, .10);
                border-radius: 11px;
                background: rgba(15, 23, 42, .42);
                color: #64748b;
                font-size: 10px;
                font-weight: 700;
            }
            .biz-goal-preview-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 99px; background: #475569; box-shadow: 0 0 8px currentColor; }
            .biz-goal-preview.is-ready { color: #a7f3d0; border-color: rgba(16, 185, 129, .16); background: rgba(6, 78, 59, .12); }
            .biz-goal-preview.is-ready .biz-goal-preview-dot { background: #10b981; }
            .biz-goal-preview.is-warning { color: #fda4af; border-color: rgba(244, 63, 94, .18); background: rgba(127, 29, 29, .11); }
            .biz-goal-preview.is-warning .biz-goal-preview-dot { background: #fb7185; }
            .biz-goal-error { min-height: 18px; padding-top: 8px; color: #fb7185; font-size: 10px; font-weight: 800; }
            .biz-goal-dialog-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 15px 22px 20px;
                border-top: 1px solid rgba(148, 163, 184, .09);
                background: rgba(0, 0, 0, .12);
            }
            .biz-goal-dialog-footer button {
                min-height: 42px;
                border-radius: 11px;
                font-family: 'Orbitron', sans-serif;
                font-size: 9px;
                font-weight: 900;
                letter-spacing: .08em;
                text-transform: uppercase;
                cursor: pointer;
                transition: transform .16s ease, border-color .16s ease, filter .16s ease;
            }
            .biz-goal-later { padding: 0 17px; border: 1px solid rgba(148, 163, 184, .16); background: #0c1425; color: #718096; }
            .biz-goal-later:hover { border-color: rgba(148, 163, 184, .32); color: #cbd5e1; }
            .biz-goal-save {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-width: 160px;
                padding: 0 20px;
                border: 1px solid rgba(255, 180, 44, .30);
                background: linear-gradient(100deg, #ffb000 0%, #ff6a00 58%, #ff3827 100%);
                color: #080b12;
                box-shadow: 0 9px 26px rgba(255, 92, 0, .20);
            }
            .biz-goal-save:hover { transform: translateY(-1px); filter: brightness(1.06); }
            .biz-goal-save:disabled { cursor: wait; opacity: .72; transform: none; }

            #agent-goal-widget-container {
                display: grid;
                gap: 8px;
                width: 100%;
                min-width: 0;
                box-sizing: border-box;
            }
            .biz-goal-motivation {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-height: 24px;
                padding: 2px 12px 0;
                color: #7f8da5;
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                font-weight: 800;
                font-style: italic;
                letter-spacing: .02em;
                text-align: center;
            }
            .biz-goal-motivation i {
                color: #ff9f1a;
                font-size: 9px;
                filter: drop-shadow(0 0 7px rgba(255, 159, 26, .38));
            }
            .biz-goal-motivation span {
                background: linear-gradient(90deg, #94a3b8 0%, #f8fafc 50%, #94a3b8 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
            }
            .biz-goal-strip {
                position: relative;
                display: grid;
                grid-template-columns: auto minmax(190px, 1fr) auto;
                align-items: center;
                gap: 14px;
                min-height: 72px;
                overflow: hidden;
                padding: 10px 11px 10px 15px;
                border: 1px solid rgba(45, 125, 201, .28);
                border-radius: 13px;
                background:
                    linear-gradient(90deg, rgba(14, 165, 233, .035), transparent 42%),
                    linear-gradient(145deg, rgba(9, 17, 34, .98), rgba(5, 10, 23, .98));
                box-shadow: 0 16px 45px rgba(0, 0, 0, .20), inset 0 1px 0 rgba(255, 255, 255, .025);
                font-family: 'Inter', sans-serif;
            }
            .biz-goal-strip-accent {
                position: absolute;
                inset: 0 auto 0 0;
                width: 3px;
                background: linear-gradient(180deg, #ffb000, #ff5a19, #ef2b35);
                box-shadow: 0 0 15px rgba(255, 92, 0, .42);
            }
            .biz-goal-metrics { display: flex; align-items: stretch; min-width: 184px; }
            .biz-goal-metric {
                min-width: 58px;
                padding: 2px 9px;
                text-align: center;
                border-right: 1px solid rgba(148, 163, 184, .10);
            }
            .biz-goal-metric:first-child { padding-left: 4px; }
            .biz-goal-metric:last-child { border-right: 0; }
            .biz-goal-metric strong {
                display: block;
                margin-bottom: 3px;
                font-family: 'Orbitron', sans-serif;
                font-size: 19px;
                font-weight: 900;
                line-height: 1;
            }
            .biz-goal-metric span {
                display: block;
                color: #53627a;
                font-family: 'Orbitron', sans-serif;
                font-size: 6px;
                font-weight: 900;
                letter-spacing: .11em;
                text-transform: uppercase;
                white-space: nowrap;
            }
            .biz-goal-metric.is-low strong { color: #2dd4bf; text-shadow: 0 0 18px rgba(45, 212, 191, .22); }
            .biz-goal-metric.is-high strong { color: #60a5fa; text-shadow: 0 0 18px rgba(96, 165, 250, .22); }
            .biz-goal-metric.is-actual strong { color: #ff9f1a; text-shadow: 0 0 18px rgba(255, 159, 26, .22); }

            .biz-goal-progress-zone { min-width: 0; padding: 1px 0 0; }
            .biz-goal-status-line {
                display: flex;
                align-items: center;
                gap: 7px;
                min-height: 17px;
                margin-bottom: 5px;
                font-size: 10px;
                font-weight: 700;
                color: #6f809a;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .biz-goal-status-line i { flex: 0 0 auto; }
            .biz-goal-status-line.is-low { color: #2dd4bf; }
            .biz-goal-status-line.is-high { color: #fbbf24; }
            .biz-goal-status-line.is-pending i { color: #ff8a1c; }
            .biz-goal-progress-track {
                position: relative;
                height: 8px;
                border: 1px solid rgba(148, 163, 184, .06);
                border-radius: 999px;
                background: #050b17;
                box-shadow: inset 0 1px 5px rgba(0, 0, 0, .50);
            }
            .biz-goal-progress-fill {
                position: absolute;
                inset: 0 auto 0 0;
                min-width: 0;
                border-radius: 999px;
                background: linear-gradient(90deg, #10b981 0%, #20c997 52%, #ff9b19 100%);
                box-shadow: 0 0 12px rgba(16, 185, 129, .30);
                transition: width .65s cubic-bezier(.2,.8,.2,1);
            }
            .biz-goal-progress-fill::after {
                content: '';
                position: absolute;
                top: 50%;
                right: -3px;
                width: 8px;
                height: 8px;
                border: 2px solid #07101f;
                border-radius: 99px;
                background: #2dd4bf;
                transform: translateY(-50%);
                box-shadow: 0 0 10px rgba(45, 212, 191, .7);
            }
            .biz-goal-target-marker {
                position: absolute;
                top: -4px;
                width: 2px;
                height: 16px;
                border-radius: 3px;
                transform: translateX(-1px);
                pointer-events: none;
            }
            .biz-goal-target-marker.is-low { background: rgba(45, 212, 191, .72); }
            .biz-goal-target-marker.is-high { left: auto !important; right: 0; background: rgba(96, 165, 250, .74); }
            .biz-goal-progress-labels { position: relative; height: 13px; margin-top: 5px; color: #334155; font-family: 'Orbitron', sans-serif; font-size: 6px; font-weight: 900; letter-spacing: .06em; }
            .biz-goal-progress-labels > span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
            .biz-goal-progress-labels > span:first-child { left: 0; transform: none; }
            .biz-goal-progress-labels > span:last-child { right: 0; transform: none; color: #3f5b82; }

            .biz-goal-actions { display: flex; align-items: center; gap: 7px; }
            .biz-goal-hit-badges { display: grid; gap: 5px; }
            .biz-goal-hit-badge {
                display: inline-flex;
                align-items: center;
                justify-content: flex-start;
                gap: 5px;
                min-width: 68px;
                padding: 3px 7px;
                border: 1px solid rgba(148, 163, 184, .13);
                border-radius: 7px;
                background: rgba(15, 23, 42, .55);
                color: #46556c;
                font-family: 'Orbitron', sans-serif;
                font-size: 6.5px;
                font-weight: 900;
                letter-spacing: .06em;
                text-transform: uppercase;
                white-space: nowrap;
            }
            .biz-goal-hit-badge.is-complete.is-low { border-color: rgba(16, 185, 129, .35); background: rgba(6, 95, 70, .17); color: #2dd4bf; }
            .biz-goal-hit-badge.is-complete.is-high { border-color: rgba(59, 130, 246, .36); background: rgba(30, 64, 175, .17); color: #60a5fa; }
            .biz-goal-edit {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                min-height: 34px;
                padding: 0 10px;
                border: 1px solid rgba(96, 165, 250, .24);
                border-radius: 9px;
                background: rgba(15, 23, 42, .78);
                color: #91a4bf;
                font-family: 'Orbitron', sans-serif;
                font-size: 7px;
                font-weight: 900;
                letter-spacing: .07em;
                text-transform: uppercase;
                white-space: nowrap;
                cursor: pointer;
                transition: .16s ease;
            }
            .biz-goal-edit:hover { border-color: rgba(255, 126, 26, .42); color: #ff9f1a; background: rgba(255, 107, 0, .07); transform: translateY(-1px); }

            .biz-goal-empty {
                display: flex;
                align-items: center;
                width: 100%;
                min-height: 70px;
                gap: 13px;
                padding: 13px 16px;
                border: 1px dashed rgba(255, 126, 26, .27);
                border-radius: 14px;
                background: linear-gradient(145deg, rgba(12, 20, 37, .94), rgba(6, 11, 24, .96));
                color: inherit;
                text-align: left;
                cursor: pointer;
                transition: .16s ease;
            }
            .biz-goal-empty:hover { border-color: rgba(255, 126, 26, .50); background: rgba(255, 107, 0, .04); }
            .biz-goal-empty-icon { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid rgba(255, 126, 26, .22); border-radius: 12px; background: rgba(255, 107, 0, .08); color: #ff9f1a; }
            .biz-goal-empty-copy { min-width: 0; }
            .biz-goal-empty-copy strong { display: block; color: #dce6f3; font-size: 11px; font-weight: 900; }
            .biz-goal-empty-copy small { display: block; margin-top: 3px; color: #56657b; font-size: 9px; font-weight: 650; }
            .biz-goal-empty-action { margin-left: auto; color: #ff9f1a; font-family: 'Orbitron', sans-serif; font-size: 7px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase; white-space: nowrap; }

            .biz-goal-toast {
                position: fixed;
                z-index: 1000001;
                left: 50%;
                bottom: 28px;
                display: flex;
                align-items: center;
                gap: 9px;
                max-width: min(90vw, 520px);
                padding: 11px 15px;
                border: 1px solid rgba(148, 163, 184, .16);
                border-radius: 11px;
                background: #0b1426;
                color: #d9e3ef;
                box-shadow: 0 18px 55px rgba(0,0,0,.46);
                font: 800 10px/1.4 'Inter', sans-serif;
                opacity: 0;
                pointer-events: none;
                transform: translate(-50%, 14px);
                transition: .2s ease;
            }
            .biz-goal-toast.is-visible { opacity: 1; transform: translate(-50%, 0); }
            .biz-goal-toast.is-success { border-color: rgba(16,185,129,.34); color: #a7f3d0; }
            .biz-goal-toast.is-error { border-color: rgba(244,63,94,.35); color: #fecdd3; }
            .biz-goal-toast.is-warning { border-color: rgba(245,158,11,.35); color: #fde68a; }
            .biz-goal-toast.is-info { border-color: rgba(59,130,246,.35); color: #bfdbfe; }

            @media (max-width: 1080px) {
                .biz-goal-strip { grid-template-columns: auto 1fr; gap: 14px 17px; }
                .biz-goal-actions { grid-column: 1 / -1; justify-content: flex-end; padding-top: 9px; border-top: 1px solid rgba(148,163,184,.07); }
                .biz-goal-hit-badges { display: flex; margin-right: auto; }
            }
            @media (max-width: 620px) {
                .biz-goal-modal { padding: 10px; align-items: end; }
                .biz-goal-dialog { width: 100%; max-height: calc(100vh - 20px); overflow-y: auto; border-radius: 19px; }
                .biz-goal-dialog-header, .biz-goal-dialog-body { padding-left: 17px; padding-right: 17px; }
                .biz-goal-dialog-footer { padding: 13px 17px 17px; }
                .biz-goal-input-grid { grid-template-columns: 1fr; }
                .biz-goal-dialog-footer button { flex: 1; }

                .biz-goal-strip { grid-template-columns: 1fr; gap: 12px; padding: 14px; }
                .biz-goal-metrics { width: 100%; min-width: 0; justify-content: center; }
                .biz-goal-metric { flex: 1; min-width: 0; }
                .biz-goal-progress-zone { padding: 0 2px; }
                .biz-goal-actions { grid-column: auto; padding-top: 10px; }
                .biz-goal-hit-badges { display: grid; grid-template-columns: 1fr 1fr; flex: 1; }
                .biz-goal-hit-badge { min-width: 0; justify-content: center; }
                .biz-goal-status-line { white-space: normal; line-height: 1.35; }
                .biz-goal-motivation { font-size: 9px; line-height: 1.4; padding-inline: 5px; }
                .biz-goal-empty { align-items: flex-start; }
                .biz-goal-empty-action { display: none; }
            }
            @media (max-width: 390px) {
                .biz-goal-dialog-footer { flex-direction: column-reverse; }
                .biz-goal-save, .biz-goal-later { width: 100%; }
                .biz-goal-actions { align-items: stretch; flex-direction: column; }
                .biz-goal-hit-badges { width: 100%; }
                .biz-goal-edit { width: 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    // Admin helper: set today's goals for a specific agent.
    async function adminSetAgentGoals(agentId, low, high) {
        const parsedLow = Number.parseInt(low, 10);
        const parsedHigh = Number.parseInt(high, 10);
        if (!Number.isFinite(parsedLow) || !Number.isFinite(parsedHigh) || parsedLow < 1 || parsedHigh < parsedLow) {
            return { success: false, error: 'Invalid goal values' };
        }
        if (!firebaseReady()) return { success: false, error: 'Database not ready' };

        const date = getGuyanaDateISO();
        const key = safeFirebaseKey(agentId);
        try {
            await window.rtdbSet(window.rtdbRef(`agent_goals/${key}/${date}`), {
                agentId: String(agentId || ''),
                date,
                low: parsedLow,
                high: parsedHigh,
                hitLow: false,
                hitHigh: false,
                setByAdmin: true,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async function adminGetAgentGoals(agentId) {
        if (!firebaseReady()) return null;
        const date = getGuyanaDateISO();
        const key = safeFirebaseKey(agentId);
        try {
            const snapshot = await window.rtdbGet(window.rtdbRef(`agent_goals/${key}/${date}`));
            return normalizeGoals(snapshot.val());
        } catch (_) {
            return null;
        }
    }

    window.initGoalSystem = initGoalSystem;
    window.showGoalPopup = showGoalPopup;
    window.closeGoalPopup = closeGoalPopup;
    window.saveGoalPopup = saveGoalPopup;
    window.skipGoalPopup = skipGoalPopup;
    window.renderAgentGoalWidget = renderAgentGoalWidget;
    window.adminSetAgentGoals = adminSetAgentGoals;
    window.adminGetAgentGoals = adminGetAgentGoals;

    // Automatic bootstrap fixes timing issues caused by asynchronous tab injection.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initGoalSystem, 80), { once: true });
    } else {
        setTimeout(initGoalSystem, 80);
    }

    console.log('[Goals] Professional agent target system loaded');
})();
