(function () {
    'use strict';

    const QA_PATH = 'qa_call_reviews';
    const $ = function (id) { return document.getElementById(id); };
    const SCORECARD_ITEMS = [
        { key: 'agentOpening', section: 'Agent', label: 'Opened professionally and explained the call purpose' },
        { key: 'businessDetails', section: 'Agent', label: 'Confirmed time in business and full legal business name' },
        { key: 'ownerIdentity', section: 'Agent', label: 'Confirmed the owner or decision-maker and full legal name' },
        { key: 'industryRevenue', section: 'Agent', label: 'Confirmed the industry and annual revenue' },
        { key: 'qualification', section: 'Agent', label: 'Completed required qualification before moving forward' },
        { key: 'disqualifierHandling', section: 'Agent', label: 'Handled DNC, removal, prank, partner, and disqualifier cases correctly' },
        { key: 'objectionHandling', section: 'Agent', label: 'Handled questions and objections accurately and professionally' },
        { key: 'warmTransfer', section: 'Agent', label: 'Made a clear warm transfer with useful call context' },
        { key: 'specialistHandoff', section: 'Loan specialist', label: 'Acknowledged the warm handoff and information already collected' },
        { key: 'specialistSupport', section: 'Loan specialist', label: 'Addressed the customer need and explained an accurate next step' }
    ];
    let qaRecords = [];
    let qaListener = null;
    let qaSaving = false;
    let qaAgentBound = false;
    let qaRosterBound = false;
    let qaRosterListener = null;

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function currentAdmin() {
        try { return JSON.parse(sessionStorage.getItem('currentAdmin') || '{}') || {}; }
        catch (_) { return {}; }
    }

    function hasQAAccess() {
        return sessionStorage.getItem('bizUserRole') === 'admin' &&
            typeof window.canAccessAdminHubTab === 'function' &&
            window.canAccessAdminHubTab('qa');
    }

    function localToday() {
        try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guyana' }); }
        catch (_) { return new Date().toISOString().slice(0, 10); }
    }

    function cleanTeam(value) {
        const v = String(value || '').trim().toUpperCase();
        if (v === 'BB' || v.indexOf('BERB') >= 0) return 'BB';
        if (v === 'PR' || v.indexOf('PROV') >= 0) return 'PR';
        if (v === 'RM' || v.indexOf('REMOTE') >= 0) return 'RM';
        return '';
    }

    function normalizeRoster(source) {
        let list = Array.isArray(source) ? source.slice() : (source && typeof source === 'object' ? Object.values(source) : []);
        if (typeof window.filterDeletedAgents === 'function') list = window.filterDeletedAgents(list);
        const seen = new Set();
        return list.filter(function (agent) {
            if (!agent || String(agent.status || '').toLowerCase() === 'inactive') return false;
            const id = String(agent.userId || agent.userID || agent.ytelId || agent.id || agent.agentId || agent.agentID || agent.userid || '').trim();
            if (!id || seen.has(id.toLowerCase())) return false;
            seen.add(id.toLowerCase());
            return true;
        }).sort(function (a, b) {
            const an = String(a.fullName || a.name || a.agentName || a.ytelName || '').toLowerCase();
            const bn = String(b.fullName || b.name || b.agentName || b.ytelName || '').toLowerCase();
            return an.localeCompare(bn);
        });
    }

    function roster() {
        let list = Array.isArray(window.allAgentProfiles) ? window.allAgentProfiles.slice() : [];
        if (!list.length) {
            try {
                const cached = JSON.parse(localStorage.getItem('biz_master_roster') || '[]');
                if (Array.isArray(cached) || (cached && typeof cached === 'object')) list = cached;
            } catch (_) {}
        }
        return normalizeRoster(list);
    }

    function populateAgents(selectedId, source) {
        const select = $('qa-agent');
        if (!select) return 0;
        const oldValue = selectedId || select.value;
        const agents = source === undefined ? roster() : normalizeRoster(source);
        select.innerHTML = '<option value="">Select an agent</option>' + agents.map(function (agent) {
            const id = String(agent.userId || agent.userID || agent.ytelId || agent.id || agent.agentId || agent.agentID || agent.userid || '').trim();
            const name = String(agent.fullName || agent.name || agent.agentName || agent.ytelName || id || 'Agent').trim();
            const team = cleanTeam(agent.team || agent.group || agent.location);
            return '<option value="' + esc(id) + '" data-name="' + esc(name) + '" data-team="' + esc(team) + '">' + esc(name) + ' · ' + esc(id) + '</option>';
        }).join('');
        if (oldValue) select.value = oldValue;
        return agents.length;
    }

    function applyRosterUpdate(source) {
        const agents = normalizeRoster(source);
        window.allAgentProfiles = agents.slice();
        try { localStorage.setItem('biz_master_roster', JSON.stringify(agents)); } catch (_) {}
        const selectedId = $('qa-agent') ? $('qa-agent').value : '';
        const count = populateAgents(selectedId, agents);
        setStatus('qa-agent-status', count ? count + ' active agent' + (count === 1 ? '' : 's') + ' loaded.' : 'No active agents were found. Check the Firebase agent roster.', count ? '' : 'error');
    }

    function bindAgentRoster() {
        if (qaRosterBound) return;
        qaRosterBound = true;
        window.addEventListener('biz-active-roster-updated', function (event) {
            applyRosterUpdate(event && event.detail ? event.detail : roster());
        });
        window.addEventListener('biz-deleted-agents-updated', function () {
            applyRosterUpdate(window.allAgentProfiles || roster());
        });
        if (typeof window.listenForMasterRoster === 'function') {
            qaRosterListener = window.listenForMasterRoster(applyRosterUpdate);
        } else if (window.rtdbRef && window.rtdbGet) {
            window.rtdbGet(window.rtdbRef('biz_master_roster')).then(function (snapshot) {
                applyRosterUpdate(snapshot && typeof snapshot.val === 'function' ? snapshot.val() : []);
            }).catch(function () {
                setStatus('qa-agent-status', 'Could not load the Firebase agent roster. Try reopening QA.', 'error');
            });
        }
    }

    function setStatus(id, message, kind) {
        const el = $(id);
        if (!el) return;
        el.textContent = message || '';
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-success', kind === 'success');
    }

    function setBusy(busy) {
        const button = $('qa-save-button');
        if (!button) return;
        button.disabled = !!busy;
        button.textContent = busy ? 'Saving…' : ($('qa-edit-id') && $('qa-edit-id').value ? 'Update Call Report' : 'Save Call Report');
    }

    function asDate(record) {
        return String(record && (record.date || record.callDate) || '').slice(0, 10);
    }

    function sortRecords(list) {
        return list.slice().sort(function (a, b) {
            const byDate = asDate(b).localeCompare(asDate(a));
            return byDate || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
        });
    }

    function normalizeReason(value) {
        const reason = String(value || '').trim();
        const lower = reason.toLowerCase();
        if (lower === 'attorney') return 'Attorney / Legal';
        if (lower === 'unqualified') return 'Unqualified business';
        if (lower === 'unclear audio') return 'Unclear / Incomplete Record';
        return reason;
    }

    function reasonMatches(record, selectedReason) {
        const selected = normalizeReason(selectedReason).toLowerCase();
        return [record.primaryReason, record.additionalReason].some(function (value) {
            return normalizeReason(value).toLowerCase().indexOf(selected) >= 0;
        });
    }

    function selectedReportRecords() {
        const from = $('qa-filter-from') ? $('qa-filter-from').value : '';
        const to = $('qa-filter-to') ? $('qa-filter-to').value : '';
        const team = $('qa-filter-team') ? $('qa-filter-team').value : '';
        const reason = $('qa-filter-reason') ? $('qa-filter-reason').value : '';
        const outcome = $('qa-filter-outcome') ? $('qa-filter-outcome').value : '';
        const issueSource = $('qa-filter-source') ? $('qa-filter-source').value : '';
        const agent = $('qa-filter-agent') ? $('qa-filter-agent').value.trim().toLowerCase() : '';
        return sortRecords(qaRecords).filter(function (r) {
            const date = asDate(r);
            if (from && date < from) return false;
            if (to && date > to) return false;
            if (team && cleanTeam(r.team) !== team) return false;
            if (reason && !reasonMatches(r, reason)) return false;
            if (outcome && String(r.outcome || '').toLowerCase() !== outcome.toLowerCase()) return false;
            if (issueSource && String(r.issueSource || '') !== issueSource) return false;
            if (agent && String(r.agentName || '').toLowerCase().indexOf(agent) < 0 && String(r.agentId || '').toLowerCase().indexOf(agent) < 0) return false;
            return true;
        });
    }

    function scorecardScore(record) {
        const ratings = SCORECARD_ITEMS.map(function (item) { return record && record.scorecard ? record.scorecard[item.key] : ''; })
            .filter(function (rating) { return rating === 'Meets standard' || rating === 'Needs coaching'; });
        if (!ratings.length) return null;
        const meets = ratings.filter(function (rating) { return rating === 'Meets standard'; }).length;
        return Math.round(meets * 100 / ratings.length);
    }

    function hasCoachingFlag(record) {
        return Boolean(record && (record.needsFollowUp || SCORECARD_ITEMS.some(function (item) {
            return record.scorecard && record.scorecard[item.key] === 'Needs coaching';
        })));
    }

    function updateStats() {
        const reportRecords = selectedReportRecords();
        const invalid = reportRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'invalid'; });
        const valid = reportRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'valid'; });
        const pending = reportRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'pending'; });
        const scores = reportRecords.filter(function (r) { return ['valid', 'invalid'].includes(String(r.outcome || '').toLowerCase()); })
            .map(scorecardScore).filter(function (score) { return score !== null; });
        const reasons = {};
        invalid.forEach(function (r) {
            const callReasons = [r.primaryReason, r.additionalReason].filter(Boolean).map(normalizeReason);
            Array.from(new Set(callReasons)).forEach(function (reason) {
                reasons[reason] = (reasons[reason] || 0) + 1;
            });
        });
        const top = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a] || a.localeCompare(b); })[0] || '—';
        if ($('qa-stat-total')) $('qa-stat-total').textContent = String(valid.length + invalid.length);
        if ($('qa-stat-valid')) $('qa-stat-valid').textContent = String(valid.length);
        if ($('qa-stat-invalid')) $('qa-stat-invalid').textContent = String(invalid.length);
        if ($('qa-stat-pending')) $('qa-stat-pending').textContent = String(pending.length);
        if ($('qa-stat-coaching')) $('qa-stat-coaching').textContent = String(reportRecords.filter(hasCoachingFlag).length);
        if ($('qa-stat-score')) $('qa-stat-score').textContent = scores.length ? Math.round(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length) + '%' : '—';
        if ($('qa-stat-top-reason')) $('qa-stat-top-reason').textContent = top;
    }

    function outcomeMarkup(outcome) {
        const label = String(outcome || 'Pending');
        const css = label.toLowerCase() === 'valid' ? 'valid' : (label.toLowerCase() === 'invalid' ? 'invalid' : 'pending');
        return '<span class="qa-outcome-pill qa-outcome-' + css + '">' + esc(label) + '</span>';
    }

    function rowMarkup(r) {
        const finding = [
            r.reviewFinding ? 'Finding: ' + r.reviewFinding : '',
            r.strengths ? 'Strength: ' + r.strengths : '',
            r.coachingTip ? 'Coaching: ' + r.coachingTip : '',
            r.actionPlan ? 'Action: ' + r.actionPlan : ''
        ].filter(Boolean).join(' · ');
        const score = scorecardScore(r);
        return '<tr>' +
            '<td><strong>' + esc(asDate(r)) + '</strong><br><span class="qa-muted">' + esc(r.callType || 'Call type not recorded') + '</span></td>' +
            '<td><strong>' + esc(r.agentName || 'Unknown') + '</strong><br><span class="qa-muted">' + esc(r.agentId || '') + '</span>' + (r.loanSpecialist ? '<br><span class="qa-muted">Specialist: ' + esc(r.loanSpecialist) + '</span>' : '') + '</td>' +
            '<td>' + esc(cleanTeam(r.team) || r.team || '—') + '</td>' +
            '<td>' + esc(r.callNumber || r.callId || '—') + '</td>' +
            '<td>' + esc(r.customerNumber || (r.phoneLast4 ? '…' + r.phoneLast4 : '—')) + '</td>' +
            '<td>' + outcomeMarkup(r.outcome) + '</td>' +
            '<td>' + esc(r.primaryReason || '—') + (r.additionalReason ? '<br><span class="qa-muted">' + esc(r.additionalReason) + '</span>' : '') + '</td>' +
            '<td>' + (score === null ? '—' : score + '%') + '</td>' +
            '<td>' + esc(r.issueSource || '—') + '</td>' +
            '<td>' + esc(finding || r.qaNotes || '—') + (hasCoachingFlag(r) ? '<br><span class="qa-follow-up-pill">Coaching follow-up</span>' : '') + (r.followUpDate ? '<br><span class="qa-muted">Follow up: ' + esc(r.followUpDate) + '</span>' : '') + '</td>' +
            '<td><div class="qa-row-actions"><button type="button" data-qa-edit="' + esc(r.id) + '">Edit</button><button type="button" data-qa-print="' + esc(r.id) + '">Print</button><button type="button" data-qa-delete="' + esc(r.id) + '">Delete</button></div></td>' +
            '</tr>';
    }

    window.qaRenderReport = function () {
        updateStats();
        const body = $('qa-report-body');
        if (!body) return;
        const rows = selectedReportRecords();
        if ($('qa-report-count')) $('qa-report-count').textContent = rows.length + (rows.length === 1 ? ' matching call' : ' matching calls');
        if (!rows.length) {
            body.innerHTML = '<tr><td class="qa-empty" colspan="11">No call reviews match these filters yet.</td></tr>';
            return;
        }
        body.innerHTML = rows.map(rowMarkup).join('');
        body.querySelectorAll('[data-qa-edit]').forEach(function (button) {
            button.addEventListener('click', function () { window.qaEditReview(button.getAttribute('data-qa-edit')); });
        });
        body.querySelectorAll('[data-qa-delete]').forEach(function (button) {
            button.addEventListener('click', function () { window.qaDeleteReview(button.getAttribute('data-qa-delete')); });
        });
        body.querySelectorAll('[data-qa-print]').forEach(function (button) {
            button.addEventListener('click', function () { window.qaPrintReview(button.getAttribute('data-qa-print')); });
        });
    };

    function receiveRecords(snapshot) {
        const data = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
        qaRecords = data && typeof data === 'object' ? Object.keys(data).map(function (id) {
            return Object.assign({ id: id }, data[id] || {});
        }) : [];
        window.qaRenderReport();
        setStatus('qa-report-status', qaRecords.length ? 'Live QA records loaded.' : 'No QA records yet.', '');
    }

    window.qaResetForm = function () {
        ['qa-edit-id', 'qa-call-number', 'qa-customer-number', 'qa-loan-specialist', 'qa-additional-reason', 'qa-notes', 'qa-finding', 'qa-strengths', 'qa-coaching', 'qa-action-plan', 'qa-follow-up-date'].forEach(function (id) {
            if ($(id)) $(id).value = '';
        });
        SCORECARD_ITEMS.forEach(function (item) { if ($('qa-score-' + item.key)) $('qa-score-' + item.key).value = ''; });
        if ($('qa-follow-up-needed')) $('qa-follow-up-needed').checked = false;
        if ($('qa-agent')) $('qa-agent').value = '';
        if ($('qa-team')) $('qa-team').value = '';
        if ($('qa-date')) $('qa-date').value = localToday();
        if ($('qa-call-type')) $('qa-call-type').value = '';
        if ($('qa-outcome')) $('qa-outcome').value = 'Pending';
        if ($('qa-primary-reason')) $('qa-primary-reason').value = '';
        if ($('qa-issue-source')) $('qa-issue-source').value = '';
        setStatus('qa-save-status', '', '');
        setBusy(false);
    };

    window.qaSwitchView = function (view) {
        const selected = view === 'report' ? 'report' : 'review';
        document.querySelectorAll('.qa-inner-tab').forEach(function (button) {
            button.classList.toggle('is-active', button.getAttribute('data-qa-view') === selected);
        });
        document.querySelectorAll('.qa-view').forEach(function (panel) {
            panel.hidden = panel.id !== 'qa-view-' + selected;
        });
        if (selected === 'report') window.qaRenderReport();
    };

    window.qaSaveReview = async function () {
        if (qaSaving) return;
        if (!hasQAAccess()) {
            setStatus('qa-save-status', 'You do not have permission to save QA reviews.', 'error');
            return;
        }
        if (!window.rtdbRef || !window.rtdbSet || !window.rtdbGet) {
            setStatus('qa-save-status', 'Firebase is still connecting. Please try again in a moment.', 'error');
            return;
        }
        const admin = currentAdmin();
        const agentSelect = $('qa-agent');
        const agentOption = agentSelect && agentSelect.options[agentSelect.selectedIndex];
        const agentId = agentSelect ? agentSelect.value : '';
        const agentName = agentOption ? agentOption.getAttribute('data-name') || agentOption.textContent.split(' · ')[0] : '';
        const outcome = $('qa-outcome') ? $('qa-outcome').value : 'Pending';
        const primaryReason = $('qa-primary-reason') ? $('qa-primary-reason').value : '';
        const scorecard = {};
        SCORECARD_ITEMS.forEach(function (item) {
            scorecard[item.key] = String($('qa-score-' + item.key) ? $('qa-score-' + item.key).value : '');
        });
        if (!agentId || !($('qa-date') && $('qa-date').value)) {
            setStatus('qa-save-status', 'Select an agent and call date before saving.', 'error');
            return;
        }
        if (outcome === 'Invalid' && !primaryReason) {
            setStatus('qa-save-status', 'Choose a primary reason for an invalid call.', 'error');
            return;
        }
        if (outcome === 'Invalid' && !$('qa-issue-source').value) {
            setStatus('qa-save-status', 'Select who or what caused the invalid call.', 'error');
            return;
        }
        if (outcome === 'Invalid' && !String($('qa-finding') ? $('qa-finding').value : '').trim()) {
            setStatus('qa-save-status', 'Write the finding and supporting call evidence for an invalid call.', 'error');
            return;
        }
        const coachingRequired = Boolean(($('qa-follow-up-needed') && $('qa-follow-up-needed').checked) || SCORECARD_ITEMS.some(function (item) { return scorecard[item.key] === 'Needs coaching'; }));
        if (coachingRequired && !String($('qa-coaching') ? $('qa-coaching').value : '').trim()) {
            setStatus('qa-save-status', 'Add a practical coaching tip for this follow-up.', 'error');
            return;
        }
        if (coachingRequired && !String($('qa-action-plan') ? $('qa-action-plan').value : '').trim()) {
            setStatus('qa-save-status', 'Record the coaching action plan for this follow-up.', 'error');
            return;
        }

        const recordId = $('qa-edit-id') && $('qa-edit-id').value ? $('qa-edit-id').value : ('qa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
        const now = new Date().toISOString();
        const record = {
            date: $('qa-date').value,
            agentId: agentId,
            agentName: agentName,
            team: cleanTeam($('qa-team') ? $('qa-team').value : ''),
            callType: String($('qa-call-type') ? $('qa-call-type').value : ''),
            callNumber: String($('qa-call-number') ? $('qa-call-number').value : '').trim(),
            customerNumber: String($('qa-customer-number') ? $('qa-customer-number').value : '').trim(),
            loanSpecialist: String($('qa-loan-specialist') ? $('qa-loan-specialist').value : '').trim(),
            outcome: outcome,
            primaryReason: outcome === 'Invalid' ? primaryReason : '',
            additionalReason: outcome === 'Invalid' ? String($('qa-additional-reason') ? $('qa-additional-reason').value : '').trim() : '',
            issueSource: String($('qa-issue-source') ? $('qa-issue-source').value : ''),
            scorecard: scorecard,
            qaNotes: String($('qa-notes') ? $('qa-notes').value : '').trim(),
            reviewFinding: String($('qa-finding') ? $('qa-finding').value : '').trim(),
            strengths: String($('qa-strengths') ? $('qa-strengths').value : '').trim(),
            coachingTip: String($('qa-coaching') ? $('qa-coaching').value : '').trim(),
            actionPlan: String($('qa-action-plan') ? $('qa-action-plan').value : '').trim(),
            needsFollowUp: Boolean(($('qa-follow-up-needed') && $('qa-follow-up-needed').checked) || SCORECARD_ITEMS.some(function (item) { return scorecard[item.key] === 'Needs coaching'; })),
            followUpDate: String($('qa-follow-up-date') ? $('qa-follow-up-date').value : ''),
            reviewerName: String(admin.name || admin.email || 'Admin'),
            reviewerEmail: String(admin.email || ''),
            updatedAt: now
        };
        const existing = qaRecords.find(function (r) { return r.id === recordId; });
        record.createdAt = existing ? (existing.createdAt || now) : now;

        qaSaving = true;
        setBusy(true);
        setStatus('qa-save-status', 'Saving review…', '');
        try {
            await window.rtdbSet(window.rtdbRef(QA_PATH + '/' + recordId), record);
            setStatus('qa-save-status', 'Review saved to the shared QA report.', 'success');
            if (typeof window.writeAdminActivityLog === 'function') {
                window.writeAdminActivityLog('qa_review_saved', 'Saved ' + outcome.toLowerCase() + ' QA review for ' + agentName, { agentId: agentId, callNumber: record.callNumber, outcome: outcome });
            }
            window.qaResetForm();
        } catch (error) {
            setStatus('qa-save-status', 'Could not save this review: ' + (error && error.message ? error.message : 'Firebase write failed.'), 'error');
        } finally {
            qaSaving = false;
            setBusy(false);
        }
    };

    window.qaEditReview = function (id) {
        if (!hasQAAccess()) return;
        const record = qaRecords.find(function (r) { return String(r.id) === String(id); });
        if (!record) return;
        populateAgents(record.agentId);
        if ($('qa-edit-id')) $('qa-edit-id').value = record.id;
        if ($('qa-date')) $('qa-date').value = asDate(record);
        if ($('qa-team')) $('qa-team').value = cleanTeam(record.team);
        if ($('qa-call-type')) $('qa-call-type').value = record.callType || '';
        if ($('qa-call-number')) $('qa-call-number').value = record.callNumber || record.callId || '';
        if ($('qa-customer-number')) $('qa-customer-number').value = record.customerNumber || record.phoneLast4 || '';
        if ($('qa-loan-specialist')) $('qa-loan-specialist').value = record.loanSpecialist || '';
        if ($('qa-outcome')) $('qa-outcome').value = record.outcome || 'Pending';
        if ($('qa-primary-reason')) $('qa-primary-reason').value = record.primaryReason || '';
        if ($('qa-additional-reason')) $('qa-additional-reason').value = record.additionalReason || '';
        if ($('qa-issue-source')) $('qa-issue-source').value = record.issueSource || '';
        if ($('qa-notes')) $('qa-notes').value = record.qaNotes || '';
        if ($('qa-finding')) $('qa-finding').value = record.reviewFinding || '';
        if ($('qa-strengths')) $('qa-strengths').value = record.strengths || '';
        if ($('qa-coaching')) $('qa-coaching').value = record.coachingTip || '';
        if ($('qa-action-plan')) $('qa-action-plan').value = record.actionPlan || '';
        if ($('qa-follow-up-date')) $('qa-follow-up-date').value = record.followUpDate || '';
        if ($('qa-follow-up-needed')) $('qa-follow-up-needed').checked = Boolean(record.needsFollowUp);
        SCORECARD_ITEMS.forEach(function (item) {
            if ($('qa-score-' + item.key)) $('qa-score-' + item.key).value = record.scorecard && record.scorecard[item.key] || '';
        });
        window.qaSwitchView('review');
        setBusy(false);
        setStatus('qa-save-status', 'Editing review from ' + asDate(record) + '.', '');
        const section = $('ah-sect-qa');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.qaDeleteReview = async function (id) {
        if (!hasQAAccess()) return;
        const record = qaRecords.find(function (r) { return String(r.id) === String(id); });
        if (!record || !window.confirm('Delete this QA review for ' + (record.agentName || 'this agent') + '?')) return;
        try {
            await window.rtdbRemove(window.rtdbRef(QA_PATH + '/' + record.id));
            setStatus('qa-report-status', 'Review deleted.', 'success');
        } catch (error) {
            setStatus('qa-report-status', 'Could not delete this review: ' + (error && error.message ? error.message : 'Firebase write failed.'), 'error');
        }
    };

    window.qaExportCSV = function () {
        if (!hasQAAccess()) return;
        const rows = selectedReportRecords();
        if (!rows.length) {
            setStatus('qa-report-status', 'There are no calls in the current report filters to export.', 'error');
            return;
        }
        const headers = ['Date', 'Call type', 'Agent name', 'Agent ID', 'Team', 'Call Number', 'Customer Number', 'Loan specialist', 'Outcome', 'Primary reason', 'Additional reason', 'Issue source', 'QA score', 'Agent scorecard', 'Loan specialist scorecard', 'Review finding / evidence', 'Strengths', 'Coaching tip', 'Coaching action plan', 'Follow-up needed', 'Follow-up date', 'QA notes', 'Reviewer'];
        const csvCell = function (value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; };
        const csv = [headers.map(csvCell).join(',')].concat(rows.map(function (r) {
            const score = scorecardScore(r);
            const scorecardText = function (section) {
                return SCORECARD_ITEMS.filter(function (item) { return item.section === section; }).map(function (item) {
                    return item.label + ': ' + String(r.scorecard && r.scorecard[item.key] || 'Not rated');
                }).join(' | ');
            };
            const values = [
                asDate(r), r.callType, r.agentName, r.agentId, cleanTeam(r.team) || r.team,
                r.callNumber || r.callId, r.customerNumber || r.phoneLast4, r.loanSpecialist,
                r.outcome, r.primaryReason, r.additionalReason, r.issueSource,
                score === null ? '' : score + '%', scorecardText('Agent'), scorecardText('Loan specialist'),
                r.reviewFinding, r.strengths, r.coachingTip, r.actionPlan,
                hasCoachingFlag(r) ? 'Yes' : 'No', r.followUpDate, r.qaNotes, r.reviewerName
            ];
            return values.map(csvCell).join(',');
        })).join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Call-QA-Report-' + localToday() + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus('qa-report-status', rows.length + ' call review(s) exported.', 'success');
    };

    window.qaPrintReport = function () {
        if (!hasQAAccess()) return;
        window.qaSwitchView('report');
        if (!selectedReportRecords().length) {
            setStatus('qa-report-status', 'There are no calls in the current report filters to print.', 'error');
            return;
        }
        window.print();
    };

    window.qaPrintReview = function (id) {
        if (!hasQAAccess()) return;
        const record = qaRecords.find(function (item) { return String(item.id) === String(id); });
        if (!record) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            setStatus('qa-report-status', 'Allow the report window to open, then try Print again.', 'error');
            return;
        }
        const detail = function (label, value) {
            return '<div class="detail"><span>' + esc(label) + '</span><strong>' + esc(value || 'Not recorded') + '</strong></div>';
        };
        const scoreRows = SCORECARD_ITEMS.map(function (item) {
            const rating = record.scorecard && record.scorecard[item.key] || 'Not rated';
            return '<tr><td>' + esc(item.section) + '</td><td>' + esc(item.label) + '</td><td>' + esc(rating) + '</td></tr>';
        }).join('');
        const score = scorecardScore(record);
        const followUp = hasCoachingFlag(record) ? 'Required' : 'Not marked';
        const textBlock = function (label, value) {
            return '<section class="note"><h2>' + esc(label) + '</h2><p>' + (value ? esc(value).replace(/\n/g, '<br>') : 'Not recorded') + '</p></section>';
        };
        const html = '<!doctype html><html><head><meta charset="utf-8"><title>Call Quality Review</title><style>' +
            'body{font:14px Arial,sans-serif;color:#172033;margin:34px}header{border-bottom:4px solid #0e7490;padding-bottom:18px;margin-bottom:22px}header p{color:#64748b;margin:6px 0}h1{font-size:26px;margin:0;color:#0f2740}h2{font-size:15px;margin:0 0 10px;color:#0f4c68}.eyebrow{font-size:10px;font-weight:bold;letter-spacing:2px;color:#0e7490;margin-bottom:7px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.detail{border:1px solid #d9e2ec;border-radius:7px;padding:10px}.detail span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;margin-bottom:5px}.detail strong{font-size:12px}.badge{display:inline-block;padding:5px 9px;border-radius:20px;background:#e8f5f8;color:#075985;font-weight:bold}.note{border:1px solid #d9e2ec;border-radius:8px;padding:14px;margin:13px 0;break-inside:avoid}.note p{margin:0;line-height:1.55;white-space:normal}.score{font-size:22px;color:#0e7490;font-weight:bold}.score-table{width:100%;border-collapse:collapse;font-size:11px}.score-table td,.score-table th{border-bottom:1px solid #d9e2ec;text-align:left;padding:8px}.score-table th{background:#eff6fa}.signature{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:32px}.signature div{border-top:1px solid #94a3b8;padding-top:7px;color:#64748b;font-size:11px}@media print{body{margin:14mm}header{break-after:avoid}.note{break-inside:avoid}}' +
            '</style></head><body><header><div class="eyebrow">QUALITY ASSURANCE</div><h1>Call Quality Review</h1><p>Prepared ' + esc(new Date().toLocaleString()) + '</p></header>' +
            '<div class="grid">' + detail('Call date', asDate(record)) + detail('Call number', record.callNumber || record.callId) + detail('Customer number', record.customerNumber || record.phoneLast4) +
            detail('Call type', record.callType) + detail('Agent', (record.agentName || 'Unknown') + (record.agentId ? ' (' + record.agentId + ')' : '')) + detail('Team', cleanTeam(record.team) || record.team) +
            detail('Loan specialist', record.loanSpecialist) + detail('Primary reason', record.primaryReason) + detail('Issue source', record.issueSource) + '</div>' +
            '<p>Final outcome: ' + outcomeMarkup(record.outcome) + ' &nbsp; <span class="score">' + (score === null ? 'Score not rated' : score + '% QA score') + '</span></p>' +
            '<section class="note"><h2>Call quality scorecard</h2><table class="score-table"><thead><tr><th>Review area</th><th>Standard</th><th>Rating</th></tr></thead><tbody>' + scoreRows + '</tbody></table></section>' +
            textBlock('Review finding and evidence', record.reviewFinding) + textBlock('What went well', record.strengths) + textBlock('Coaching tip', record.coachingTip) +
            textBlock('Coaching action plan', record.actionPlan) + textBlock('QA notes', record.qaNotes) +
            '<div class="grid">' + detail('Coaching follow-up', followUp) + detail('Follow-up date', record.followUpDate) + detail('Reviewed by', record.reviewerName) + '</div>' +
            '<div class="signature"><div>Reviewer signature</div><div>Agent acknowledgement</div></div></body></html>';
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(function () { printWindow.focus(); printWindow.print(); }, 250);
    };

    window.qaInit = async function () {
        if (!hasQAAccess()) {
            setStatus('qa-report-status', 'QA access is restricted to authorized admins.', 'error');
            return;
        }
        const initialAgentCount = populateAgents();
        setStatus('qa-agent-status', initialAgentCount ? initialAgentCount + ' active agents loaded.' : 'Loading active agent list…', initialAgentCount ? '' : '');
        if (!qaAgentBound && $('qa-agent')) {
            qaAgentBound = true;
            $('qa-agent').addEventListener('change', function () {
                const option = $('qa-agent').options[$('qa-agent').selectedIndex];
                const team = option ? option.getAttribute('data-team') : '';
                if (team && $('qa-team')) $('qa-team').value = team;
            });
        }
        if ($('qa-date') && !$('qa-date').value) $('qa-date').value = localToday();
        if ($('qa-save-button')) $('qa-save-button').textContent = $('qa-edit-id') && $('qa-edit-id').value ? 'Update Call Report' : 'Save Call Report';
        window.qaRenderReport();

        let attempts = 0;
        while ((!window.rtdbRef || !window.rtdbOnValue) && attempts < 25) {
            attempts += 1;
            await new Promise(function (resolve) { setTimeout(resolve, 200); });
        }
        if (!window.rtdbRef || !window.rtdbOnValue) {
            setStatus('qa-report-status', 'Firebase is still connecting. Reopen QA in a moment.', 'error');
            return;
        }
        bindAgentRoster();
        if (qaListener) return;
        try {
            qaListener = window.rtdbOnValue(window.rtdbRef(QA_PATH), receiveRecords, function (error) {
                qaListener = null;
                setStatus('qa-report-status', 'Could not load shared QA records: ' + (error && error.message ? error.message : 'permission denied.'), 'error');
            });
        } catch (error) {
            setStatus('qa-report-status', 'Could not connect to the QA report: ' + (error && error.message ? error.message : 'Firebase error.'), 'error');
        }
    };
})();
