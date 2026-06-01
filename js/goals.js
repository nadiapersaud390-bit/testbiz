// js/goals.js
// Daily Goal Setting System for Agents — stored in Firebase RTDB (resets daily by date key)

let currentUserGoals = null;
let currentUser = null;

function initGoalSystem() {
    const userRole = sessionStorage.getItem('bizUserRole');
    if (userRole !== 'agent') return;

    const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
    if (!profile || (!profile.ytelId && !profile.userId)) return;

    currentUser = profile;
    currentUser.ytelId = currentUser.ytelId || currentUser.userId;

    checkAndShowGoalPopup();
    renderAgentGoalWidget();
    setupGoalStatsListener();
}

async function checkAndShowGoalPopup() {
    const today = getTodayISO();
    const agentId = currentUser.ytelId;

    const skipped = sessionStorage.getItem('goal_skipped_' + today);
    if (skipped === 'true') return;

    if (!window.rtdbGet || !window.rtdbRef) {
        setTimeout(checkAndShowGoalPopup, 800);
        return;
    }

    try {
        const snapshot = await window.rtdbGet(window.rtdbRef('agent_goals/' + agentId + '/' + today));
        if (snapshot.val()) {
            currentUserGoals = snapshot.val();
            currentUserGoals.hasSetToday = true;
            renderAgentGoalWidget();
        } else {
            setTimeout(() => showGoalPopup(), 1000);
        }
    } catch (error) {
        console.warn('Goal check failed:', error);
        setTimeout(() => showGoalPopup(), 1000);
    }
}

function showGoalPopup() {
    let modal = document.getElementById('goal-popup-modal');
    if (!modal) {
        createGoalModal();
        modal = document.getElementById('goal-popup-modal');
    }

    if (modal) {
        modal.classList.remove('hidden');

        const dateEl = document.getElementById('goal-popup-date');
        if (dateEl) {
            const now = new Date();
            const guyanaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
            dateEl.textContent = guyanaTime.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric'
            });
        }

        const lowInput = document.getElementById('goal-low-input');
        const highInput = document.getElementById('goal-high-input');
        const errorEl = document.getElementById('goal-popup-error');

        if (currentUserGoals && currentUserGoals.low) {
            if (lowInput) lowInput.value = currentUserGoals.low;
            if (highInput) highInput.value = currentUserGoals.high;
        } else {
            if (lowInput) lowInput.value = '';
            if (highInput) highInput.value = '';
        }
        if (errorEl) errorEl.textContent = '';

        setTimeout(() => { if (lowInput) lowInput.focus(); }, 100);
    }
}

