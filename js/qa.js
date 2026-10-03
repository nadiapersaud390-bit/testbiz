(function () {
    'use strict';

    const QA_PATH = 'qa_call_reviews';
    const $ = function (id) { return document.getElementById(id); };
    let qaRecords = [];
    let qaListener = null;
    let qaAIResult = null;
    let qaSaving = false;
    let qaAgentBound = false;
    let qaRosterBound = false;
    let qaRosterListener = null;
    let qaServiceMessage = 'Checking AI review service…';

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

    async function checkQAService() {
        const endpoint = String(window.QA_REVIEW_ENDPOINT || '').trim();
        if (!endpoint) {
            qaServiceMessage = 'AI review service is not configured. Manual review is available.';
            setStatus('qa-ai-status', qaServiceMessage, 'error');
            return;
        }
        try {
            const statusUrl = endpoint.replace(/\/$/, '') + '/status';
            const response = await fetch(statusUrl, { cache: 'no-store', credentials: 'same-origin' });
            const bodyText = await response.text();
            let result = {};
            try { result = JSON.parse(bodyText); } catch (_) {}
            if (!response.ok) {
                qaServiceMessage = response.status === 404
                    ? 'The AI review route is not available on this host. Deploy the app with its Node server.'
                    : 'Could not check AI service status (HTTP ' + response.status + ').';
                setStatus('qa-ai-status', qaServiceMessage, 'error');
                return;
            }
            if (result.ready) {
                qaServiceMessage = 'AI draft service connected. Paste a transcript and enter the service access code.';
                setStatus('qa-ai-status', qaServiceMessage, 'success');
            } else {
                qaServiceMessage = 'The AI route is reachable, but server credentials are not configured yet. Manual review is available.';
                setStatus('qa-ai-status', qaServiceMessage, 'error');
            }
        } catch (_) {
            qaServiceMessage = 'Could not reach the AI review route. Check that the Node server is deployed.';
            setStatus('qa-ai-status', qaServiceMessage, 'error');
        }
    }

    function setBusy(busy) {
        const button = $('qa-save-button');
        if (!button) return;
        button.disabled = !!busy;
        button.textContent = busy ? 'Saving…' : ($('qa-edit-id') && $('qa-edit-id').value ? 'Update Review' : 'Save Review');
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

    function selectedInvalidRecords() {
        const from = $('qa-filter-from') ? $('qa-filter-from').value : '';
        const to = $('qa-filter-to') ? $('qa-filter-to').value : '';
        const team = $('qa-filter-team') ? $('qa-filter-team').value : '';
        const reason = $('qa-filter-reason') ? $('qa-filter-reason').value : '';
        const agent = $('qa-filter-agent') ? $('qa-filter-agent').value.trim().toLowerCase() : '';
        return sortRecords(qaRecords).filter(function (r) {
            if (String(r.outcome || '').toLowerCase() !== 'invalid') return false;
            const date = asDate(r);
            if (from && date < from) return false;
            if (to && date > to) return false;
            if (team && cleanTeam(r.team) !== team) return false;
            if (reason && String(r.primaryReason || '') !== reason) return false;
            if (agent && String(r.agentName || '').toLowerCase().indexOf(agent) < 0 && String(r.agentId || '').toLowerCase().indexOf(agent) < 0) return false;
            return true;
        });
    }

    function updateStats() {
        const invalid = qaRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'invalid'; });
        const pending = qaRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'pending'; });
        const reasons = {};
        invalid.forEach(function (r) {
            const reason = String(r.primaryReason || 'Other');
            reasons[reason] = (reasons[reason] || 0) + 1;
        });
        const top = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a] || a.localeCompare(b); })[0] || '—';
        if ($('qa-stat-total')) $('qa-stat-total').textContent = String(qaRecords.length);
        if ($('qa-stat-invalid')) $('qa-stat-invalid').textContent = String(invalid.length);
        if ($('qa-stat-pending')) $('qa-stat-pending').textContent = String(pending.length);
        if ($('qa-stat-top-reason')) $('qa-stat-top-reason').textContent = top;
    }

    function rowMarkup(r) {
        const finding = [r.reviewFinding, r.coachingTip].filter(Boolean).join(' · ');
        return '<tr>' +
            '<td>' + esc(asDate(r)) + '</td>' +
            '<td><strong>' + esc(r.agentName || 'Unknown') + '</strong><br><span class="qa-muted">' + esc(r.agentId || '') + '</span></td>' +
            '<td>' + esc(cleanTeam(r.team) || r.team || '—') + '</td>' +
            '<td>' + esc(r.callNumber || r.callId || '—') + '</td>' +
            '<td>' + esc(r.customerNumber || (r.phoneLast4 ? '…' + r.phoneLast4 : '—')) + '</td>' +
            '<td><span class="qa-outcome-pill">Invalid</span></td>' +
            '<td>' + esc(r.primaryReason || '—') + (r.additionalReason ? '<br><span class="qa-muted">' + esc(r.additionalReason) + '</span>' : '') + '</td>' +
            '<td>' + esc(r.issueSource || '—') + '</td>' +
            '<td>' + esc(finding || r.qaNotes || '—') + '</td>' +
            '<td><div class="qa-row-actions"><button type="button" data-qa-edit="' + esc(r.id) + '">Edit</button><button type="button" data-qa-delete="' + esc(r.id) + '">Delete</button></div></td>' +
            '</tr>';
    }

    window.qaRenderReport = function () {
        updateStats();
        const body = $('qa-report-body');
        if (!body) return;
        const rows = selectedInvalidRecords();
        if (!rows.length) {
            body.innerHTML = '<tr><td class="qa-empty" colspan="10">No invalid calls match these filters yet.</td></tr>';
            return;
        }
        body.innerHTML = rows.map(rowMarkup).join('');
        body.querySelectorAll('[data-qa-edit]').forEach(function (button) {
            button.addEventListener('click', function () { window.qaEditReview(button.getAttribute('data-qa-edit')); });
        });
        body.querySelectorAll('[data-qa-delete]').forEach(function (button) {
            button.addEventListener('click', function () { window.qaDeleteReview(button.getAttribute('data-qa-delete')); });
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

    window.qaRunAIReview = async function () {
        const transcript = String($('qa-transcript-input') ? $('qa-transcript-input').value : '').trim();
        if (transcript.length < 20) {
            setStatus('qa-ai-status', 'Paste a call transcript of at least 20 characters before requesting a draft.', 'error');
            return;
        }
        const endpoint = String(window.QA_REVIEW_ENDPOINT || '').trim();
        if (!endpoint) {
            setStatus('qa-ai-status', 'AI review service is not configured. Manual review is ready to use.', 'error');
            return;
        }
        const accessCode = String($('qa-service-code') ? $('qa-service-code').value : '').trim();
        if (!accessCode) {
            setStatus('qa-ai-status', 'Enter the AI service access code provided by your system administrator.', 'error');
            return;
        }
        const button = $('qa-ai-button');
        if (button) button.disabled = true;
        setStatus('qa-ai-status', 'Sending the transcript for an AI draft review…', '');
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + accessCode, 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript: transcript }),
                credentials: 'same-origin'
            });
            const bodyText = await response.text();
            let result = {};
            try { result = JSON.parse(bodyText); } catch (_) {}
            if (!response.ok && !result.error) {
                throw new Error(response.status === 404
                    ? 'The AI review route is missing on this host. Deploy the app with its Node server.'
                    : 'The review service returned HTTP ' + response.status + '. Check the Node server and try again.');
            }
            if (!response.ok) throw new Error(result.error || 'The review service could not analyze this transcript.');
            const draft = result.draft || result.review || result;
            const evidence = Array.isArray(draft.evidence) ? draft.evidence.map(function (item) {
                return '[' + String(item.timestamp || item.location || 'reference not supplied') + ']' + (item.speaker ? ' ' + String(item.speaker) + ':' : '') + ' ' + String(item.quote || item.text || '') + (item.rule ? ' · ' + String(item.rule) : '');
            }).filter(Boolean).join('\n') : '';
            const finding = [draft.summary || draft.finding || '', evidence, draft.limitations ? 'Review limitations: ' + draft.limitations : ''].filter(Boolean).join('\n');
            if ($('qa-finding') && finding) $('qa-finding').value = finding;
            if ($('qa-coaching') && (draft.coachingTip || draft.coaching)) $('qa-coaching').value = draft.coachingTip || draft.coaching;
            if ($('qa-notes') && draft.notes) $('qa-notes').value = draft.notes;
            qaAIResult = {
                suggestedOutcome: draft.suggestedOutcome || draft.outcome || '',
                suggestedReason: draft.primaryReason || draft.reason || '',
                confidence: typeof draft.confidence === 'number' ? draft.confidence : null
            };
            const reason = qaAIResult.suggestedReason && qaAIResult.suggestedReason !== 'None' ? ' — ' + qaAIResult.suggestedReason : '';
            const confidence = typeof qaAIResult.confidence === 'number' ? ' · confidence ' + Math.round(qaAIResult.confidence * 100) + '%' : '';
            const speaker = draft.agentSpeaker && draft.agentSpeaker !== 'unclear' ? ' Agent speaker: ' + draft.agentSpeaker + '.' : ' Transcript speaker unclear.';
            setStatus('qa-ai-status', 'AI draft ready.' + speaker + ' Suggestion only: ' + (qaAIResult.suggestedOutcome || 'Pending') + reason + confidence + '. Check the transcript and evidence, then choose the final outcome yourself.', 'success');
        } catch (error) {
            setStatus('qa-ai-status', error.message || 'AI review failed. You can still complete a manual review.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    };

    window.qaResetForm = function () {
        ['qa-edit-id', 'qa-call-number', 'qa-customer-number', 'qa-additional-reason', 'qa-notes', 'qa-finding', 'qa-coaching', 'qa-transcript-input'].forEach(function (id) {
            if ($(id)) $(id).value = '';
        });
        if ($('qa-agent')) $('qa-agent').value = '';
        if ($('qa-team')) $('qa-team').value = '';
        if ($('qa-date')) $('qa-date').value = localToday();
        if ($('qa-outcome')) $('qa-outcome').value = 'Pending';
        if ($('qa-primary-reason')) $('qa-primary-reason').value = '';
        if ($('qa-issue-source')) $('qa-issue-source').value = '';
        qaAIResult = null;
        setStatus('qa-ai-status', qaServiceMessage, '');
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
        if (!agentId || !($('qa-date') && $('qa-date').value)) {
            setStatus('qa-save-status', 'Select an agent and call date before saving.', 'error');
            return;
        }
        if (outcome === 'Invalid' && !primaryReason) {
            setStatus('qa-save-status', 'Choose a primary reason for an invalid call.', 'error');
            return;
        }

        const recordId = $('qa-edit-id') && $('qa-edit-id').value ? $('qa-edit-id').value : ('qa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
        const now = new Date().toISOString();
        const record = {
            date: $('qa-date').value,
            agentId: agentId,
            agentName: agentName,
            team: cleanTeam($('qa-team') ? $('qa-team').value : ''),
            callNumber: String($('qa-call-number') ? $('qa-call-number').value : '').trim(),
            customerNumber: String($('qa-customer-number') ? $('qa-customer-number').value : '').trim(),
            outcome: outcome,
            primaryReason: primaryReason,
            additionalReason: String($('qa-additional-reason') ? $('qa-additional-reason').value : '').trim(),
            issueSource: String($('qa-issue-source') ? $('qa-issue-source').value : ''),
            qaNotes: String($('qa-notes') ? $('qa-notes').value : '').trim(),
            reviewFinding: String($('qa-finding') ? $('qa-finding').value : '').trim(),
            coachingTip: String($('qa-coaching') ? $('qa-coaching').value : '').trim(),
            reviewerName: String(admin.name || admin.email || 'Admin'),
            reviewerEmail: String(admin.email || ''),
            reviewMethod: qaAIResult ? 'ai_assisted' : 'manual',
            aiSuggestedOutcome: qaAIResult ? String(qaAIResult.suggestedOutcome || '') : '',
            aiSuggestedReason: qaAIResult ? String(qaAIResult.suggestedReason || '') : '',
            aiConfidence: qaAIResult ? qaAIResult.confidence : null,
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
        if ($('qa-call-number')) $('qa-call-number').value = record.callNumber || record.callId || '';
        if ($('qa-customer-number')) $('qa-customer-number').value = record.customerNumber || record.phoneLast4 || '';
        if ($('qa-outcome')) $('qa-outcome').value = record.outcome || 'Pending';
        if ($('qa-primary-reason')) $('qa-primary-reason').value = record.primaryReason || '';
        if ($('qa-additional-reason')) $('qa-additional-reason').value = record.additionalReason || '';
        if ($('qa-issue-source')) $('qa-issue-source').value = record.issueSource || '';
        if ($('qa-notes')) $('qa-notes').value = record.qaNotes || '';
        if ($('qa-finding')) $('qa-finding').value = record.reviewFinding || '';
        if ($('qa-coaching')) $('qa-coaching').value = record.coachingTip || '';
        if ($('qa-transcript-input')) $('qa-transcript-input').value = '';
        if ($('qa-ai-status')) setStatus('qa-ai-status', qaServiceMessage, '');
        qaAIResult = record.reviewMethod === 'ai_assisted' ? {
            suggestedOutcome: record.aiSuggestedOutcome || '',
            suggestedReason: record.aiSuggestedReason || '',
            confidence: typeof record.aiConfidence === 'number' ? record.aiConfidence : null
        } : null;
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
        const rows = selectedInvalidRecords();
        if (!rows.length) {
            setStatus('qa-report-status', 'There are no invalid calls in the current filter to export.', 'error');
            return;
        }
        const headers = ['Date', 'Agent name', 'Agent ID', 'Team', 'Call Number', 'Customer Number', 'QA notes', 'Review outcome', 'Primary reason', 'Additional reason', 'Issue source', 'Review finding', 'Coaching tip', 'Reviewer', 'AI suggested outcome'];
        const fields = ['date', 'agentName', 'agentId', 'team', 'callNumber', 'customerNumber', 'qaNotes', 'outcome', 'primaryReason', 'additionalReason', 'issueSource', 'reviewFinding', 'coachingTip', 'reviewerName', 'aiSuggestedOutcome'];
        const csvCell = function (value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; };
        const csv = [headers.map(csvCell).join(',')].concat(rows.map(function (r) {
            return fields.map(function (key) {
                if (key === 'callNumber') return csvCell(r.callNumber || r.callId || '');
                if (key === 'customerNumber') return csvCell(r.customerNumber || r.phoneLast4 || '');
                return csvCell(r[key]);
            }).join(',');
        })).join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'QA-Invalid-Calls-' + localToday() + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus('qa-report-status', rows.length + ' invalid call(s) exported.', 'success');
    };

    window.qaInit = async function () {
        if (!hasQAAccess()) {
            setStatus('qa-report-status', 'QA access is restricted to authorized admins.', 'error');
            return;
        }
        const initialAgentCount = populateAgents();
        setStatus('qa-agent-status', initialAgentCount ? initialAgentCount + ' active agents loaded.' : 'Loading active agent list…', initialAgentCount ? '' : '');
        checkQAService();
        if (!qaAgentBound && $('qa-agent')) {
            qaAgentBound = true;
            $('qa-agent').addEventListener('change', function () {
                const option = $('qa-agent').options[$('qa-agent').selectedIndex];
                const team = option ? option.getAttribute('data-team') : '';
                if (team && $('qa-team')) $('qa-team').value = team;
            });
        }
        if ($('qa-date') && !$('qa-date').value) $('qa-date').value = localToday();
        if ($('qa-save-button')) $('qa-save-button').textContent = $('qa-edit-id') && $('qa-edit-id').value ? 'Update Review' : 'Save Review';
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
