/**
 * Dashboard Logic
 * All logged-in users see the full leaderboard.
 * The logged-in agent's own row is highlighted automatically.
 */

async function updateDashboard() {
    const btn = document.getElementById('refresh-btn');
    if (btn) btn.classList.add('spin-anim');

    try {
        const res = await fetch(API_URL);
        agents = await res.json();

        agents.forEach(a => {
            if (!a.team) a.team = getTeam(a.name);
        });

        if (agents.length > 0) {
            agents[0].todayName = getGuyanaToday();
        }

        if (agents.length > 0 && agents[0].dayHistory) {
            dayHistory = agents[0].dayHistory;
            dayHistory.forEach(d => {
                d.agents.forEach(a => {
                    if (!a.team) a.team = getTeam(a.name);
                });
            });
        }

        if (agents.length > 0 && !agents[0].prTotal && !agents[0].bbTotal) {
            let pr = 0, bb = 0;
            agents.forEach(a => {
                if (a.team === 'PR') pr += (a.dailyLeads || 0);
                else bb += (a.dailyLeads || 0);
            });
            agents[0].prTotal = pr;
            agents[0].bbTotal = bb;
        }

        if (agents.length > 0 && agents[0].prankNumbers && agents[0].prankNumbers.length > 0) {
            agents[0].prankNumbers.forEach(n => {
                if (n && !KNOWN_PRANK_NUMBERS.includes(n)) KNOWN_PRANK_NUMBERS.push(n);
            });
        }

        checkLeadAlerts(agents);
        render();
        renderDaySubTabs();

        const ts = document.getElementById('timestamp');
        if (ts) ts.innerText = 'Live: ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    } catch (e) {
        const ts = document.getElementById('timestamp');
        if (ts) ts.innerText = 'System Offline';
        console.error("Dashboard Update Error:", e);
    } finally {
        if (btn) setTimeout(() => btn.classList.remove('spin-anim'), 1000);
    }
}

setInterval(updateDashboard, 10000);

function render() {
    const agentProfileRaw = sessionStorage.getItem('currentAgentProfile');
    let userProfile = null;
    try { userProfile = JSON.parse(agentProfileRaw); } catch(e) {}
    const myName = userProfile ? (userProfile.name || '').trim().toUpperCase() : '';

    const lView = document.getElementById('leaderboard-view');
    const pView = document.getElementById('playbook-view');
    const luView = document.getElementById('lookup-view');
    const prView = document.getElementById('prank-view');
    const rbView = document.getElementById('rebuttals-view');
    const trView = document.getElementById('trivia-view');

    [lView, pView, luView, prView, rbView, trView].forEach(v => { if (v) v.classList.add('hidden'); });

    if (currentTab === 'playbook') { pView.classList.remove('hidden'); return; }
    if (currentTab === 'lookup') { luView.classList.remove('hidden'); return; }
    if (currentTab === 'prank') { if (prView) prView.classList.remove('hidden'); return; }
    if (currentTab === 'rebuttals') { if (rbView) rbView.classList.remove('hidden'); return; }
    if (currentTab === 'trivia') { if (trView) trView.classList.remove('hidden'); return; }

    lView.classList.remove('hidden');

    const isWeekly = currentTab === 'weekly';
    const isHistory = currentTab === 'daily' && currentDayView !== 'today';
    const target = isWeekly ? 800 : 150;
    const todayName = agents.length > 0 ? (agents[0].todayName || 'Today') : 'Today';

    const banner = document.getElementById('history-banner');
    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        document.getElementById('history-banner-text').innerText = 'Viewing ' + (snap ? snap.dayName : DAY_FULL[currentDayView]) + ' — Final Results';
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }

    const isAdmin = sessionStorage.getItem('bizUserRole') === 'admin';
    const targetDisplay = document.getElementById('target-display');

    document.getElementById('goal-label').innerText = isWeekly ? 'Weekly Team Goal' : isHistory ? DAY_FULL[currentDayView] + ' Final' : todayName + ' Daily Goal';

    if (targetDisplay) {
        targetDisplay.innerText = isAdmin ? 'Target: ' + target : '';
        targetDisplay.style.display = isAdmin ? '' : 'none';
    }

    document.getElementById('day-indicator').innerText = isWeekly ? 'Weekly Sprint' : isHistory ? DAY_SHORT[currentDayView] + ' — Completed' : todayName + ' Performance';

    let fullList = [];
    let prTotal = 0, bbTotal = 0, totalLeads = 0, masters = 0, activeReps = 0;

    if (isHistory) {
        const snap = dayHistory.find(d => d.day === currentDayView);
        if (snap) {
            fullList = [...snap.agents].sort((a, b) => b.leads - a.leads);
            prTotal = snap.prTotal || 0;
            bbTotal = snap.bbTotal || 0;
            if (!prTotal && !bbTotal) {
                fullList.forEach(a => { if (a.team === 'PR') prTotal += a.leads; else bbTotal
