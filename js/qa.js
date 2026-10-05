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
    const OPTIONAL_SECTIONS = [
        { key: 'callHandling', label: 'Call handling details' },
        { key: 'agentScorecard', label: 'Agent scorecard' },
        { key: 'specialistScorecard', label: 'Loan specialist scorecard' },
        { key: 'strengths', label: 'What went well' },
        { key: 'coachingPlan', label: 'Coaching plan and follow-up' },
        { key: 'reviewerNotes', label: 'Reviewer notes' }
    ];
    let qaRecords = [];
    let qaListener = null;
    let qaSaving = false;
    let qaAgentBound = false;
    let qaRosterBound = false;
    let qaRosterListener = null;
    let qaRosterResolved = false;
    let qaRosterTimeout = null;
    let qaImportText = '';
    let qaImportFileName = '';
    let qaImportRecords = [];
    let qaImportInvalidRows = 0;
    let qaImportDuplicates = 0;

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
        let list = Array.isArray(source)
            ? source.map(function (agent) { return [null, agent]; })
            : (source && typeof source === 'object' ? Object.entries(source) : []);
        list = list.map(function (entry) {
            const key = entry[0];
            const agent = entry[1];
            if (!agent || typeof agent !== 'object' || Array.isArray(agent)) return null;
            const id = [agent.userId, agent.userID, agent.ytelId, agent.ytel_id, agent.id, agent.agentId, agent.agentID, agent.agent_id, agent.userid, agent.uid, key]
                .find(function (value) { return value != null && String(value).trim() !== ''; });
            const name = [agent.fullName, agent.full_name, agent.name, agent.agentName, agent.agent_name, agent.ytelName, agent.ytel_name]
                .find(function (value) { return value != null && String(value).trim() !== ''; });
            return Object.assign({}, agent, id != null ? { userId: String(id).trim() } : {}, name != null ? { fullName: String(name).trim() } : {});
        }).filter(Boolean);
        if (typeof window.filterDeletedAgents === 'function') list = window.filterDeletedAgents(list);
        const seen = new Set();
        return list.filter(function (agent) {
            if (!agent || agent.hidden) return false;
            if (['inactive', 'deleted', 'disabled', 'archived', 'quit', 'fired', 'replaced'].includes(String(agent.status || '').toLowerCase())) return false;
            const id = String(agent.userId || agent.userID || agent.ytelId || agent.id || agent.agentId || agent.agentID || agent.userid || agent.uid || '').trim();
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
        qaRosterResolved = true;
        if (qaRosterTimeout) {
            if (typeof clearTimeout === 'function') clearTimeout(qaRosterTimeout);
            qaRosterTimeout = null;
        }
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
        let fallbackStarted = false;
        const loadRosterFallback = function () {
            if (fallbackStarted || !window.rtdbRef || !window.rtdbGet) return;
            fallbackStarted = true;
            try {
                Promise.resolve(window.rtdbGet(window.rtdbRef('biz_master_roster'))).then(function (snapshot) {
                    if (!qaRosterResolved) applyRosterUpdate(snapshot && typeof snapshot.val === 'function' ? snapshot.val() : []);
                }).catch(function () {
                    if (!qaRosterResolved) setStatus('qa-agent-status', 'Could not load the Firebase agent roster. Try reopening QA.', 'error');
                });
            } catch (_) {
                if (!qaRosterResolved) setStatus('qa-agent-status', 'Could not load the Firebase agent roster. Try reopening QA.', 'error');
            }
        };
        const onRosterError = function () {
            loadRosterFallback();
            if (qaRosterResolved) {
                const count = populateAgents();
                setStatus('qa-agent-status', count ? 'Live roster is unavailable. Showing the last loaded agent list.' : 'Could not load the Firebase agent roster. Try reopening QA.', 'error');
            }
        };
        if (typeof window.listenForMasterRoster === 'function') {
            try { qaRosterListener = window.listenForMasterRoster(applyRosterUpdate, onRosterError); }
            catch (_) { onRosterError(); }
        }
        // The live listener may be blocked or may not send an error in some browser
        // states. A one-time read provides a reliable initial list in either case.
        if (!qaRosterResolved) loadRosterFallback();
        if (!qaRosterResolved) {
            qaRosterTimeout = setTimeout(function () {
                qaRosterTimeout = null;
                if (!qaRosterResolved) setStatus('qa-agent-status', 'The agent list is taking too long to load. Refresh QA and try again.', 'error');
            }, 12000);
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

    function scorecardMarkup(sectionName) {
        return '<div class="qa-scorecard-columns"><div class="qa-scorecard-section"><h5>' + esc(sectionName) + ' standards</h5>' +
            SCORECARD_ITEMS.filter(function (item) { return item.section === sectionName; }).map(function (item) {
                return '<label>' + esc(item.label) + '<select id="qa-score-' + esc(item.key) + '"><option value="">Not rated</option><option>Meets standard</option><option>Needs coaching</option><option>Not applicable</option></select></label>';
            }).join('') + '</div></div>';
    }

    function sectionMarkup(key) {
        let content = '';
        if (key === 'callHandling') {
            content = '<div class="qa-form-grid"><label>Call type <select id="qa-call-type"><option value="">Select type</option><option>Warm transfer</option><option>Direct call</option><option>Follow-up</option><option>Other</option></select></label><label>Loan specialist <input type="text" id="qa-loan-specialist" maxlength="100" placeholder="Name, if applicable"></label></div>' +
                '<p class="qa-section-note">If the customer requests removal or annual revenue is below $200,000, stop qualification and do not transfer.</p>';
        } else if (key === 'agentScorecard') {
            content = scorecardMarkup('Agent');
        } else if (key === 'specialistScorecard') {
            content = scorecardMarkup('Loan specialist');
        } else if (key === 'strengths') {
            content = '<div class="qa-form-grid"><label class="qa-wide-field">What went well <textarea id="qa-strengths" rows="2" placeholder="Record specific strengths shown on this call."></textarea></label></div>';
        } else if (key === 'coachingPlan') {
            content = '<div class="qa-form-grid"><label>Coaching tip <textarea id="qa-coaching" rows="2" placeholder="Give one clear, practical tip."></textarea></label><label>Action plan <textarea id="qa-action-plan" rows="2" placeholder="Record the practice or action agreed with the agent."></textarea></label></div>' +
                '<div class="qa-follow-up-row"><label><input type="checkbox" id="qa-follow-up-needed"> Coaching follow-up required</label><label>Follow-up date <input type="date" id="qa-follow-up-date"></label></div>';
        } else if (key === 'reviewerNotes') {
            content = '<div class="qa-form-grid"><label class="qa-wide-field">Reviewer notes <textarea id="qa-notes" rows="3" placeholder="Add any other relevant review notes."></textarea></label></div>';
        }
        const section = OPTIONAL_SECTIONS.find(function (item) { return item.key === key; });
        if (!section || !content) return '';
        return '<section class="qa-optional-section" id="qa-section-' + esc(key) + '"><div class="qa-optional-section-heading"><div><h5>' + esc(section.label) + '</h5></div><button type="button" class="qa-remove-section" onclick="qaRemoveSection(\'' + esc(key) + '\')" aria-label="Remove ' + esc(section.label) + ' section">Remove section</button></div>' + content + '</section>';
    }

    window.qaAddSection = function (sectionKey) {
        const selector = $('qa-add-section-select');
        const key = sectionKey || (selector && selector.value);
        if (!OPTIONAL_SECTIONS.some(function (item) { return item.key === key; })) return false;
        if ($('qa-section-' + key)) return false;
        const host = $('qa-optional-sections');
        if (!host) return false;
        const markup = sectionMarkup(key);
        if (!markup) return false;
        host.insertAdjacentHTML('beforeend', markup);
        if (selector) {
            Array.prototype.forEach.call(selector.options || [], function (option) {
                if (option.value === key) option.disabled = true;
            });
            selector.value = '';
        }
        return true;
    };

    window.qaRemoveSection = function (sectionKey) {
        const section = $('qa-section-' + sectionKey);
        if (section && typeof section.remove === 'function') section.remove();
        const selector = $('qa-add-section-select');
        if (selector) Array.prototype.forEach.call(selector.options || [], function (option) {
            if (option.value === sectionKey) option.disabled = false;
        });
    };

    window.qaOutcomeChanged = function () {
        const invalidFields = $('qa-invalid-fields');
        if (invalidFields) invalidFields.hidden = !$('qa-outcome') || $('qa-outcome').value !== 'Invalid';
    };

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
        if (lower === 'no qualified') return 'No qualified call';
        if (lower === 'unclear audio') return 'Unclear / Incomplete Record';
        return reason;
    }

    function parseCSV(text) {
        const rows = [];
        let row = [];
        let cell = '';
        let quoted = false;
        const source = String(text || '').replace(/^\uFEFF/, '');
        for (let i = 0; i < source.length; i += 1) {
            const ch = source[i];
            if (quoted) {
                if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
                else if (ch === '"') quoted = false;
                else cell += ch;
            } else if (ch === '"') {
                quoted = true;
            } else if (ch === ',') {
                row.push(cell); cell = '';
            } else if (ch === '\n') {
                row.push(cell); rows.push(row); row = []; cell = '';
            } else if (ch !== '\r') {
                cell += ch;
            }
        }
        if (cell.length || row.length) { row.push(cell); rows.push(row); }
        return rows;
    }

    function importHeaderKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function findImportColumn(headers, aliases) {
        const keys = headers.map(importHeaderKey);
        for (let i = 0; i < aliases.length; i += 1) {
            const index = keys.indexOf(importHeaderKey(aliases[i]));
            if (index >= 0) return index;
        }
        return -1;
    }

    function parseImportDate(value, dateFormat) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (iso) {
            const y = Number(iso[1]), m = Number(iso[2]), d = Number(iso[3]);
            const check = new Date(y, m - 1, d);
            return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === d ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : '';
        }
        const numeric = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (numeric) {
            const first = Number(numeric[1]), second = Number(numeric[2]);
            let year = Number(numeric[3]);
            if (year < 100) year += year < 70 ? 2000 : 1900;
            let month, day;
            if (first > 12) { day = first; month = second; }
            else if (second > 12) { month = first; day = second; }
            else if (dateFormat === 'DMY') { day = first; month = second; }
            else { month = first; day = second; }
            const check = new Date(year, month - 1, day);
            return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day ? year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') : '';
        }
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.getFullYear() + '-' + String(parsed.getMonth() + 1).padStart(2, '0') + '-' + String(parsed.getDate()).padStart(2, '0');
    }

    function importScorecardText(text, section, scorecard) {
        String(text || '').split(/\s*\|\s*/).forEach(function (part) {
            const colon = part.lastIndexOf(':');
            if (colon < 0) return;
            const label = importHeaderKey(part.slice(0, colon));
            const rating = part.slice(colon + 1).trim();
            const item = SCORECARD_ITEMS.find(function (candidate) {
                return candidate.section === section && (importHeaderKey(candidate.label) === label || importHeaderKey(candidate.key) === label);
            });
            if (item && ['Meets standard', 'Needs coaching', 'Not applicable'].includes(rating)) scorecard[item.key] = rating;
        });
    }

    function parseImportRows(text, fileName, dateFormat) {
        const rows = parseCSV(text);
        const aliases = {
            date: ['Date', 'Call date', 'Date of call', 'Review date', 'Call date/time'],
            agent: ['Agent name', 'Agent', 'Representative', 'Agent full name', 'Rep name'],
            agentId: ['Agent ID', 'Agent number', 'User ID', 'Agent code'],
            team: ['Team', 'Group', 'Location'],
            callNumber: ['Call Number', 'Call Reference', 'Call Ref', 'Call ID', 'Call #', 'Call Number / ID'],
            customerNumber: ['Customer Number', 'Customer Phone', 'Customer phone number', 'Phone Number', 'Phone', 'Lead Number'],
            callType: ['Call Type', 'Type'], outcome: ['Outcome', 'Final Outcome', 'Status'],
            primaryReason: ['Primary Reason', 'Invalid Reason', 'Reason'], additionalReason: ['Additional Reason'],
            issueSource: ['Issue Source', 'Source'],
            finding: ['Review Finding', 'Review Finding and Evidence', 'Review Finding / Evidence', 'Review Findings', 'Finding', 'Call Notes'],
            strengths: ['Strengths', 'What Went Well'], coachingTip: ['Coaching Tip', 'Coaching'], actionPlan: ['Coaching Action Plan', 'Action Plan'],
            followUp: ['Follow-up Needed', 'Needs Follow-up', 'Coaching Follow-up'], followUpDate: ['Follow-up Date'],
            qaNotes: ['QA Notes', 'Reviewer Notes'], reviewer: ['Reviewer', 'Reviewed By'],
            agentScorecard: ['Agent Scorecard'], specialistScorecard: ['Loan Specialist Scorecard'],
            loanSpecialist: ['Loan Specialist', 'Specialist']
        };
        const columnsFor = function (headers) {
            const found = {};
            Object.keys(aliases).forEach(function (key) { found[key] = findImportColumn(headers, aliases[key]); });
            return found;
        };
        const hasCallDetails = function (columns) {
            return ['primaryReason', 'finding', 'callNumber', 'customerNumber', 'outcome', 'callType', 'issueSource', 'qaNotes'].some(function (key) { return columns[key] >= 0; });
        };
        const candidates = [];
        rows.forEach(function (row, index) {
            const columns = columnsFor(row);
            if (columns.agent >= 0 && columns.date >= 0 && hasCallDetails(columns)) candidates.push({ index: index, columns: columns });
        });
        if (!candidates.length) return { records: [], skipped: 0, hasCallNumber: false, error: 'Could not find a call table with Agent and Date columns.' };
        let reportDateRaw = '';
        rows.forEach(function (row) {
            if (importHeaderKey(row[0]) === 'reportdate') reportDateRaw = row[1] || '';
        });
        const hasDate = function (value) { return !!parseImportDate(value || reportDateRaw, dateFormat); };
        // Legacy workbooks can include a summary table before the call detail table.
        // Choose the candidate table with the most actual call rows.
        candidates.forEach(function (candidate, index) {
            const end = candidates[index + 1] ? candidates[index + 1].index : rows.length;
            const segment = rows.slice(candidate.index + 1, end);
            candidate.dataRows = segment.filter(function (row) {
                return String(row[candidate.columns.agent] || '').trim() && hasDate(row[candidate.columns.date]);
            }).length;
            candidate.detailColumns = Object.keys(candidate.columns).filter(function (key) { return candidate.columns[key] >= 0; }).length;
        });
        candidates.sort(function (a, b) { return b.dataRows - a.dataRows || b.detailColumns - a.detailColumns || a.index - b.index; });
        if (candidates[0].dataRows > 1000) return { records: [], skipped: 0, hasCallNumber: false, error: 'This import is over the 1,000-call limit. Split it into smaller files and try again.' };
        const headerIndex = candidates[0].index;
        const headers = rows[headerIndex];
        const columns = candidates[0].columns;
        const nextCandidate = candidates.filter(function (candidate) { return candidate.index > headerIndex; }).sort(function (a, b) { return a.index - b.index; })[0];
        const preamble = rows.slice(0, headerIndex).flat().join(' ');
        const reportDate = parseImportDate(reportDateRaw, dateFormat);
        const fileHint = (preamble + ' ' + String(fileName || '')).toLowerCase();
        const defaultOutcome = /\binvalid\b/.test(fileHint) ? 'Invalid' : 'Pending';
        const inferredTeam = cleanTeam(preamble);
        const activeAgents = roster();
        const agentNameKey = function (name) { return String(name || '').replace(/^GYB[\s:-]+/i, '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        const cell = function (row, index) { return index >= 0 ? String(row[index] || '').trim() : ''; };
        const records = [];
        let skipped = 0;
        rows.slice(headerIndex + 1, nextCandidate ? nextCandidate.index : rows.length).forEach(function (row) {
            if (!row.some(function (value) { return String(value || '').trim(); })) return;
            const agentRaw = cell(row, columns.agent);
            const parsedDate = parseImportDate(cell(row, columns.date) || reportDateRaw, dateFormat);
            if (!agentRaw || !parsedDate) { skipped += 1; return; }
            const matchedAgent = activeAgents.find(function (agent) {
                const name = agent.fullName || agent.name || agent.agentName || agent.ytelName;
                return agentNameKey(name) === agentNameKey(agentRaw);
            });
            const scorecard = {};
            importScorecardText(cell(row, columns.agentScorecard), 'Agent', scorecard);
            importScorecardText(cell(row, columns.specialistScorecard), 'Loan specialist', scorecard);
            const directRatings = {};
            SCORECARD_ITEMS.forEach(function (item) {
                const ratingColumn = findImportColumn(headers, [item.key, item.label]);
                const rating = cell(row, ratingColumn);
                if (['Meets standard', 'Needs coaching', 'Not applicable'].includes(rating)) directRatings[item.key] = rating;
            });
            Object.assign(scorecard, directRatings);
            const rawOutcome = cell(row, columns.outcome).toLowerCase();
            const outcome = rawOutcome.indexOf('valid') === 0 ? 'Valid' : (rawOutcome.indexOf('invalid') === 0 ? 'Invalid' : (rawOutcome.indexOf('pending') === 0 ? 'Pending' : defaultOutcome));
            const rawReason = cell(row, columns.primaryReason);
            const rawAdditionalReason = cell(row, columns.additionalReason);
            const followUpRaw = cell(row, columns.followUp).toLowerCase();
            const hasFollowUp = ['yes', 'true', 'required', '1'].includes(followUpRaw) || SCORECARD_ITEMS.some(function (item) { return scorecard[item.key] === 'Needs coaching'; });
            const matchedId = matchedAgent ? String(matchedAgent.userId || matchedAgent.userID || matchedAgent.ytelId || matchedAgent.id || matchedAgent.agentId || '') : '';
            records.push({
                date: parsedDate,
                agentId: cell(row, columns.agentId) || matchedId,
                agentName: matchedAgent ? String(matchedAgent.fullName || matchedAgent.name || matchedAgent.agentName || matchedAgent.ytelName || agentRaw) : agentRaw,
                team: cleanTeam(cell(row, columns.team)) || (matchedAgent ? cleanTeam(matchedAgent.team || matchedAgent.group || matchedAgent.location) : '') || inferredTeam,
                callType: cell(row, columns.callType),
                callNumber: cell(row, columns.callNumber),
                customerNumber: cell(row, columns.customerNumber),
                loanSpecialist: cell(row, columns.loanSpecialist),
                outcome: outcome,
                primaryReason: rawReason ? normalizeReason(rawReason) : '',
                additionalReason: rawAdditionalReason ? normalizeReason(rawAdditionalReason) : '',
                issueSource: cell(row, columns.issueSource),
                scorecard: scorecard,
                qaNotes: cell(row, columns.qaNotes) || ('Imported from ' + String(fileName || 'previous call report')),
                reviewFinding: cell(row, columns.finding),
                strengths: cell(row, columns.strengths),
                coachingTip: cell(row, columns.coachingTip),
                actionPlan: cell(row, columns.actionPlan),
                needsFollowUp: hasFollowUp,
                followUpDate: cell(row, columns.followUpDate),
                reviewerName: cell(row, columns.reviewer) || 'Imported legacy report',
                reviewerEmail: '',
                importedFromFile: String(fileName || 'previous call report')
            });
        });
        return { records: records, skipped: skipped, hasCallNumber: columns.callNumber >= 0 };
    }

    function importFingerprint(record) {
        const callNumber = String(record.callNumber || '').trim().toLowerCase();
        const customerNumber = String(record.customerNumber || '').replace(/\D/g, '');
        const finding = String(record.reviewFinding || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!callNumber && !customerNumber && !finding) return '';
        return [asDate(record), String(record.agentId || record.agentName || '').trim().toLowerCase(), callNumber, customerNumber,
            normalizeReason(record.primaryReason).toLowerCase(), finding].join('|');
    }

    function renderImportPreview() {
        const preview = $('qa-import-preview');
        if (!preview) return;
        preview.hidden = false;
        const dateFormat = $('qa-import-date-format') ? $('qa-import-date-format').value || 'MDY' : 'MDY';
        const parsed = parseImportRows(qaImportText, qaImportFileName, dateFormat);
        const seen = new Set();
        qaRecords.forEach(function (record) { const key = importFingerprint(record); if (key) seen.add(key); });
        qaImportRecords = [];
        qaImportDuplicates = 0;
        qaImportInvalidRows = parsed.skipped || 0;
        (parsed.records || []).forEach(function (record) {
            const key = importFingerprint(record);
            if (key && seen.has(key)) { qaImportDuplicates += 1; return; }
            if (key) seen.add(key);
            qaImportRecords.push(record);
        });
        const summary = $('qa-import-summary');
        if (summary) summary.textContent = parsed.error || (qaImportRecords.length + ' call(s) ready to import · ' + qaImportInvalidRows + ' row(s) skipped · ' + qaImportDuplicates + ' duplicate(s) skipped.' + (qaImportRecords.length > 8 ? ' Preview shows the first 8 calls.' : ''));
        const callNumberNote = $('qa-import-call-number-note');
        if (callNumberNote) callNumberNote.textContent = parsed.hasCallNumber ? 'Call Number values will be imported when present.' : 'This file has no Call Number column, so imported calls will leave it blank.';
        const body = $('qa-import-preview-body');
        if (body) {
            body.innerHTML = qaImportRecords.length ? qaImportRecords.slice(0, 8).map(function (record) {
                return '<tr><td>' + esc(record.date) + '</td><td>' + esc(record.agentName) + '</td><td>' + esc(record.callNumber || '—') + '</td><td>' + esc(record.customerNumber || '—') + '</td><td>' + outcomeMarkup(record.outcome) + '</td><td>' + esc(record.primaryReason || 'Not provided') + '</td><td>' + esc(record.reviewFinding || '—') + '</td></tr>';
            }).join('') : '<tr><td colspan="7" class="qa-empty">' + esc(parsed.error || 'No importable call rows were found.') + '</td></tr>';
        }
        const button = $('qa-import-confirm');
        if (button) {
            button.disabled = !qaImportRecords.length;
            button.textContent = qaImportRecords.length ? 'Import ' + qaImportRecords.length + (qaImportRecords.length === 1 ? ' Call' : ' Calls') : 'Import Calls';
        }
        setStatus('qa-import-status', parsed.error || '', parsed.error ? 'error' : '');
    }

    window.qaChooseImportFile = function () {
        const input = $('qa-import-file');
        if (input) { input.value = ''; input.click(); }
    };

    function importCellText(value) {
        if (value == null) return '';
        if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
            return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
        }
        if (typeof value === 'object') {
            if (Array.isArray(value.richText)) return value.richText.map(function (part) { return part.text || ''; }).join('');
            if (value.result != null) return importCellText(value.result);
            if (value.text != null) return String(value.text);
            if (value.hyperlink) return String(value.text || value.hyperlink);
            return '';
        }
        return String(value);
    }

    function quoteImportCSV(value) {
        const text = String(value == null ? '' : value);
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    async function readExcelImport(file) {
        if (!window.SpreadsheetImport || typeof window.SpreadsheetImport.readRows !== 'function') throw new Error('Excel workbook support did not load. Refresh the page and try again.');
        const outputRows = await window.SpreadsheetImport.readRows(file);
        return outputRows.map(function (row) { return row.map(function (value) { return quoteImportCSV(importCellText(value)); }).join(','); }).join('\r\n');
    }

    window.qaPreviewImportFile = async function (file) {
        if (!file) return;
        window.qaCancelImport();
        setStatus('qa-report-status', '', '');
        if (file.size > 5 * 1024 * 1024) {
            setStatus('qa-report-status', 'Choose a CSV or Excel file smaller than 5 MB.', 'error');
            return;
        }
        const extension = String(file.name || '').split('.').pop().toLowerCase();
        if (!['csv', 'xlsx', 'xlsm'].includes(extension)) {
            setStatus('qa-report-status', 'Choose a CSV, XLSX, or XLSM report file.', 'error');
            return;
        }
        try {
            if (extension === 'csv') {
                if (typeof file.text !== 'function') throw new Error('This browser could not read the CSV file.');
                qaImportText = await file.text();
            } else {
                qaImportText = await readExcelImport(file);
            }
            qaImportFileName = file.name || 'previous call report.' + extension;
            if ($('qa-import-date-format')) $('qa-import-date-format').value = 'MDY';
            renderImportPreview();
        } catch (error) {
            setStatus('qa-report-status', 'Could not read the report file. ' + (error && error.message ? error.message : ''), 'error');
        }
    };

    window.qaReparseImport = function () {
        if (qaImportText) renderImportPreview();
    };

    window.qaCancelImport = function () {
        qaImportText = '';
        qaImportFileName = '';
        qaImportRecords = [];
        qaImportDuplicates = 0;
        qaImportInvalidRows = 0;
        if ($('qa-import-file')) $('qa-import-file').value = '';
        if ($('qa-import-preview')) $('qa-import-preview').hidden = true;
        if ($('qa-import-preview-body')) $('qa-import-preview-body').innerHTML = '';
        if ($('qa-import-summary')) $('qa-import-summary').textContent = '';
        setStatus('qa-import-status', '', '');
    };

    window.qaCommitImport = async function () {
        if (!hasQAAccess()) { setStatus('qa-import-status', 'You do not have permission to import QA reports.', 'error'); return; }
        if (!qaImportRecords.length) { setStatus('qa-import-status', 'There are no new call records to import.', 'error'); return; }
        if (!window.rtdbRef || !window.rtdbUpdate) { setStatus('qa-import-status', 'Firebase is still connecting. Please try again in a moment.', 'error'); return; }
        const button = $('qa-import-confirm');
        if (button) { button.disabled = true; button.textContent = 'Importing…'; }
        const now = new Date().toISOString();
        const imported = qaImportRecords.map(function (record, index) {
            const id = 'qa-import-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 7);
            return { id: id, record: Object.assign({}, record, { createdAt: now, updatedAt: now, importedAt: now }) };
        });
        const updates = {};
        imported.forEach(function (entry) { updates[entry.id] = entry.record; });
        try {
            await window.rtdbUpdate(window.rtdbRef(QA_PATH), updates);
            const knownIds = new Set(qaRecords.map(function (record) { return String(record.id || ''); }));
            qaRecords = qaRecords.concat(imported.filter(function (entry) { return !knownIds.has(entry.id); }).map(function (entry) { return Object.assign({ id: entry.id }, entry.record); }));
            window.qaRenderReport();
            const importedCount = imported.length;
            window.qaCancelImport();
            setStatus('qa-report-status', importedCount + (importedCount === 1 ? ' previous call was' : ' previous calls were') + ' added to the QA report.', 'success');
        } catch (error) {
            setStatus('qa-import-status', 'Import failed. No report rows were added. ' + (error && error.message ? error.message : ''), 'error');
            if (button) { button.disabled = false; button.textContent = 'Import ' + qaImportRecords.length + ' Calls'; }
        }
    };

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

    function overviewChartData(records) {
        const typeCounts = {};
        const byAgent = {};
        records.forEach(function (record) {
            const callType = String(record.callType || '').trim();
            if (callType) typeCounts[callType] = (typeCounts[callType] || 0) + 1;
            const score = scorecardScore(record);
            if (score === null) return;
            const key = String(record.agentId || record.agentName || 'unknown').trim().toLowerCase();
            if (!byAgent[key]) byAgent[key] = { label: record.agentName || record.agentId || 'Unknown agent', agentId: record.agentId || '', total: 0, count: 0 };
            byAgent[key].total += score;
            byAgent[key].count += 1;
        });
        return {
            callTypes: Object.keys(typeCounts).map(function (label) { return { label: label, value: typeCounts[label] }; })
                .sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); }).slice(0, 7),
            agentQuality: Object.keys(byAgent).map(function (key) {
                const item = byAgent[key];
                return { label: item.label, agentId: item.agentId, value: Math.round(item.total / item.count), count: item.count };
            }).sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); })
        };
    }

    function hasCoachingFlag(record) {
        return Boolean(record && (record.needsFollowUp || SCORECARD_ITEMS.some(function (item) {
            return record.scorecard && record.scorecard[item.key] === 'Needs coaching';
        })));
    }

    function updateStats(reportRecords) {
        reportRecords = reportRecords || selectedReportRecords();
        const invalid = reportRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'invalid'; });
        const valid = reportRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'valid'; });
        const pending = reportRecords.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'pending'; });
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
        if ($('qa-stat-top-reason')) $('qa-stat-top-reason').textContent = top;
    }

    function chartBar(label, value, max, detail) {
        const width = max > 0 ? Math.max(0, Math.min(100, value * 100 / max)) : 0;
        return '<div class="qa-chart-row" role="listitem"><div class="qa-chart-label"><span title="' + esc(label) + '">' + esc(label) + '</span><strong>' + esc(detail) + '</strong></div><div class="qa-chart-track"><span style="width:' + width + '%"></span></div></div>';
    }

    function updateOverviewCharts(records) {
        const chartData = overviewChartData(records);
        const typeHost = $('qa-chart-call-types');
        if (typeHost) {
            const types = chartData.callTypes;
            const maxType = types.reduce(function (max, item) { return Math.max(max, item.value); }, 0);
            typeHost.innerHTML = types.length ? types.map(function (item) {
                return chartBar(item.label, item.value, maxType, item.value + (item.value === 1 ? ' call' : ' calls'));
            }).join('') : '<p class="qa-chart-empty">Call types have not been recorded in this report yet.</p>';
        }

        const qualityHost = $('qa-chart-agent-quality');
        if (qualityHost) {
            const agents = chartData.agentQuality;
            qualityHost.innerHTML = agents.length ? agents.map(function (item) {
                return chartBar(item.label, item.value, 100, item.value + '% avg · ' + item.count + (item.count === 1 ? ' review' : ' reviews'));
            }).join('') : '<p class="qa-chart-empty">Agent quality appears after a scorecard has been completed.</p>';
        }
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
            '<td><strong>' + esc(asDate(r)) + '</strong>' + (r.callType ? '<br><span class="qa-muted">' + esc(r.callType) + '</span>' : '') + '</td>' +
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
        const rows = selectedReportRecords();
        updateStats(rows);
        updateOverviewCharts(rows);
        const body = $('qa-report-body');
        if (!body) return;
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
        OPTIONAL_SECTIONS.forEach(function (section) { window.qaRemoveSection(section.key); });
        ['qa-edit-id', 'qa-call-number', 'qa-customer-number', 'qa-additional-reason', 'qa-finding'].forEach(function (id) {
            if ($(id)) $(id).value = '';
        });
        if ($('qa-agent')) $('qa-agent').value = '';
        if ($('qa-team')) $('qa-team').value = '';
        if ($('qa-date')) $('qa-date').value = localToday();
        if ($('qa-outcome')) $('qa-outcome').value = 'Pending';
        if ($('qa-primary-reason')) $('qa-primary-reason').value = '';
        if ($('qa-additional-reason')) $('qa-additional-reason').value = '';
        if ($('qa-issue-source')) $('qa-issue-source').value = '';
        window.qaOutcomeChanged();
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
        if (coachingRequired && !$('qa-coaching')) {
            window.qaAddSection('coachingPlan');
            setStatus('qa-save-status', 'A coaching plan section was added below. Complete it, then save the report again.', '');
            return;
        }
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
            issueSource: outcome === 'Invalid' ? String($('qa-issue-source') ? $('qa-issue-source').value : '') : '',
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
        window.qaResetForm();
        if (record.callType || record.loanSpecialist) window.qaAddSection('callHandling');
        const scorecard = record.scorecard || {};
        if (SCORECARD_ITEMS.some(function (item) { return item.section === 'Agent' && scorecard[item.key]; })) window.qaAddSection('agentScorecard');
        if (SCORECARD_ITEMS.some(function (item) { return item.section === 'Loan specialist' && scorecard[item.key]; })) window.qaAddSection('specialistScorecard');
        if (record.strengths) window.qaAddSection('strengths');
        if (record.coachingTip || record.actionPlan || record.needsFollowUp || record.followUpDate) window.qaAddSection('coachingPlan');
        if (record.qaNotes) window.qaAddSection('reviewerNotes');
        populateAgents(record.agentId);
        if ($('qa-edit-id')) $('qa-edit-id').value = record.id;
        if ($('qa-date')) $('qa-date').value = asDate(record);
        if ($('qa-team')) $('qa-team').value = cleanTeam(record.team);
        if ($('qa-call-type')) $('qa-call-type').value = record.callType || '';
        if ($('qa-call-number')) $('qa-call-number').value = record.callNumber || record.callId || '';
        if ($('qa-customer-number')) $('qa-customer-number').value = record.customerNumber || record.phoneLast4 || '';
        if ($('qa-loan-specialist')) $('qa-loan-specialist').value = record.loanSpecialist || '';
        if ($('qa-outcome')) $('qa-outcome').value = record.outcome || 'Pending';
        window.qaOutcomeChanged();
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
                return SCORECARD_ITEMS.filter(function (item) { return item.section === section && r.scorecard && r.scorecard[item.key]; }).map(function (item) {
                    return item.label + ': ' + String(r.scorecard[item.key]);
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

    const qaExportScripts = {};
    function loadExportScript(src) {
        if (qaExportScripts[src]) return qaExportScripts[src];
        qaExportScripts[src] = new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = function () {
                delete qaExportScripts[src];
                script.remove();
                reject(new Error('Export component could not load. Check that the js/vendor folder was uploaded.'));
            };
            document.head.appendChild(script);
        });
        return qaExportScripts[src];
    }

    function reportStats(rows) {
        const valid = rows.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'valid'; }).length;
        const invalidRows = rows.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'invalid'; });
        const pending = rows.filter(function (r) { return String(r.outcome || '').toLowerCase() === 'pending'; }).length;
        const reasons = {};
        invalidRows.forEach(function (r) {
            [r.primaryReason, r.additionalReason].filter(Boolean).map(normalizeReason).forEach(function (reason) {
                reasons[reason] = (reasons[reason] || 0) + 1;
            });
        });
        const scores = rows.map(scorecardScore).filter(function (score) { return score !== null; });
        return {
            reviewed: valid + invalidRows.length,
            valid: valid,
            invalid: invalidRows.length,
            pending: pending,
            topReason: Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a] || a.localeCompare(b); })[0] || 'None recorded',
            averageScore: scores.length ? Math.round(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length) : null
        };
    }

    function reportFilterLines() {
        const value = function (id) { return $(id) ? String($(id).value || '').trim() : ''; };
        return [
            'Date range: ' + (value('qa-filter-from') || 'Any') + ' to ' + (value('qa-filter-to') || 'Any'),
            'Team: ' + (value('qa-filter-team') || 'All teams') + ' | Outcome: ' + (value('qa-filter-outcome') || 'All outcomes'),
            'Reason: ' + (value('qa-filter-reason') || 'All reasons') + ' | Issue source: ' + (value('qa-filter-source') || 'All sources'),
            'Agent search: ' + (value('qa-filter-agent') || 'All agents'),
            'Generated: ' + new Date().toLocaleString('en-GB', { timeZone: 'America/Guyana' }) + ' (Guyana)'
        ];
    }

    function drawQaChart(title, entries, kind) {
        const shown = entries.slice(0, 10);
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = Math.max(430, 105 + shown.length * 34);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#193854';
        context.font = 'bold 27px Arial';
        context.fillText(title + (entries.length > shown.length ? ' (top 10)' : ''), 26, 42);
        if (!shown.length) {
            context.fillStyle = '#5b6878';
            context.font = '20px Arial';
            context.fillText(kind === 'quality' ? 'No rated scorecards in this report.' : 'No call types recorded in this report.', 28, 105);
            return canvas;
        }
        const max = kind === 'quality' ? 100 : Math.max.apply(null, shown.map(function (item) { return item.value; }));
        shown.forEach(function (item, index) {
            const y = 72 + index * 34;
            context.fillStyle = '#334155';
            context.font = '17px Arial';
            context.fillText(String(item.label).slice(0, 37), 25, y + 19, 310);
            const x = 350, width = 540;
            context.fillStyle = '#e8edf2';
            context.fillRect(x, y, width, 23);
            context.fillStyle = kind === 'quality' ? '#168c75' : '#1683a5';
            context.fillRect(x, y, width * item.value / (max || 1), 23);
            context.fillStyle = '#193854';
            context.font = 'bold 16px Arial';
            context.fillText(kind === 'quality' ? item.value + '% · ' + item.count + ' review(s)' : item.value + ' call(s)', 902, y + 18, 85);
        });
        return canvas;
    }

    function downloadExport(data, filename, mimeType) {
        const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function qaExportRows(rows) {
        return rows.map(function (r) {
            const score = scorecardScore(r);
            return [
                asDate(r), r.callType || '', r.agentName || '', r.agentId || '', cleanTeam(r.team) || r.team || '',
                r.callNumber || r.callId || '', r.customerNumber || r.phoneLast4 || '', r.loanSpecialist || '', r.outcome || 'Pending',
                r.primaryReason || '', r.additionalReason || '', r.issueSource || '', score === null ? '' : score,
                ...SCORECARD_ITEMS.map(function (item) { return r.scorecard && r.scorecard[item.key] || ''; }),
                r.reviewFinding || '', r.strengths || '', r.coachingTip || '', r.actionPlan || '', hasCoachingFlag(r) ? 'Yes' : 'No',
                r.followUpDate || '', r.qaNotes || '', r.reviewerName || ''
            ];
        });
    }

    async function runQAExport(type) {
        if (!hasQAAccess()) return;
        const rows = selectedReportRecords();
        if (!rows.length) {
            setStatus('qa-report-status', 'There are no calls in the current report filters to export.', 'error');
            return;
        }
        const button = $('qa-export-' + type);
        if (button) button.disabled = true;
        setStatus('qa-report-status', 'Preparing the ' + (type === 'pdf' ? 'PDF report' : 'Excel workbook') + '…', '');
        try {
            await (type === 'pdf'
                ? Promise.all([loadExportScript('js/vendor/jspdf.umd.min.js'), loadExportScript('js/vendor/jspdf.plugin.autotable.min.js')])
                : loadExportScript('js/vendor/exceljs.min.js'));
            const file = 'Call_QA_Report_' + localToday();
            if (type === 'pdf') await exportQAPDF(rows, file);
            else await exportQAExcel(rows, file);
            setStatus('qa-report-status', rows.length + ' call review(s) included in the ' + (type === 'pdf' ? 'PDF report.' : 'Excel workbook.'), 'success');
        } catch (error) {
            console.error('QA report export failed', error);
            setStatus('qa-report-status', 'Download failed: ' + (error && error.message ? error.message : 'Could not prepare the report.'), 'error');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function exportQAExcel(rows, file) {
        if (!window.ExcelJS || !window.ExcelJS.Workbook) throw new Error('Excel workbook support did not load.');
        const workbook = new window.ExcelJS.Workbook();
        workbook.creator = 'Biz Dashboard';
        workbook.created = new Date();
        const charts = overviewChartData(rows);
        const stats = reportStats(rows);
        const overview = workbook.addWorksheet('Overview');
        overview.columns = [{ width: 31 }, { width: 28 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];
        overview.mergeCells('A1:H2');
        overview.getCell('A1').value = 'CALL QUALITY ASSURANCE REPORT';
        overview.getCell('A1').font = { size: 22, bold: true, color: { argb: 'FF193854' } };
        reportFilterLines().forEach(function (line, index) {
            overview.mergeCells(index + 4, 1, index + 4, 8);
            overview.getCell(index + 4, 1).value = line;
        });
        [
            ['Matching calls', rows.length], ['Calls reviewed', stats.reviewed], ['Valid', stats.valid], ['Invalid', stats.invalid],
            ['Pending', stats.pending], ['Average QA score', stats.averageScore === null ? 'Not rated' : stats.averageScore + '%'], ['Top invalid reason', stats.topReason]
        ].forEach(function (item, index) {
            overview.getCell(index + 10, 1).value = item[0];
            overview.getCell(index + 10, 2).value = item[1];
            overview.getCell(index + 10, 1).font = { bold: true, color: { argb: 'FF193854' } };
        });
        const callChart = drawQaChart('Calls by type', charts.callTypes, 'type');
        const qualityChart = drawQaChart('Agent quality', charts.agentQuality, 'quality');
        const callImage = workbook.addImage({ base64: callChart.toDataURL('image/png'), extension: 'png' });
        const qualityImage = workbook.addImage({ base64: qualityChart.toDataURL('image/png'), extension: 'png' });
        overview.addImage(callImage, { tl: { col: 0, row: 18 }, br: { col: 4, row: 42 }, editAs: 'oneCell' });
        overview.addImage(qualityImage, { tl: { col: 4, row: 18 }, br: { col: 8, row: 42 }, editAs: 'oneCell' });
        overview.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 2, printArea: 'A1:H43' };

        function tableSheet(name, headers, data, widths) {
            const sheet = workbook.addWorksheet(name);
            sheet.columns = headers.map(function (header, index) { return { header: header, key: 'c' + index, width: widths && widths[index] || 20 }; });
            data.forEach(function (row) { sheet.addRow(row); });
            sheet.views = [{ state: 'frozen', ySplit: 1 }];
            sheet.autoFilter = { from: 'A1', to: { row: Math.max(1, data.length + 1), column: headers.length } };
            sheet.getRow(1).height = 34;
            sheet.getRow(1).eachCell(function (cell) {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF193854' } };
                cell.alignment = { vertical: 'middle', wrapText: true };
            });
            sheet.eachRow(function (row, rowNumber) {
                if (rowNumber === 1) return;
                row.eachCell(function (cell) {
                    cell.alignment = { vertical: 'top', wrapText: true };
                    if (rowNumber % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FA' } };
                });
            });
            sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
            return sheet;
        }

        tableSheet('Call Types', ['Call type', 'Calls'], charts.callTypes.map(function (item) { return [item.label, item.value]; }), [34, 16]);
        const qualitySheet = tableSheet('Agent Quality', ['Agent', 'Agent ID', 'Average quality', 'Rated reviews'], charts.agentQuality.map(function (item) { return [item.label, item.agentId, item.value / 100, item.count]; }), [34, 18, 21, 18]);
        qualitySheet.getColumn(3).numFmt = '0%';
        const headers = ['Date', 'Call type', 'Agent name', 'Agent ID', 'Team', 'Call Number', 'Customer Number', 'Loan specialist', 'Outcome', 'Primary reason', 'Additional reason', 'Issue source', 'QA score', ...SCORECARD_ITEMS.map(function (item) { return item.label; }), 'Review finding / evidence', 'Strengths', 'Coaching tip', 'Coaching action plan', 'Follow-up needed', 'Follow-up date', 'QA notes', 'Reviewer'];
        const widths = [14, 19, 25, 15, 12, 20, 21, 23, 14, 22, 22, 18, 12].concat(SCORECARD_ITEMS.map(function () { return 23; }), [45, 35, 38, 38, 16, 16, 40, 25]);
        const callsSheet = tableSheet('Call Reviews', headers, qaExportRows(rows), widths);
        callsSheet.getColumn(13).numFmt = '0"%"';
        const notes = tableSheet('Report Notes', ['Topic', 'Details'], [
            ['Scope', reportFilterLines().join('\n')],
            ['Score calculation', 'Each call score is the percentage of rated standards marked Meets standard. Needs coaching is counted as not meeting; Not rated and Not applicable are excluded. Agent quality is the average call score for each agent.'],
            ['Call totals', 'Calls reviewed counts Valid and Invalid outcomes. Pending calls are reported separately.'],
            ['Charts', 'The Overview charts reflect these report filters. Call Types and Agent Quality contain chart values; Call Reviews contains the full review details.']
        ], [25, 110]);
        notes.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
        downloadExport(await workbook.xlsx.writeBuffer(), file + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    async function exportQAPDF(rows, file) {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF report support did not load.');
        const charts = overviewChartData(rows);
        const stats = reportStats(rows);
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = 297, pageHeight = 210;
        const pdfText = function (value) { return String(value == null ? '' : value).replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' '); };
        let activeTitle = 'CALL QUALITY ASSURANCE REPORT';
        const heading = function (title) {
            doc.setFillColor(25, 56, 84); doc.rect(0, 0, pageWidth, 22, 'F'); doc.setTextColor(255);
            doc.setFontSize(16); doc.text(title, 12, 14); doc.setTextColor(30, 46, 64);
        };
        const newPage = function (title) { activeTitle = title; doc.addPage(); heading(title); };
        heading(activeTitle);
        doc.setFontSize(8);
        reportFilterLines().forEach(function (line, index) { doc.text(pdfText(line), 12, 29 + index * 5); });
        const metrics = [
            ['Reviewed', stats.reviewed], ['Valid', stats.valid], ['Invalid', stats.invalid], ['Pending', stats.pending],
            ['Average QA', stats.averageScore === null ? 'N/A' : stats.averageScore + '%'], ['Top reason', stats.topReason]
        ];
        metrics.forEach(function (item, index) {
            const x = 12 + index * 45.5;
            doc.setFillColor(238, 244, 249); doc.roundedRect(x, 57, 42, 22, 2, 2, 'F');
            doc.setFontSize(7); doc.text(item[0], x + 2, 64);
            doc.setFontSize(index === 5 ? 7 : 14);
            const value = doc.splitTextToSize(pdfText(String(item[1])), 38);
            doc.text(value, x + 2, 72);
        });
        const typeCanvas = drawQaChart('Calls by type', charts.callTypes, 'type');
        const qualityCanvas = drawQaChart('Agent quality', charts.agentQuality, 'quality');
        doc.addImage(typeCanvas.toDataURL('image/png'), 'PNG', 12, 84, 133, 66);
        doc.addImage(qualityCanvas.toDataURL('image/png'), 'PNG', 151, 84, 133, 66);
        doc.setFontSize(7); doc.setTextColor(83, 99, 119);
        doc.text('QA scores use only standards marked Meets standard or Needs coaching. Calls without a rated score are excluded from average quality.', 12, 159);
        activeTitle = 'CALL REVIEW DETAILS';
        const reasons = function (record) { return [record.primaryReason, record.additionalReason].filter(Boolean).join(' · ') || '—'; };
        const coaching = function (record) {
            const ratings = SCORECARD_ITEMS.filter(function (item) { return record.scorecard && record.scorecard[item.key]; })
                .map(function (item) { return item.label + ': ' + record.scorecard[item.key]; });
            return [
                record.reviewFinding && 'Finding: ' + record.reviewFinding,
                record.strengths && 'Strengths: ' + record.strengths,
                record.coachingTip && 'Coaching: ' + record.coachingTip,
                record.actionPlan && 'Action plan: ' + record.actionPlan,
                ratings.length && 'Scorecard: ' + ratings.join(' | '),
                hasCoachingFlag(record) && 'Coaching follow-up required',
                record.followUpDate && 'Follow-up: ' + record.followUpDate,
                record.qaNotes && 'Reviewer notes: ' + record.qaNotes,
                record.reviewerName && 'Reviewed by: ' + record.reviewerName
            ].filter(Boolean).join('\n') || '—';
        };
        newPage(activeTitle);
        const body = rows.map(function (r) {
            const score = scorecardScore(r);
            return [
                pdfText(asDate(r) + (r.callType ? '\n' + r.callType : '')),
                pdfText((r.agentName || 'Unknown') + (r.agentId ? '\n' + r.agentId : '') + (r.team ? '\n' + (cleanTeam(r.team) || r.team) : '') + (r.loanSpecialist ? '\nSpecialist: ' + r.loanSpecialist : '')),
                pdfText(r.callNumber || r.callId || '—'), pdfText(r.customerNumber || r.phoneLast4 || '—'),
                pdfText(r.outcome || 'Pending'), pdfText(reasons(r)), pdfText((score === null ? 'Not rated' : score + '%') + (r.issueSource ? '\n' + r.issueSource : '')),
                pdfText(coaching(r))
            ];
        });
        const tableOptions = {
            startY: 29, margin: { top: 29, left: 12, right: 12, bottom: 15 },
            head: [['Date / type', 'Agent / team', 'Call Number', 'Customer Number', 'Outcome', 'Reason(s)', 'Score / source', 'Finding and coaching']],
            body: body, styles: { fontSize: 6.4, cellPadding: 1.7, overflow: 'linebreak', valign: 'top' },
            headStyles: { fillColor: [25, 56, 84], fontSize: 6.5 }, alternateRowStyles: { fillColor: [241, 245, 249] },
            columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 38 }, 2: { cellWidth: 25 }, 3: { cellWidth: 27 }, 4: { cellWidth: 18 }, 5: { cellWidth: 34 }, 6: { cellWidth: 25 }, 7: { cellWidth: 81 } },
            rowPageBreak: 'avoid', didDrawPage: function () { heading(activeTitle); }
        };
        doc.autoTable(tableOptions);
        for (let index = 1; index <= doc.getNumberOfPages(); index++) {
            doc.setPage(index); doc.setFontSize(7); doc.setTextColor(90);
            doc.text('Biz Dashboard | Call QA | ' + localToday(), 12, pageHeight - 6);
            doc.text('Page ' + index + ' of ' + doc.getNumberOfPages(), pageWidth - 12, pageHeight - 6, { align: 'right' });
        }
        downloadExport(doc.output('arraybuffer'), file + '.pdf', 'application/pdf');
    }

    window.qaExportPDF = function () { return runQAExport('pdf'); };
    window.qaExportExcel = function () { return runQAExport('excel'); };

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
        const ratedItems = SCORECARD_ITEMS.filter(function (item) { return record.scorecard && record.scorecard[item.key]; });
        const scoreRows = ratedItems.map(function (item) {
            return '<tr><td>' + esc(item.section) + '</td><td>' + esc(item.label) + '</td><td>' + esc(record.scorecard[item.key]) + '</td></tr>';
        }).join('');
        const score = scorecardScore(record);
        const textBlock = function (label, value) {
            return value ? '<section class="note"><h2>' + esc(label) + '</h2><p>' + esc(value).replace(/\n/g, '<br>') + '</p></section>' : '';
        };
        const detailItems = [
            ['Call date', asDate(record)], ['Call number', record.callNumber || record.callId], ['Customer number', record.customerNumber || record.phoneLast4],
            ['Agent', (record.agentName || 'Unknown') + (record.agentId ? ' (' + record.agentId + ')' : '')], ['Team', cleanTeam(record.team) || record.team]
        ];
        if (record.callType) detailItems.push(['Call type', record.callType]);
        if (record.loanSpecialist) detailItems.push(['Loan specialist', record.loanSpecialist]);
        if (record.primaryReason) detailItems.push(['Primary reason', record.primaryReason]);
        if (record.additionalReason) detailItems.push(['Additional reason', record.additionalReason]);
        if (record.issueSource) detailItems.push(['Issue source', record.issueSource]);
        const details = detailItems.map(function (item) { return detail(item[0], item[1]); }).join('');
        const scorecardBlock = ratedItems.length ? '<section class="note"><h2>Call quality scorecard</h2><table class="score-table"><thead><tr><th>Review area</th><th>Standard</th><th>Rating</th></tr></thead><tbody>' + scoreRows + '</tbody></table></section>' : '';
        const followUpBlock = hasCoachingFlag(record) || record.followUpDate ? '<div class="grid">' + detail('Coaching follow-up', hasCoachingFlag(record) ? 'Required' : 'Not marked') + (record.followUpDate ? detail('Follow-up date', record.followUpDate) : '') + '</div>' : '';
        const html = '<!doctype html><html><head><meta charset="utf-8"><title>Call Quality Review</title><style>' +
            'body{font:14px Arial,sans-serif;color:#172033;margin:34px}header{border-bottom:4px solid #0e7490;padding-bottom:18px;margin-bottom:22px}header p{color:#64748b;margin:6px 0}h1{font-size:26px;margin:0;color:#0f2740}h2{font-size:15px;margin:0 0 10px;color:#0f4c68}.eyebrow{font-size:10px;font-weight:bold;letter-spacing:2px;color:#0e7490;margin-bottom:7px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.detail{border:1px solid #d9e2ec;border-radius:7px;padding:10px}.detail span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;margin-bottom:5px}.detail strong{font-size:12px}.badge{display:inline-block;padding:5px 9px;border-radius:20px;background:#e8f5f8;color:#075985;font-weight:bold}.qa-outcome-pill{display:inline-block;padding:5px 9px;border:1px solid #cbd5e1;border-radius:20px;font-weight:bold}.qa-outcome-valid{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.qa-outcome-invalid{background:#fff1f2;color:#be123c;border-color:#fecdd3}.qa-outcome-pending{background:#fffbeb;color:#a16207;border-color:#fde68a}.note{border:1px solid #d9e2ec;border-radius:8px;padding:14px;margin:13px 0;break-inside:avoid}.note p{margin:0;line-height:1.55;white-space:normal}.score{font-size:22px;color:#0e7490;font-weight:bold}.score-table{width:100%;border-collapse:collapse;font-size:11px}.score-table td,.score-table th{border-bottom:1px solid #d9e2ec;text-align:left;padding:8px}.score-table th{background:#eff6fa}.signature{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:32px}.signature div{border-top:1px solid #94a3b8;padding-top:7px;color:#64748b;font-size:11px}@media print{body{margin:14mm}header{break-after:avoid}.note{break-inside:avoid}}' +
            '</style></head><body><header><div class="eyebrow">QUALITY ASSURANCE</div><h1>Call Quality Review</h1><p>Prepared ' + esc(new Date().toLocaleString()) + '</p></header>' +
            '<div class="grid">' + details + '</div>' +
            '<p>Final outcome: ' + outcomeMarkup(record.outcome) + (score === null ? '' : ' &nbsp; <span class="score">' + score + '% QA score</span>') + '</p>' +
            scorecardBlock + textBlock('Review finding and evidence', record.reviewFinding) + textBlock('What went well', record.strengths) + textBlock('Coaching tip', record.coachingTip) +
            textBlock('Coaching action plan', record.actionPlan) + textBlock('Reviewer notes', record.qaNotes) + followUpBlock +
            '<div class="grid">' + detail('Reviewed by', record.reviewerName) + '</div>' +
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
        if (initialAgentCount) qaRosterResolved = true;
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
            setStatus('qa-agent-status', 'Could not connect to the Firebase agent roster. Try reopening QA.', 'error');
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