function createGoalModal() {
    const modalHTML = `
    <div id="goal-popup-modal" class="goal-modal hidden">
        <div class="goal-modal-content">
            <div class="goal-modal-header">
                <span class="goal-modal-icon">🎯</span>
                <h2>Set Today's Goals</h2>
                <button class="goal-modal-close" onclick="closeGoalPopup()">×</button>
            </div>
            <div class="goal-modal-body">
                <p class="goal-modal-date" id="goal-popup-date">Loading...</p>

                <div class="goal-input-group">
                    <label class="goal-label low">
                        <i class="fas fa-flag-checkered"></i> Low Target
                    </label>
                    <input type="number" id="goal-low-input" class="goal-input"
                           placeholder="e.g., 12" min="1" max="100">
                    <p class="goal-hint">Minimum goal you want to hit today</p>
                </div>

                <div class="goal-input-group">
                    <label class="goal-label high">
                        <i class="fas fa-trophy"></i> High Target
                    </label>
                    <input type="number" id="goal-high-input" class="goal-input"
                           placeholder="e.g., 20" min="1" max="100">
                    <p class="goal-hint">Stretch goal — push yourself!</p>
                </div>

                <div id="goal-popup-error" class="goal-error"></div>

                <div class="goal-modal-buttons">
                    <button class="goal-btn-save" onclick="saveGoalPopup()">
                        <i class="fas fa-lock"></i> Lock In My Targets
                    </button>
                    <button class="goal-btn-skip" onclick="skipGoalPopup()">
                        Skip for Today
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    if (!document.getElementById('goal-modal-styles')) {
        const styles = document.createElement('style');
        styles.id = 'goal-modal-styles';
        styles.textContent = `
            .goal-modal {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(2, 6, 23, 0.92);
                backdrop-filter: blur(12px);
                z-index: 100000;
                display: flex; align-items: center; justify-content: center;
                font-family: 'Inter', sans-serif;
            }
            .goal-modal.hidden { display: none; }
            .goal-modal-content {
                background: linear-gradient(135deg, #0d1424, #0a1020);
                border: 1px solid rgba(250, 204, 21, 0.3);
                border-radius: 24px; width: 90%; max-width: 420px;
                animation: goalSlideIn 0.3s ease;
                box-shadow: 0 0 60px rgba(250, 204, 21, 0.15);
            }
            @keyframes goalSlideIn {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .goal-modal-header {
                padding: 20px 24px;
                border-bottom: 1px solid rgba(255,255,255,0.08);
                display: flex; align-items: center; gap: 12px; position: relative;
            }
            .goal-modal-icon { font-size: 28px; }
            .goal-modal-header h2 {
                font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 900;
                background: linear-gradient(90deg, #facc15, #fb923c);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                background-clip: text; margin: 0;
            }
            .goal-modal-close {
                margin-left: auto; background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
                color: #64748b; width: 32px; height: 32px; cursor: pointer;
                font-size: 20px; transition: all 0.2s;
            }
            .goal-modal-close:hover { background: rgba(239,68,68,0.2); color: #ef4444; }
            .goal-modal-body { padding: 24px; }
            .goal-modal-date {
                text-align: center; font-size: 12px; font-weight: 700;
                color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px;
            }
            .goal-input-group { margin-bottom: 20px; }
            .goal-label {
                display: flex; align-items: center; gap: 8px; font-size: 11px;
                font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;
            }
            .goal-label.low { color: #34d399; }
            .goal-label.high { color: #60a5fa; }
            .goal-input {
                width: 100%; padding: 14px 16px;
                background: rgba(0,0,0,0.4); border: 1.5px solid rgba(255,255,255,0.1);
                border-radius: 12px; color: white; font-size: 24px; font-weight: 800;
                text-align: center; font-family: 'Orbitron', sans-serif;
                outline: none; transition: all 0.2s;
            }
            .goal-input:focus { border-color: #facc15; box-shadow: 0 0 0 3px rgba(250,204,21,0.1); }
            .goal-hint { font-size: 10px; color: #475569; margin-top: 6px; text-align: center; }
            .goal-error {
                color: #ef4444; font-size: 11px; font-weight: 700;
                text-align: center; margin: 10px 0; min-height: 20px;
            }
            .goal-modal-buttons { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
            .goal-btn-save {
                padding: 14px; border-radius: 12px; border: none;
                background: linear-gradient(90deg, #facc15, #fb923c);
                color: #020617; font-family: 'Orbitron', sans-serif;
                font-weight: 900; font-size: 13px; letter-spacing: 1px; cursor: pointer; transition: all 0.2s;
            }
            .goal-btn-save:hover { transform: scale(1.02); opacity: 0.95; }
            .goal-btn-skip {
                padding: 10px; border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1); background: transparent;
                color: #64748b; font-family: 'Orbitron', sans-serif;
                font-weight: 800; font-size: 11px; cursor: pointer; transition: all 0.2s;
            }
            .goal-btn-skip:hover { color: #94a3b8; background: rgba(255,255,255,0.05); }

            .goal-widget-container {
                background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
                border-radius: 12px; padding: 12px 16px; margin-top: 8px;
            }
            .goal-widget-header { display: flex; gap: 16px; font-size: 11px; font-weight: 800; margin-bottom: 10px; flex-wrap: wrap; }
            .goal-label-low { color: #34d399; }
            .goal-label-high { color: #60a5fa; }
            .goal-label-actual { color: #facc15; }
            .goal-progress-bars { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
            .goal-progress-low, .goal-progress-high {
                height: 8px; background: rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden;
            }
            .goal-progress-fill { height: 100%; border-radius: 10px; transition: width 0.5s ease; }
            .goal-status {
                font-size: 10px; font-weight: 700; text-align: center;
                margin: 10px 0; padding: 6px; border-radius: 8px;
            }
            .goal-status-hit { background: rgba(250,204,21,0.15); color: #facc15; }
            .goal-status-low-hit { background: rgba(52,211,153,0.1); color: #34d399; }
            .goal-status-miss { background: rgba(248,113,113,0.08); color: #f87171; }
            .goal-edit-small {
                width: 100%; padding: 8px; border-radius: 8px;
                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
                color: #64748b; font-size: 10px; font-weight: 800; cursor: pointer; transition: all 0.2s;
            }
            .goal-edit-small:hover { background: rgba(255,255,255,0.1); color: white; }
            .goal-edit-btn {
                padding: 4px 12px; border-radius: 8px;
                background: rgba(250,204,21,0.1); border: 1px solid rgba(250,204,21,0.3);
                color: #facc15; font-size: 10px; font-weight: 800; cursor: pointer;
            }
        `;
        document.head.appendChild(styles);
    }
}

async function saveGoalPopup() {
    const lowInput = document.getElementById('goal-low-input');
    const highInput = document.getElementById('goal-high-input');
    const errorEl = document.getElementById('goal-popup-error');

    const low = parseInt(lowInput.value);
    const high = parseInt(highInput.value);

    if (isNaN(low) || low < 1) {
        if (errorEl) errorEl.textContent = 'Please enter a valid Low Target (minimum 1)';
        return;
    }
    if (isNaN(high) || high < 1) {
        if (errorEl) errorEl.textContent = 'Please enter a valid High Target (minimum 1)';
        return;
    }
    if (high < low) {
        if (errorEl) errorEl.textContent = 'High Target must be greater than or equal to Low Target';
        return;
    }

    if (errorEl) errorEl.textContent = '';

    const today = getTodayISO();
    const agentId = currentUser.ytelId;

    const saveBtn = document.querySelector('.goal-btn-save');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;
    }

    if (!window.rtdbSet || !window.rtdbRef) {
        if (errorEl) errorEl.textContent = 'Database not ready. Please try again.';
        if (saveBtn) { saveBtn.innerHTML = originalText; saveBtn.disabled = false; }
        return;
    }

    try {
        await window.rtdbSet(window.rtdbRef('agent_goals/' + agentId + '/' + today), {
            agentId: agentId,
            agentName: currentUser.name || currentUser.fullName || '',
            ytelName: currentUser.ytelName || '',
            team: currentUser.team || 'PR',
            date: today,
            low: low,
            high: high,
            hitLow: false,
            hitHigh: false,
            createdAt: Date.now()
        });

        currentUserGoals = { low, high, hitLow: false, hitHigh: false, hasSetToday: true };
        closeGoalPopup();
        renderAgentGoalWidget();
        showGoalToast('🎯 Goals saved! Track your progress today.', 'success');

    } catch (error) {
        console.error('Save goal error:', error);
        if (errorEl) errorEl.textContent = 'Failed to save. Please try again.';
        showGoalToast('❌ Failed to save goals. Please try again.', 'error');
    } finally {
        if (saveBtn) { saveBtn.innerHTML = originalText; saveBtn.disabled = false; }
    }
}

function skipGoalPopup() {
    const today = getTodayISO();
    sessionStorage.setItem('goal_skipped_' + today, 'true');
    closeGoalPopup();
    showGoalToast('⏭️ You can set your goals later by clicking "Edit Goals"', 'info');
}

function closeGoalPopup() {
    const modal = document.getElementById('goal-popup-modal');
    if (modal) modal.classList.add('hidden');
}

function showGoalToast(message, type) {
    let toast = document.getElementById('goal-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'goal-toast';
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            padding: 12px 24px; border-radius: 12px; font-size: 12px; font-weight: 800;
            letter-spacing: 0.5px; z-index: 100001; transition: opacity 0.3s ease;
            opacity: 0; pointer-events: none; white-space: nowrap;
        `;
        document.body.appendChild(toast);
    }
    const colors = {
        success: 'linear-gradient(135deg, #064e3b, #059669)',
        error: 'linear-gradient(135deg, #7f1d1d, #dc2626)',
        info: 'linear-gradient(135deg, #1e3a5f, #3b82f6)'
    };
    toast.style.background = colors[type] || colors.info;
    toast.style.color = 'white';
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function renderAgentGoalWidget() {
    const isAgent = sessionStorage.getItem('bizUserRole') === 'agent';
    if (!isAgent) return;

    const container = document.getElementById('agent-goal-widget-container');
    if (!container) {
        // Tab may not be loaded yet — retry shortly
        clearTimeout(renderAgentGoalWidget._retryTimer);
        renderAgentGoalWidget._retryTimer = setTimeout(renderAgentGoalWidget, 600);
        return;
    }

    // Get actual transfer count from live state
    let actual = 0;
    const myName = (currentUser.fullName || currentUser.name || '').toUpperCase().trim();
    const myId   = String(currentUser.ytelId || currentUser.userId || '');

    if (window._asLastLiveState && Array.isArray(window._asLastLiveState.agents)) {
        const match = window._asLastLiveState.agents.find(a => {
            const aName = (a.name || '').toUpperCase().trim();
            return aName === myName || (myId && String(a.ytelId || '') === myId);
        });
        if (match) actual = match.dailyLeads || 0;
    }

    // Show container
    container.style.display = 'block';

    if (!currentUserGoals || !currentUserGoals.low) {
        container.innerHTML = `
        <div class="agw-no-goal" onclick="showGoalPopup()" title="Click to set your goals">
            <span class="agw-ng-icon">🎯</span>
            <div>
                <div class="agw-ng-title">No goals set for today</div>
                <div class="agw-ng-sub">Tap to lock in your targets and track your progress</div>
            </div>
            <span class="agw-ng-cta">Set Goals →</span>
        </div>`;
        injectGoalStyles();
        return;
    }

    const { low, high } = currentUserGoals;
    const pctLow  = Math.min(100, Math.round((actual / low)  * 100));
    const pctHigh = Math.min(100, Math.round((actual / high) * 100));

    const hitHigh = actual >= high;
    const hitLow  = actual >= low;
    const toLow   = Math.max(0, low  - actual);
    const toHigh  = Math.max(0, high - actual);

    // Motivational quotes
    const quotes = [
        "Champions don't wait for motivation — they create it.",
        "Every transfer is a step closer. Keep dialing.",
        "Your low target is the floor, not the ceiling.",
        "The scoreboard doesn't lie. Make it proud.",
        "One more transfer changes everything.",
        "Success is built one call at a time.",
        "Consistency is the only strategy that never fails.",
        "Push through. The numbers will follow.",
        "Make today's numbers tomorrow's motivation.",
        "Pressure makes diamonds. Keep pushing.",
        "The grind today is the glory tomorrow.",
        "You didn't come this far to only come this far."
    ];
    // Pick quote based on date so it changes daily but is consistent per session
    const dayIdx = new Date().getDate() % quotes.length;
    const quote  = quotes[dayIdx];

    // Status line
    let statusLine = '';
    let statusClass = 'agw-status-push';
    if (hitHigh) {
        statusLine = '🔥 HIGH TARGET CRUSHED! You're an absolute machine today.';
        statusClass = 'agw-status-fire';
    } else if (hitLow) {
        statusLine = `✅ Low target hit! ${toHigh} more to crush the HIGH.`;
        statusClass = 'agw-status-green';
    } else if (actual === 0) {
        statusLine = `Hit ${low} to reach LOW · ${high} to reach HIGH`;
        statusClass = 'agw-status-push';
    } else {
        statusLine = `${toLow} more to hit LOW · ${toHigh} more for HIGH`;
        statusClass = 'agw-status-push';
    }

    container.innerHTML = `
    <div class="agw-card">
        <div class="agw-quote">"${quote}"</div>

        <div class="agw-body">
            <div class="agw-numbers">
                <div class="agw-num-block">
                    <div class="agw-num agw-num-low">${low}</div>
                    <div class="agw-num-label">Low Target</div>
                </div>
                <div class="agw-divider-v"></div>
                <div class="agw-num-block">
                    <div class="agw-num agw-num-high">${high}</div>
                    <div class="agw-num-label">High Target</div>
                </div>
                <div class="agw-divider-v"></div>
                <div class="agw-num-block">
                    <div class="agw-num agw-num-actual ${hitHigh ? 'agw-fire' : hitLow ? 'agw-green' : ''}">${actual}</div>
                    <div class="agw-num-label">My Transfers</div>
                </div>
            </div>

            <div class="agw-bars">
                <div class="agw-bar-row">
                    <span class="agw-bar-tag agw-bar-tag-low">LOW</span>
                    <div class="agw-bar-track">
                        <div class="agw-bar-fill agw-bar-fill-low" style="width:${pctLow}%"></div>
                    </div>
                    <span class="agw-bar-pct">${pctLow}%</span>
                </div>
                <div class="agw-bar-row">
                    <span class="agw-bar-tag agw-bar-tag-high">HIGH</span>
                    <div class="agw-bar-track">
                        <div class="agw-bar-fill agw-bar-fill-high" style="width:${pctHigh}%"></div>
                    </div>
                    <span class="agw-bar-pct">${pctHigh}%</span>
                </div>
            </div>
        </div>

        <div class="agw-footer">
            <div class="agw-status ${statusClass}">${statusLine}</div>
            <button class="agw-edit-btn" onclick="showGoalPopup()">✏ Edit Goals</button>
        </div>
    </div>`;

    injectGoalStyles();
}

function injectGoalStyles() {
    if (document.getElementById('agw-styles')) return;
    const s = document.createElement('style');
    s.id = 'agw-styles';
    s.textContent = `
    /* Agent Goal Widget */
    .agw-card {
        background: linear-gradient(135deg, rgba(10,12,28,0.95), rgba(5,8,18,0.98));
        border: 1px solid rgba(250,204,21,0.25);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 4px 40px rgba(250,204,21,0.06), 0 0 0 1px rgba(255,255,255,0.04) inset;
        font-family: 'Inter', sans-serif;
    }
    .agw-quote {
        padding: 10px 18px;
        font-size: 10.5px;
        font-style: italic;
        color: #475569;
        font-weight: 600;
        letter-spacing: 0.02em;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        background: rgba(0,0,0,0.2);
        text-align: center;
    }
    .agw-body {
        display: flex;
        align-items: center;
        gap: 0;
        padding: 0;
    }
    .agw-numbers {
        display: flex;
        align-items: center;
        padding: 14px 16px;
        gap: 0;
        flex-shrink: 0;
    }
    .agw-num-block {
        text-align: center;
        padding: 0 16px;
    }
    .agw-num {
        font-family: 'Orbitron', 'Inter', sans-serif;
        font-size: 32px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: -0.02em;
        color: #f1f5f9;
    }
    .agw-num-low   { color: #34d399; text-shadow: 0 0 20px rgba(52,211,153,0.3); }
    .agw-num-high  { color: #60a5fa; text-shadow: 0 0 20px rgba(96,165,250,0.3); }
    .agw-num-actual{ color: #facc15; text-shadow: 0 0 20px rgba(250,204,21,0.3); }
    .agw-num.agw-fire  { color: #fb923c; text-shadow: 0 0 24px rgba(251,146,60,0.5); animation: agwPulse 1.5s ease-in-out infinite; }
    .agw-num.agw-green { color: #34d399; text-shadow: 0 0 20px rgba(52,211,153,0.4); }
    @keyframes agwPulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
    .agw-num-label {
        font-size: 7.5px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #334155;
        margin-top: 5px;
    }
    .agw-divider-v {
        width: 1px;
        height: 40px;
        background: rgba(255,255,255,0.07);
        flex-shrink: 0;
    }
    .agw-bars {
        flex: 1;
        padding: 12px 16px 12px 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        border-left: 1px solid rgba(255,255,255,0.05);
    }
    .agw-bar-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .agw-bar-tag {
        font-size: 7px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        min-width: 28px;
        text-align: right;
    }
    .agw-bar-tag-low  { color: #34d399; }
    .agw-bar-tag-high { color: #60a5fa; }
    .agw-bar-track {
        flex: 1;
        height: 10px;
        background: rgba(255,255,255,0.06);
        border-radius: 99px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.04);
    }
    .agw-bar-fill {
        height: 100%;
        border-radius: 99px;
        transition: width 0.8s cubic-bezier(0.16,1,0.3,1);
    }
    .agw-bar-fill-low  { background: linear-gradient(90deg, #059669, #34d399); box-shadow: 0 0 8px rgba(52,211,153,0.4); }
    .agw-bar-fill-high { background: linear-gradient(90deg, #1d4ed8, #60a5fa); box-shadow: 0 0 8px rgba(96,165,250,0.4); }
    .agw-bar-pct {
        font-size: 8px;
        font-weight: 800;
        color: #475569;
        min-width: 28px;
        text-align: right;
        font-family: 'Orbitron', monospace;
    }
    .agw-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        border-top: 1px solid rgba(255,255,255,0.04);
        background: rgba(0,0,0,0.15);
        gap: 12px;
    }
    .agw-status {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
    }
    .agw-status-push  { color: #64748b; }
    .agw-status-green { color: #34d399; }
    .agw-status-fire  { color: #fb923c; animation: agwPulse 1.5s ease-in-out infinite; }
    .agw-edit-btn {
        flex-shrink: 0;
        padding: 5px 14px;
        border-radius: 8px;
        background: rgba(250,204,21,0.08);
        border: 1px solid rgba(250,204,21,0.25);
        color: #facc15;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    }
    .agw-edit-btn:hover { background: rgba(250,204,21,0.18); transform: scale(1.03); }
    /* No-goal state */
    .agw-no-goal {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 18px;
        background: rgba(10,12,28,0.9);
        border: 1px dashed rgba(250,204,21,0.2);
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .agw-no-goal:hover { border-color: rgba(250,204,21,0.4); background: rgba(250,204,21,0.04); }
    .agw-ng-icon { font-size: 22px; flex-shrink: 0; }
    .agw-ng-title { font-size: 12px; font-weight: 800; color: #94a3b8; }
    .agw-ng-sub   { font-size: 10px; color: #475569; margin-top: 2px; }
    .agw-ng-cta   { margin-left: auto; font-size: 10px; font-weight: 800; color: #facc15; white-space: nowrap; }
    @media (max-width: 600px) {
        .agw-numbers { padding: 12px 10px; }
        .agw-num-block { padding: 0 10px; }
        .agw-num { font-size: 24px; }
        .agw-bars { padding: 10px 10px 10px 6px; }
    }
    `;
    document.head.appendChild(s);
}

function setupGoalStatsListener() {
    if (typeof window.listenForLiveDashboardState === 'function') {
        window.listenForLiveDashboardState(() => {
            if (currentUser && !currentUser.isAdmin) renderAgentGoalWidget();
        });
    }
    if (typeof window.listenForAgentReports === 'function') {
        window.listenForAgentReports(() => {
            if (currentUser && !currentUser.isAdmin) setTimeout(() => renderAgentGoalWidget(), 100);
        });
    }
}

function getTodayISO() {
    const now = new Date();
    const guyanaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guyana' }));
    return guyanaTime.toISOString().split('T')[0];
}

// Admin helper: set goals for a specific agent (called from agentprofiles)
window.adminSetAgentGoals = async function(agentId, low, high) {
    if (!window.rtdbSet || !window.rtdbRef) return { success: false, error: 'DB not ready' };
    const today = getTodayISO();
    try {
        await window.rtdbSet(window.rtdbRef('agent_goals/' + agentId + '/' + today), {
            agentId: agentId,
            date: today,
            low: low,
            high: high,
            hitLow: false,
            hitHigh: false,
            setByAdmin: true,
            createdAt: Date.now()
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
};

// Admin helper: get goals for a specific agent
window.adminGetAgentGoals = async function(agentId) {
    if (!window.rtdbGet || !window.rtdbRef) return null;
    const today = getTodayISO();
    try {
        const snap = await window.rtdbGet(window.rtdbRef('agent_goals/' + agentId + '/' + today));
        return snap.val();
    } catch (e) {
        return null;
    }
};

window.initGoalSystem = initGoalSystem;
window.showGoalPopup = showGoalPopup;
window.closeGoalPopup = closeGoalPopup;
window.saveGoalPopup = saveGoalPopup;
window.skipGoalPopup = skipGoalPopup;
window.renderAgentGoalWidget = renderAgentGoalWidget;

console.log('[Goals] Goal system loaded (RTDB)');
