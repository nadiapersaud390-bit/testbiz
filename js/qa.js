(function () {
    'use strict';

    const QA_PATH = 'qa_call_reviews';
    const $ = function (id) { return document.getElementById(id); };
    let qaRecords = [];
    let qaListener = null;
    let qaAudioUrl = '';
    let qaAIResult = null;
    let qaSaving = false;
    let qaAudioBound = false;
    let qaAgentBound = false;

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

    function roster() {
        let list = Array.isArray(window.allAgentProfiles) ? window.allAgentProfiles.slice() : [];
        if (!list.length) {
            try {
                const cached = JSON.parse(localStorage.getItem('biz_master_roster') || '[]');
                if (Array.isArray(cached)) list = cached;
            } catch (_) {}
        }
        if (typeof window.filterDeletedAgents === 'function') list = window.filterDeletedAgents(list);
        return list.filter(Boolean).sort(function (a, b) {
            const an = String(a.fullName || a.name || a.agentName || '').toLowerCase();
            const bn = String(b.fullName || b.name || b.agentName || '').toLowerCase();
            return an.localeCompare(bn);
        });
    }

    function populateAgents(selectedId) {
        const select = $('qa-agent');
        if (!select) return;
        const oldValue = selectedId || select.value;
        select.innerHTML = '<option value="">Select an agent</option>' + roster().map(function (agent) {
            const id = String(agent.userId || agent.ytelId || agent.id || agent.agentId || '').trim();
            const name = String(agent.fullName || agent.name || agent.agentName || agent.ytelName || id || 'Agent').trim();
            const team = cleanTeam(agent.team || agent.group || agent.location);
            if (!id) return '';
            return '<option value="' + esc(id) + '" data-name="' + esc(name) + '" data-team="' + esc(team) + '">' + esc(name) + ' · ' + esc(id) + '</option>';
        }).join('');
        if (oldValue) select.value = oldValue;
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
            '<td>' + esc(r.callId || '—') + '</td>' +
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
            body.innerHTML = '<tr><td class="qa-empty" colspan="9">No invalid calls match these filters yet.</td></tr>';
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

    function ensureAudioPreview() {
        const input = $('qa-audio-file');
        if (!input || qaAudioBound) return;
        qaAudioBound = true;
        input.addEventListener('change', function () {
            const file = input.files && input.files[0];
            const preview = $('qa-audio-preview');
            if (qaAudioUrl) URL.revokeObjectURL(qaAudioUrl);
            qaAudioUrl = '';
            qaAIResult = null;
            if (!preview) return;
            preview.innerHTML = '';
            if (!file) return;
            if (file.size > 100 * 1024 * 1024) {
                input.value = '';
                setStatus('qa-ai-status', 'This recording is larger than the 100 MB limit.', 'error');
                return;
            }
            if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name)) {
                input.value = '';
                setStatus('qa-ai-status', 'Choose an audio recording such as MP3, WAV, M4A, AAC, OGG, or WEBM.', 'error');
                return;
            }
            qaAudioUrl = URL.createObjectURL(file);
            const label = document.createElement('div');
            label.className = 'qa-inline-status';
            label.textContent = file.name + ' · ' + Math.max(1, Math.round(file.size / 1024)) + ' KB · preview only';
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.preload = 'metadata';
            audio.src = qaAudioUrl;
            preview.appendChild(label);
            preview.appendChild(audio);
            setStatus('qa-ai-status', window.QA_REVIEW_ENDPOINT ? 'Ready to request an AI draft. The reviewer will confirm the result.' : 'AI review service is not connected yet. The recording stays in this browser and is not uploaded.', '');
        });
    }

    function setTranscript(text) {
        const wrap = $('qa-transcript-wrap');
        const input = $('qa-transcript');
        if (!wrap || !input) return;
        input.value = String(text || '');
        wrap.hidden = !input.value;
    }

    window.qaRunAIReview = async function () {
        const fileInput = $('qa-audio-file');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) {
            setStatus('qa-ai-status', 'Choose an audio file before requesting a draft.', 'error');
            return;
        }
        const endpoint = String(window.QA_REVIEW_ENDPOINT || '').trim();
        if (!endpoint) {
            setStatus('qa-ai-status', 'AI review service is not connected. The recording was not uploaded. Manual review is ready to use.', 'error');
            return;
        }
        const agent = $('qa-agent');
        const option = agent && agent.options[agent.selectedIndex];
        const payload = new FormData();
        payload.append('audio', file, file.name);
        payload.append('agentId', agent ? agent.value : '');
        payload.append('agentName', option ? option.getAttribute('data-name') || option.textContent : '');
        payload.append('team', $('qa-team') ? $('qa-team').value : '');
        payload.append('callDate', $('qa-date') ? $('qa-date').value : '');
        payload.append('callId', $('qa-call-id') ? $('qa-call-id').value : '');
        payload.append('reasonCategories', JSON.stringify(['Under $200k revenue', 'Trucking', 'Attorney', 'No qualified call', 'Unqualified business', 'Other', 'Unclear audio']));
        payload.append('responseFormat', 'json');

        const button = $('qa-ai-button');
        if (button) button.disabled = true;
        setStatus('qa-ai-status', 'Sending the recording to the configured review service…', '');
        try {
            const response = await fetch(endpoint, { method: 'POST', body: payload, credentials: 'same-origin' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'The review service could not analyze this recording.');
            const draft = result.draft || result.review || result;
            const transcript = result.transcript || draft.transcript || '';
            setTranscript(transcript);
            const evidence = Array.isArray(draft.evidence) ? draft.evidence.map(function (item) {
                return '[' + String(item.timestamp || item.time || 'time not supplied') + '] ' + String(item.quote || item.text || '') + (item.rule ? ' · ' + String(item.rule) : '');
            }).filter(Boolean).join('\n') : '';
            const finding = [draft.summary || draft.finding || '', evidence].filter(Boolean).join('\n');
            if ($('qa-finding') && finding) $('qa-finding').value = finding;
            if ($('qa-coaching') && (draft.coachingTip || draft.coaching)) $('qa-coaching').value = draft.coachingTip || draft.coaching;
            if ($('qa-notes') && draft.notes) $('qa-notes').value = draft.notes;
            qaAIResult = {
                suggestedOutcome: draft.suggestedOutcome || draft.outcome || '',
                suggestedReason: draft.primaryReason || draft.reason || '',
                confidence: typeof draft.confidence === 'number' ? draft.confidence : null
            };
            setStatus('qa-ai-status', 'AI draft ready. Suggested outcome: ' + (qaAIResult.suggestedOutcome || 'not provided') + '. Review the transcript and evidence, then confirm the final outcome yourself.', 'success');
        } catch (error) {
            setStatus('qa-ai-status', error.message || 'AI review failed. You can still complete a manual review.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    };

    function clearAudio() {
        const input = $('qa-audio-file');
        const preview = $('qa-audio-preview');
        if (qaAudioUrl) URL.revokeObjectURL(qaAudioUrl);
        qaAudioUrl = '';
        qaAIResult = null;
        if (input) input.value = '';
        if (preview) preview.innerHTML = '';
        setTranscript('');
        setStatus('qa-ai-status', window.QA_REVIEW_ENDPOINT ? 'Choose a recording to request an AI draft.' : 'AI review service is not connected yet. Manual reviews and reports are available.', '');
    }

    window.qaResetForm = function () {
        ['qa-edit-id', 'qa-call-id', 'qa-phone-last4', 'qa-additional-reason', 'qa-notes', 'qa-finding', 'qa-coaching'].forEach(function (id) {
            if ($(id)) $(id).value = '';
        });
        if ($('qa-agent')) $('qa-agent').value = '';
        if ($('qa-team')) $('qa-team').value = '';
        if ($('qa-date')) $('qa-date').value = localToday();
        if ($('qa-outcome')) $('qa-outcome').value = 'Pending';
        if ($('qa-primary-reason')) $('qa-primary-reason').value = '';
        if ($('qa-issue-source')) $('qa-issue-source').value = '';
        clearAudio();
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
            callId: String($('qa-call-id') ? $('qa-call-id').value : '').trim(),
            phoneLast4: String($('qa-phone-last4') ? $('qa-phone-last4').value : '').replace(/\D/g, '').slice(-4),
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
                window.writeAdminActivityLog('qa_review_saved', 'Saved ' + outcome.toLowerCase() + ' QA review for ' + agentName, { agentId: agentId, callId: record.callId, outcome: outcome });
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
        if ($('qa-call-id')) $('qa-call-id').value = record.callId || '';
        if ($('qa-phone-last4')) $('qa-phone-last4').value = record.phoneLast4 || '';
        if ($('qa-outcome')) $('qa-outcome').value = record.outcome || 'Pending';
        if ($('qa-primary-reason')) $('qa-primary-reason').value = record.primaryReason || '';
        if ($('qa-additional-reason')) $('qa-additional-reason').value = record.additionalReason || '';
        if ($('qa-issue-source')) $('qa-issue-source').value = record.issueSource || '';
        if ($('qa-notes')) $('qa-notes').value = record.qaNotes || '';
        if ($('qa-finding')) $('qa-finding').value = record.reviewFinding || '';
        if ($('qa-coaching')) $('qa-coaching').value = record.coachingTip || '';
        clearAudio();
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
        const headers = ['Date', 'Agent name', 'Agent ID', 'Team', 'Call ID', 'Phone last 4', 'QA notes', 'Review outcome', 'Primary reason', 'Additional reason', 'Issue source', 'Review finding', 'Coaching tip', 'Reviewer', 'AI suggested outcome'];
        const fields = ['date', 'agentName', 'agentId', 'team', 'callId', 'phoneLast4', 'qaNotes', 'outcome', 'primaryReason', 'additionalReason', 'issueSource', 'reviewFinding', 'coachingTip', 'reviewerName', 'aiSuggestedOutcome'];
        const csvCell = function (value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; };
        const csv = [headers.map(csvCell).join(',')].concat(rows.map(function (r) {
            return fields.map(function (key) { return csvCell(r[key]); }).join(',');
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
        populateAgents();
        ensureAudioPreview();
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
