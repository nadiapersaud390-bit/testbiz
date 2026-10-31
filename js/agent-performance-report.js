(function (global) {
  'use strict';

  const PACIFIC = 'America/Los_Angeles';
  const EASTERN = 'America/New_York';
  const TIME_FIELDS = ['LOGIN TIME', 'WAIT', 'TALK', 'DISPO', 'PAUSE', 'DEAD', 'CUSTOMER', 'CONNECTED', 'BREAK', 'BTHRM', 'LUNCH'];
  const STATUS_BASE_FIELDS = new Set(['USER NAME', 'CALLS', 'CICALLS', 'DNC/CI']);
  const state = { guyanaFile: null, philippinesFile: null, timeFile: null, report: null, bound: false };
  const scriptPromises = {};
  const $ = id => document.getElementById(id);

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function cleanHeader(value) { return String(value == null ? '' : value).trim().toUpperCase().replace(/\s+/g, ' '); }
  function numeric(value) {
    const n = Number(String(value == null ? '' : value).replace(/[,%\s]/g, '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  function percentage(value, total) { return total > 0 ? value / total : 0; }
  function parseDuration(value) {
    if (value == null || String(value).trim() === '') return null;
    const s = String(value).trim().replace(/^"|"$/g, '');
    const match = s.match(/^(-)?(\d+):([0-5]?\d):([0-5]?\d)$/);
    if (match) return (match[1] ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]));
    const short = s.match(/^(-)?(\d+):([0-5]?\d)$/);
    if (short) return (short[1] ? -1 : 1) * (Number(short[2]) * 60 + Number(short[3]));
    return null;
  }
  function formatDuration(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) return 'Not recorded';
    const sign = seconds < 0 ? '-' : '';
    let n = Math.abs(Math.round(seconds));
    const h = Math.floor(n / 3600); n %= 3600;
    const m = Math.floor(n / 60); const s = n % 60;
    return sign + h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function excelDuration(seconds) { return seconds == null ? null : seconds / 86400; }
  function normalizeId(value) {
    const digits = String(value == null ? '' : value).match(/\d+/g);
    return digits ? digits.join('').replace(/^0+(?=\d)/, '') : '';
  }
  function parseCsv(text) {
    if (global.Papa && typeof global.Papa.parse === 'function') {
      const parsed = global.Papa.parse(text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false });
      if (parsed.errors && parsed.errors.some(error => error.code !== 'UndetectableDelimiter')) {
        const hard = parsed.errors.filter(error => error.type === 'Quotes');
        if (hard.length) throw new Error('The CSV could not be read cleanly. Please export it again and upload the file.');
      }
      const fields = (parsed.meta && parsed.meta.fields || []).map(cleanHeader);
      const rows = (parsed.data || []).map(row => {
        const out = {};
        Object.keys(row || {}).forEach(key => { out[cleanHeader(key)] = String(row[key] == null ? '' : row[key]).trim(); });
        return out;
      });
      return { fields, rows };
    }
    const records = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); if (row.some(value => String(value).trim())) records.push(row);
        row = []; cell = '';
      } else cell += ch;
    }
    row.push(cell); if (row.some(value => String(value).trim())) records.push(row);
    const fields = (records.shift() || []).map(cleanHeader);
    return { fields, rows: records.map(values => Object.fromEntries(fields.map((field, i) => [field, String(values[i] == null ? '' : values[i]).trim()])) ) };
  }
  function value(row, key) { return row && row[cleanHeader(key)] != null ? row[cleanHeader(key)] : ''; }
  function isFooter(row, identity) {
    const s = String(identity || '').trim().toUpperCase();
    return !s || s.includes('TOTAL') || s.startsWith('AGENT STATUS') || s.startsWith('TIME RANGE');
  }
  function parseStatusRows(parsed, region) {
    const list = [], duplicates = [];
    const seen = new Set();
    const dispositionFields = parsed.fields.filter(field => field && !STATUS_BASE_FIELDS.has(field));
    parsed.rows.forEach(row => {
      const label = value(row, 'USER NAME');
      if (isFooter(row, label)) return;
      const idMatch = String(label).match(/(?:-|–)\s*(\d+)\s*$/) || String(label).match(/(\d+)\s*$/);
      const id = normalizeId(idMatch ? idMatch[1] : '');
      if (!id) return;
      if (seen.has(id)) { duplicates.push(id); return; }
      seen.add(id);
      const nameWithoutId = String(label).replace(/\s*(?:-|–)\s*\d+\s*$/, '').trim();
      const prefixMatch = nameWithoutId.match(/^([A-Z0-9]{2,8})\s+(.+)$/i);
      const counts = {};
      dispositionFields.forEach(field => { counts[field] = numeric(value(row, field)); });
      list.push({
        id,
        name: prefixMatch ? prefixMatch[2].trim() : nameWithoutId,
        sourcePrefix: prefixMatch ? prefixMatch[1].toUpperCase() : '',
        region,
        calls: numeric(value(row, 'CALLS')),
        customers: numeric(value(row, 'CICALLS')),
        dncCi: String(value(row, 'DNC/CI') || '').trim(),
        dispositions: counts
      });
    });
    return { list, duplicates, dispositionFields };
  }
  function parseTimeRows(parsed) {
    const list = [], duplicates = [];
    const seen = new Set();
    parsed.rows.forEach(row => {
      const label = value(row, 'USER');
      if (isFooter(row, label)) return;
      const id = normalizeId(value(row, 'ID'));
      if (!id) return;
      if (seen.has(id)) { duplicates.push(id); return; }
      seen.add(id);
      const nameMatch = String(label).trim().match(/^([A-Z0-9]{2,8})\s+(.+)$/i);
      const durations = {};
      TIME_FIELDS.forEach(field => { durations[field] = parseDuration(value(row, field)); });
      list.push({
        id,
        name: nameMatch ? nameMatch[2].trim() : String(label).trim(),
        sourcePrefix: nameMatch ? nameMatch[1].toUpperCase() : '',
        group: String(value(row, 'USER GROUP') || '').trim(),
        calls: numeric(value(row, 'CALLS')),
        durations
      });
    });
    return { list, duplicates };
  }
  function parseSourceWindow(text, fileName) {
    const range = String(text || '').match(/Time\s+Range\s*[-:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+To\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/i);
    if (range) return { startDate: range[1], startTime: range[2], endDate: range[3], endTime: range[4], source: 'CSV time range footer' };
    const date = String(fileName || '').match(/(?:^|[^\d])(\d{1,2})[_-](\d{1,2})[_-](\d{4})(?:[^\d]|$)/);
    if (date) {
      const month = String(date[1]).padStart(2, '0'), day = String(date[2]).padStart(2, '0');
      return { startDate: date[3] + '-' + month + '-' + day, endDate: date[3] + '-' + month + '-' + day, source: 'CSV filename' };
    }
    return { startDate: '', endDate: '', source: 'No date found in export' };
  }
  function dateParts(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
  }
  function zoneParts(epoch, zone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(epoch));
    const obj = {};
    parts.forEach(part => { if (part.type !== 'literal') obj[part.type] = Number(part.value); });
    return obj;
  }
  function localDateTimeToEpoch(iso, time, zone) {
    const d = dateParts(iso), t = String(time || '00:00:00').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!d || !t) return null;
    const target = Date.UTC(d.year, d.month - 1, d.day, Number(t[1]), Number(t[2]), Number(t[3] || 0));
    let epoch = target;
    for (let i = 0; i < 4; i++) {
      const actual = zoneParts(epoch, zone);
      const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
      epoch += target - represented;
    }
    return epoch;
  }
  function formatDate(iso, zone) {
    const d = dateParts(iso); if (!d) return 'Date not available';
    const epoch = Date.UTC(d.year, d.month - 1, d.day, 12, 0, 0);
    return new Intl.DateTimeFormat('en-US', { timeZone: zone || EASTERN, month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(epoch));
  }
  function formatDateTime(epoch, zone) {
    if (epoch == null) return 'Time unavailable';
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(epoch));
  }
  function periodDetails(period) {
    const start = period.startDate && period.startTime ? localDateTimeToEpoch(period.startDate, period.startTime, PACIFIC) : null;
    const end = period.endDate && period.endTime ? localDateTimeToEpoch(period.endDate, period.endTime, PACIFIC) : null;
    const shiftStart = period.startDate ? localDateTimeToEpoch(period.startDate, '11:00:00', EASTERN) : null;
    const shiftEnd = period.startDate ? localDateTimeToEpoch(period.startDate, '20:00:00', EASTERN) : null;
    const dateLabel = period.startDate ? (period.startDate === period.endDate ? formatDate(period.startDate, EASTERN) : formatDate(period.startDate, EASTERN) + ' to ' + formatDate(period.endDate, EASTERN)) : 'Source date not detected';
    let windowLine = 'Source period: date not detected. Confirm the export date before using the report.';
    if (start != null && end != null) windowLine = 'Source reporting window: ' + formatDateTime(start, PACIFIC) + ' to ' + formatDateTime(end, PACIFIC) + ' Pacific. Eastern equivalent: ' + formatDateTime(start, EASTERN) + ' to ' + formatDateTime(end, EASTERN) + '.';
    else if (period.startDate) windowLine = 'Report date found in the ' + period.source + ': ' + dateLabel + '. The export did not include a full time range.';
    let shiftLine = 'Scheduled shift: 11:00 AM to 8:00 PM Eastern.';
    if (shiftStart != null && shiftEnd != null) {
      const ps = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(shiftStart));
      const pe = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(shiftEnd));
      const es = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(shiftStart));
      const ee = new Intl.DateTimeFormat('en-US', { timeZone: EASTERN, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(shiftEnd));
      shiftLine = 'Scheduled shift: ' + es + ' to ' + ee + ' Eastern, equivalent to ' + ps + ' to ' + pe + ' Pacific on this report date.';
    }
    return { dateLabel, windowLine, shiftLine };
  }
  function createReport(guyanaText, philippinesText, timeText, guyanaName, philippinesName, timeName, targets) {
    const guyana = parseStatusRows(parseCsv(guyanaText), 'Guyana');
    const philippines = parseStatusRows(parseCsv(philippinesText), 'Philippines');
    if (!guyana.list.length) throw new Error('No agent rows were found in the Guyana Status Details CSV.');
    if (!philippines.list.length) throw new Error('No agent rows were found in the Philippines Status Details CSV.');
    const status = {
      list: guyana.list.concat(philippines.list),
      duplicates: guyana.duplicates.concat(philippines.duplicates),
      dispositionFields: [...new Set(guyana.dispositionFields.concat(philippines.dispositionFields))]
    };
    const timeProvided = !!String(timeText || '').trim();
    const time = timeProvided ? parseTimeRows(parseCsv(timeText)) : { list: [], duplicates: [] };
    if (timeProvided && !time.list.length) throw new Error('No agent rows were found in the Time Details CSV.');
    const statusIds = new Set(guyana.list.map(agent => agent.id));
    const overlappingStatusIds = philippines.list.filter(agent => statusIds.has(agent.id)).map(agent => agent.id);
    const duplicates = [...new Set(status.duplicates.concat(overlappingStatusIds, time.duplicates))];
    if (duplicates.length) throw new Error('Duplicate agent IDs were found: ' + duplicates.join(', ') + '. Check for repeated agents across the two location files and remove duplicate rows.');
    const statusMap = new Map(status.list.map(agent => [agent.id, agent]));
    const timeMap = new Map(time.list.map(agent => [agent.id, agent]));
    const ids = [...new Set([...statusMap.keys(), ...timeMap.keys()])];
    const agents = ids.map(id => {
      const s = statusMap.get(id) || null, t = timeMap.get(id) || null;
      const dispositions = s ? s.dispositions : {};
      const callsStatus = s ? s.calls : null;
      const callsTime = t ? t.calls : null;
      const xfer = numeric(dispositions.XFER);
      const directXfer = numeric(dispositions.DRXFER);
      return {
        id, name: (s && s.name) || (t && t.name) || 'Unknown agent',
        sourcePrefix: (t && t.sourcePrefix) || (s && s.sourcePrefix) || '',
        sourceGroup: t ? t.group : '', region: s ? s.region : 'Unmatched Time Details', status: s, time: t, dispositions,
        callsStatus, callsTime, calls: callsStatus == null ? (callsTime || 0) : callsStatus,
        customers: s ? s.customers : 0, xfer, directXfer, leads: xfer + directXfer,
        customerTalk: t ? t.durations.CUSTOMER : null,
        breakTime: t ? t.durations.BREAK : null,
        bathroomTime: t ? t.durations.BTHRM : null,
        lunchTime: t ? t.durations.LUNCH : null,
        sourceMissing: !s ? 'Status Details missing' : (timeProvided && !t ? 'Time Details missing' : '')
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const period = parseSourceWindow(guyanaText, guyanaName);
    const philippinesPeriod = parseSourceWindow(philippinesText, philippinesName);
    const timePeriod = timeProvided ? parseSourceWindow(timeText, timeName) : { startDate: '', endDate: '' };
    if (period.startDate && philippinesPeriod.startDate && period.startDate !== philippinesPeriod.startDate) {
      throw new Error('The Guyana and Philippines Status Details exports have different report dates. Upload exports from the same reporting date.');
    }
    const statusDate = period.startDate || philippinesPeriod.startDate;
    const timeDateMismatch = !!(timeProvided && statusDate && timePeriod.startDate && statusDate !== timePeriod.startDate);
    if (!period.startDate && philippinesPeriod.startDate) Object.assign(period, philippinesPeriod);
    if (!period.startDate && timePeriod.startDate) Object.assign(period, timePeriod);
    const dispositionFields = status.dispositionFields;
    const totals = {
      agents: status.list.length,
      calls: agents.reduce((sum, a) => sum + (a.callsStatus || 0), 0),
      timeCalls: timeProvided ? agents.reduce((sum, a) => sum + (a.callsTime || 0), 0) : null,
      customers: agents.reduce((sum, a) => sum + a.customers, 0),
      xfer: agents.reduce((sum, a) => sum + a.xfer, 0),
      directXfer: agents.reduce((sum, a) => sum + a.directXfer, 0),
      leads: agents.reduce((sum, a) => sum + a.leads, 0),
      customerTalk: timeProvided ? agents.reduce((sum, a) => sum + (a.customerTalk || 0), 0) : null,
      breakTime: agents.reduce((sum, a) => sum + (a.breakTime || 0), 0),
      bathroomTime: agents.reduce((sum, a) => sum + (a.bathroomTime || 0), 0),
      bathroomRecorded: agents.filter(a => a.bathroomTime != null).length,
      lunchTime: agents.reduce((sum, a) => sum + (a.lunchTime || 0), 0)
    };
    const missingStatus = agents.filter(a => !a.status).length;
    const missingTime = timeProvided ? agents.filter(a => a.status && !a.time).length : 0;
    const unmatchedTime = timeProvided ? agents.filter(a => !a.status && a.time).length : 0;
    return {
      agents, period, periodView: periodDetails(period), dispositionFields, totals, missingStatus, missingTime, unmatchedTime, timeProvided, timeDateMismatch,
      targets: targets || { Guyana: null, Philippines: null },
      regionNames: ['Guyana', 'Philippines'],
      fileNames: { guyana: guyanaName, philippines: philippinesName, time: timeProvided ? timeName : 'Not uploaded' }
    };
  }
  function productionTargets() {
    const read = id => {
      const raw = $(id).value.trim();
      if (raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return { Guyana: read('apr-guyana-target'), Philippines: read('apr-philippines-target') };
  }
  function regionSummaries(report, targets) {
    return report.regionNames.map(region => {
      const agents = report.agents.filter(agent => agent.region === region);
      const leads = agents.reduce((sum, agent) => sum + agent.leads, 0);
      const target = targets[region];
      return {
        region, agents: agents.filter(agent => agent.status).length,
        calls: agents.reduce((sum, agent) => sum + (agent.callsStatus || 0), 0),
        customers: agents.reduce((sum, agent) => sum + agent.customers, 0),
        xfer: agents.reduce((sum, agent) => sum + agent.xfer, 0),
        directXfer: agents.reduce((sum, agent) => sum + agent.directXfer, 0), leads, target,
        attainment: target ? leads / target : null
      };
    });
  }
  function allowances() {
    const positive = id => Math.max(0, Math.min(240, Number($(id).value) || 0));
    const morning = positive('apr-morning-allowance');
    const afternoon = positive('apr-afternoon-allowance');
    const bathroomValue = $('apr-bathroom-limit').value.trim();
    const bathroomReviewLimit = bathroomValue === '' ? null : Math.max(0, Math.min(480, Number(bathroomValue) || 0));
    return { morning, afternoon, breakTotal: morning + afternoon, lunch: positive('apr-lunch-allowance'), bathroomReviewLimit, targets: productionTargets() };
  }
  function averageBathroomTime(report) {
    return report && report.totals.bathroomRecorded ? report.totals.bathroomTime / report.totals.bathroomRecorded : null;
  }
  function formatDifference(seconds) {
    if (seconds == null) return 'N/A';
    return (seconds > 0 ? '+' : '') + formatDuration(seconds);
  }
  function reviewText(agent, limits, report) {
    const notes = [];
    if (agent.sourceMissing) notes.push(agent.sourceMissing);
    if (agent.callsStatus != null && agent.callsTime != null && agent.callsStatus !== agent.callsTime) notes.push('Call totals differ between files');
    if (report.timeProvided && agent.breakTime == null) notes.push('Break time not provided');
    else if (report.timeProvided && agent.breakTime < limits.breakTotal) notes.push('Check whether both breaks were recorded');
    else if (report.timeProvided && agent.breakTime > limits.breakTotal) notes.push('Recorded break time is above allowance');
    if (report.timeProvided && agent.lunchTime == null) notes.push('Lunch time not provided');
    else if (report.timeProvided && agent.lunchTime < limits.lunch) notes.push('Check the lunch record');
    else if (report.timeProvided && agent.lunchTime > limits.lunch) notes.push('Recorded lunch is above allowance');
    if (report.timeProvided && agent.bathroomTime == null) notes.push('Bathroom time not provided');
    else if (report.timeProvided) {
      if (limits.bathroomReviewLimit != null && agent.bathroomTime > limits.bathroomReviewLimit * 60) {
        notes.push('Bathroom time exceeds review limit by ' + formatDuration(agent.bathroomTime - limits.bathroomReviewLimit * 60));
      }
      const average = averageBathroomTime(report);
      if (average != null && agent.bathroomTime > average) notes.push('Bathroom time is above group average by ' + formatDuration(agent.bathroomTime - average));
    }
    return notes.length ? notes.join(' • ') : 'No data checks flagged';
  }
  function render() {
    if (!state.report) return;
    const report = state.report, limits = allowances(), totalLeads = report.totals.leads;
    $('apr-content').hidden = false;
    $('apr-report-period').textContent = 'Agent Performance & Coaching Report | ' + report.periodView.dateLabel;
    $('apr-period-conversion').textContent = report.periodView.windowLine + ' ' + report.periodView.shiftLine;
    const bathroomAverage = averageBathroomTime(report);
    const bathroomLimitText = limits.bathroomReviewLimit == null ? 'Compare each agent with the group average' : 'Optional review limit: ' + limits.bathroomReviewLimit + ' min';
    const stats = [
      ['Agents in report', report.totals.agents, 'Across both Status Details exports'],
      ['Calls', report.totals.calls.toLocaleString(), 'Guyana + Philippines Status Details'],
      ['Customer interactions', report.totals.customers.toLocaleString(), 'CIcalls from Status Details'],
      ['Total leads', totalLeads.toLocaleString(), report.totals.xfer.toLocaleString() + ' XFER + ' + report.totals.directXfer.toLocaleString() + ' direct XFER'],
      ['Lead rate', (percentage(totalLeads, report.totals.calls) * 100).toFixed(1) + '%', 'Total leads ÷ status calls'],
      ['Customer talk time', report.timeProvided ? formatDuration(report.totals.customerTalk) : 'Not uploaded', 'CUSTOMER duration from Time Details'],
      ['Bathroom time', report.timeProvided ? formatDuration(report.totals.bathroomTime) : 'Not uploaded', report.timeProvided ? 'Group average: ' + formatDuration(bathroomAverage) : 'Upload Time Details to calculate']
    ];
    $('apr-summary-cards').innerHTML = stats.map(item => '<div class="apr-stat"><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong><small>' + escapeHtml(item[2]) + '</small></div>').join('');
    const summaries = regionSummaries(report, limits.targets);
    $('apr-production-period').textContent = report.periodView.dateLabel;
    const regionRows = summaries.map(summary => '<tr><td class="apr-agent">' + escapeHtml(summary.region) + '</td><td>' + summary.agents.toLocaleString() + '</td><td>' + summary.calls.toLocaleString() + '</td><td>' + summary.customers.toLocaleString() + '</td><td>' + summary.xfer.toLocaleString() + '</td><td>' + summary.directXfer.toLocaleString() + '</td><td><strong>' + summary.leads.toLocaleString() + '</strong></td><td>' + (summary.target == null ? 'Not set' : summary.target.toLocaleString()) + '</td><td>' + (summary.attainment == null ? 'Not set' : (summary.attainment * 100).toFixed(1) + '%') + '</td></tr>');
    const combined = summaries.reduce((total, summary) => ({ agents: total.agents + summary.agents, calls: total.calls + summary.calls, customers: total.customers + summary.customers, xfer: total.xfer + summary.xfer, directXfer: total.directXfer + summary.directXfer, leads: total.leads + summary.leads }), { agents: 0, calls: 0, customers: 0, xfer: 0, directXfer: 0, leads: 0 });
    const combinedTarget = summaries.every(summary => summary.target != null) ? summaries.reduce((sum, summary) => sum + summary.target, 0) : null;
    const combinedAttainment = combinedTarget ? combined.leads / combinedTarget : null;
    regionRows.push('<tr class="apr-total-row"><td class="apr-agent">Combined</td><td>' + combined.agents.toLocaleString() + '</td><td>' + combined.calls.toLocaleString() + '</td><td>' + combined.customers.toLocaleString() + '</td><td>' + combined.xfer.toLocaleString() + '</td><td>' + combined.directXfer.toLocaleString() + '</td><td><strong>' + combined.leads.toLocaleString() + '</strong></td><td>' + (combinedTarget == null ? 'Not set' : combinedTarget.toLocaleString()) + '</td><td>' + (combinedAttainment == null ? 'Not set' : (combinedAttainment * 100).toFixed(1) + '%') + '</td></tr>');
    $('apr-location-rows').innerHTML = regionRows.join('');
    $('apr-agent-count').textContent = report.totals.agents + ' status agents | two locations' + (report.unmatchedTime ? ' | ' + report.unmatchedTime + ' time-only' : '');
    $('apr-agent-rows').innerHTML = report.agents.map(agent => {
      const avgCustomer = agent.customers > 0 && agent.customerTalk != null ? formatDuration(Math.round(agent.customerTalk / agent.customers)) : 'N/A';
      const rate = percentage(agent.leads, agent.calls);
      const check = reviewText(agent, limits, report);
      const checkClass = check === 'No data checks flagged' ? 'apr-good' : 'apr-warn';
      const bathroomDelta = agent.bathroomTime == null || bathroomAverage == null ? null : agent.bathroomTime - bathroomAverage;
      return '<tr><td class="apr-agent">' + escapeHtml(agent.name) + '</td><td>' + escapeHtml(agent.id) + '</td><td>' + escapeHtml(agent.region) + '</td><td>' + escapeHtml(agent.sourcePrefix || 'Not supplied') + '</td><td>' + (agent.callsStatus == null ? '-' : agent.callsStatus.toLocaleString()) + '</td><td>' + (agent.callsTime == null ? '-' : agent.callsTime.toLocaleString()) + '</td><td>' + agent.customers.toLocaleString() + '</td><td>' + agent.xfer.toLocaleString() + '</td><td>' + agent.directXfer.toLocaleString() + '</td><td><strong>' + agent.leads.toLocaleString() + '</strong></td><td>' + (rate * 100).toFixed(1) + '%</td><td>' + formatDuration(agent.customerTalk) + '</td><td>' + avgCustomer + '</td><td>' + formatDuration(agent.breakTime) + ' / ' + limits.breakTotal + ' min</td><td>' + formatDuration(agent.bathroomTime) + '</td><td>' + formatDifference(bathroomDelta) + ' vs avg</td><td>' + formatDuration(agent.lunchTime) + ' / ' + limits.lunch + ' min</td><td class="apr-flag ' + checkClass + '">' + escapeHtml(check) + '</td></tr>';
    }).join('');
    const fields = report.dispositionFields;
    $('apr-outcome-head').innerHTML = '<tr><th>Agent</th><th>ID</th><th>Location</th><th>Source group</th>' + fields.map(field => '<th>' + escapeHtml(field) + '</th>').join('') + '<th>Total dispositions</th></tr>';
    const totalByOutcome = Object.fromEntries(fields.map(field => [field, 0]));
    const body = report.agents.map(agent => {
      fields.forEach(field => { totalByOutcome[field] += numeric(agent.dispositions[field]); });
      const count = fields.reduce((sum, field) => sum + numeric(agent.dispositions[field]), 0);
      return '<tr><td class="apr-agent">' + escapeHtml(agent.name) + '</td><td>' + escapeHtml(agent.id) + '</td><td>' + escapeHtml(agent.region) + '</td><td>' + escapeHtml(agent.sourcePrefix || '') + '</td>' + fields.map(field => '<td>' + numeric(agent.dispositions[field]).toLocaleString() + '</td>').join('') + '<td><strong>' + count.toLocaleString() + '</strong></td></tr>';
    });
    body.push('<tr><td class="apr-agent">ALL AGENTS</td><td></td><td></td><td></td>' + fields.map(field => '<td><strong>' + totalByOutcome[field].toLocaleString() + '</strong></td>').join('') + '<td><strong>' + Object.values(totalByOutcome).reduce((sum, count) => sum + count, 0).toLocaleString() + '</strong></td></tr>');
    $('apr-outcome-rows').innerHTML = body.join('');
    drawHorizontalChart($('apr-leads-chart'), report.agents, 'leads');
    drawHorizontalChart($('apr-customer-chart'), report.agents, 'customers');
    drawHorizontalChart($('apr-bathroom-chart'), report.agents, 'bathroom');
    const unmatched = report.missingStatus + report.missingTime + report.unmatchedTime;
    let noteOne = 'Customer interactions use CIcalls. Total leads are XFER + DRXFER. Customer talk time uses CUSTOMER duration when the optional Time Details file is uploaded.';
    let noteTwo = report.timeProvided ? 'The Time Details export records combined Break time, not separate morning and afternoon entries. ' + limits.morning + ' + ' + limits.afternoon + ' minutes are allowed daily. Short or missing records are prompts to verify the source, not proof a break was missed.' : 'Time Details was not uploaded. Customer talk, combined break, lunch, and bathroom duration are unavailable until that file is included.';
    let noteThree = 'The LOGIN TIME column is an elapsed duration. These exports do not provide actual clock-in and clock-out timestamps, so they cannot verify an 11:00 AM start or 8:00 PM finish.';
    let noteFour = unmatched ? report.missingStatus + ' agent(s) are missing location Status Details, ' + report.missingTime + ' agent(s) have no matching Time Details row, and ' + report.unmatchedTime + ' Time Details row(s) have no matching agent. Review ID matching before coaching.' : 'The two location Status Details exports are combined by agent ID. Source group codes are preserved as exported.';
    if (report.timeDateMismatch) noteFour += ' The Time Details filename shows a different report date. Confirm that it belongs with these Status Details exports.';
    $('apr-report-notes').innerHTML = [
      ['How to read the numbers', noteOne],
      ['Break, bathroom and lunch checks', noteTwo + (report.timeProvided ? ' BthRm gives total bathroom duration, not the number of visits. Bathroom time is totaled per agent and compared with the group average. ' + bathroomLimitText + '. An above-average value is a review prompt, not a policy violation. Lunch allowance: ' + limits.lunch + ' minutes.' : '')],
      ['Time zone and shift', report.periodView.shiftLine + ' ' + noteThree],
      ['Data quality', noteFour + (report.timeProvided ? ' Calls from Time Details are compared with the Status Details counts.' : ' Targets are optional and are only calculated when entered. The downloadable workbook includes all uploaded disposition codes and source notes.')]
    ].map(note => '<div class="apr-note-card"><strong>' + escapeHtml(note[0]) + '</strong>' + escapeHtml(note[1]) + '</div>').join('');
    if (unmatched || report.timeDateMismatch) setStatus('Report generated with a data check to review. See the data quality note.', true);
    else if (!report.timeProvided) setStatus('Production report ready for ' + report.totals.agents + ' agents. Upload Time Details to add break and bathroom analysis.', false);
    else setStatus('Report ready for ' + report.totals.agents + ' agents. Files stay in this browser session.', false);
  }
  function drawHorizontalChart(canvas, agents, metric) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    const getValue = agent => metric === 'leads' ? agent.leads : (metric === 'customers' ? agent.customers : Math.round((agent.bathroomTime || 0) / 60));
    if (metric === 'bathroom' && !agents.some(agent => agent.bathroomTime != null)) {
      ctx.fillStyle = '#64748b'; ctx.font = '24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('No bathroom duration data provided', w / 2, h / 2);
      return;
    }
    const sorted = agents.slice().sort((a, b) => getValue(b) - getValue(a)).slice(0, 10);
    const left = 255, right = 84, top = 38, bottom = 30, rowHeight = 43;
    const barWidth = w - left - right, maxValue = Math.max(1, ...sorted.map(getValue));
    ctx.font = '18px Arial'; ctx.fillStyle = '#334155'; ctx.textBaseline = 'middle';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const x = left + barWidth * i / ticks, v = Math.round(maxValue * i / ticks);
      ctx.strokeStyle = '#e7edf4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top - 12); ctx.lineTo(x, h - bottom); ctx.stroke();
      ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; ctx.fillText(v.toLocaleString() + (metric === 'bathroom' ? 'm' : ''), x, h - 12);
    }
    sorted.forEach((agent, i) => {
      const y = top + i * rowHeight;
      ctx.textAlign = 'right'; ctx.fillStyle = '#334155'; ctx.font = '18px Arial';
      let label = agent.name.length > 23 ? agent.name.slice(0, 21) + '…' : agent.name;
      ctx.fillText(label, left - 15, y + 12);
      if (metric === 'leads') {
        const xferW = barWidth * agent.xfer / maxValue, directW = barWidth * agent.directXfer / maxValue;
        ctx.fillStyle = '#0788b4'; ctx.fillRect(left, y, xferW, 25);
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(left + xferW, y, directW, 25);
        ctx.fillStyle = '#0f172a'; ctx.textAlign = 'left'; ctx.font = 'bold 17px Arial'; ctx.fillText(String(agent.leads), left + xferW + directW + 8, y + 12);
      } else {
        const value = getValue(agent), width = barWidth * value / maxValue;
        ctx.fillStyle = metric === 'bathroom' ? '#df7449' : '#5b6ee1'; ctx.fillRect(left, y, width, 25);
        ctx.fillStyle = '#0f172a'; ctx.textAlign = 'left'; ctx.font = 'bold 17px Arial';
        ctx.fillText(value.toLocaleString() + (metric === 'bathroom' ? ' min' : ''), left + width + 8, y + 12);
      }
    });
    if (metric === 'leads') {
      ctx.font = '16px Arial'; ctx.fillStyle = '#0788b4'; ctx.fillRect(left, 12, 14, 14); ctx.fillStyle = '#475569'; ctx.textAlign = 'left'; ctx.fillText('XFER', left + 20, 19);
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(left + 106, 12, 14, 14); ctx.fillStyle = '#475569'; ctx.fillText('Direct XFER', left + 126, 19);
    }
  }
  function setStatus(message, error) {
    const el = $('apr-upload-status'); if (!el) return;
    el.textContent = message; el.classList.toggle('error', !!error);
  }
  function updateReady() {
    if (!$('apr-generate')) return;
    const ready = state.guyanaFile && state.philippinesFile;
    $('apr-generate').disabled = !ready;
    $('apr-status-guyana-name').textContent = state.guyanaFile ? state.guyanaFile.name : 'Choose Guyana Status Details CSV';
    $('apr-status-philippines-name').textContent = state.philippinesFile ? state.philippinesFile.name : 'Choose Philippines Status Details CSV';
    $('apr-time-name').textContent = state.timeFile ? state.timeFile.name : 'Choose Time Details CSV for time analysis';
    if (!ready) setStatus('Select both location Status Details CSV files to continue. Time Details is optional.', false);
    else if (!state.report) setStatus('Both location exports are ready. Generate the report when you are ready.', false);
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read ' + file.name + '.'));
      reader.readAsText(file);
    });
  }
  async function generate() {
    if (!state.guyanaFile || !state.philippinesFile) return;
    $('apr-generate').disabled = true; $('apr-content').hidden = true;
    setStatus('Reading location exports and matching the optional time file by agent ID...', false);
    try {
      const [guyanaText, philippinesText, timeText] = await Promise.all([
        readFile(state.guyanaFile), readFile(state.philippinesFile), state.timeFile ? readFile(state.timeFile) : Promise.resolve('')
      ]);
      state.report = createReport(guyanaText, philippinesText, timeText, state.guyanaFile.name, state.philippinesFile.name, state.timeFile ? state.timeFile.name : '', productionTargets());
      render();
    } catch (error) {
      state.report = null; setStatus(error && error.message ? error.message : 'Could not generate the report.', true);
    } finally { $('apr-generate').disabled = !(state.guyanaFile && state.philippinesFile); }
  }
  function clearFiles() {
    state.guyanaFile = null; state.philippinesFile = null; state.timeFile = null; state.report = null;
    $('apr-status-guyana-file').value = ''; $('apr-status-philippines-file').value = ''; $('apr-time-file').value = ''; $('apr-content').hidden = true;
    updateReady(); setStatus('Select both location Status Details CSV files to continue. Time Details is optional.', false);
  }
  function bind() {
    if (state.bound) return;
    state.bound = true;
    $('apr-status-guyana-file').addEventListener('change', event => { state.guyanaFile = event.target.files && event.target.files[0] || null; state.report = null; $('apr-content').hidden = true; updateReady(); });
    $('apr-status-philippines-file').addEventListener('change', event => { state.philippinesFile = event.target.files && event.target.files[0] || null; state.report = null; $('apr-content').hidden = true; updateReady(); });
    $('apr-time-file').addEventListener('change', event => { state.timeFile = event.target.files && event.target.files[0] || null; state.report = null; $('apr-content').hidden = true; updateReady(); });
    $('apr-generate').addEventListener('click', generate);
    $('apr-clear').addEventListener('click', clearFiles);
    ['apr-morning-allowance', 'apr-afternoon-allowance', 'apr-lunch-allowance', 'apr-bathroom-limit', 'apr-guyana-target', 'apr-philippines-target'].forEach(id => $(id).addEventListener('input', render));
    $('apr-download-excel').addEventListener('click', downloadExcel);
    $('apr-download-pdf').addEventListener('click', downloadPdf);
    state.bound = true;
  }
  function mount() {
    if (!$('apr-status-guyana-file')) return false;
    bind(); updateReady();
    return true;
  }
  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = () => test() ? resolve() : reject(new Error('The export library did not initialize.'));
      script.onerror = () => { delete scriptPromises[src]; script.remove(); reject(new Error('The export library could not load. Check that the js/vendor folder is included.')); };
      document.head.appendChild(script);
    });
    return scriptPromises[src];
  }
  function reportFilename(extension) {
    const date = state.report && state.report.period.startDate ? state.report.period.startDate : 'report';
    return 'agent_performance_report_' + date + '.' + extension;
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function durationFor(agent, field) { return agent.time ? agent.time.durations[field] : null; }
  function buildExcelRows(report, limits) {
    const headers = ['Agent', 'Agent ID', 'Location', 'Source group', 'Platform group', 'Status calls', 'Time calls', 'Call variance', 'Customer interactions (CIcalls)', 'Customer interaction rate', 'XFER', 'Direct XFER (DRXFER)', 'Total leads', 'Lead rate per call', 'Leads per 100 customer interactions', 'Customer talk time', 'Avg. customer talk per interaction', 'Connected time', 'Login duration', 'Wait', 'Talk', 'Dispo', 'Pause', 'Dead', 'Break time (combined)', 'Break allowance', 'Break variance', 'Bathroom time', 'Bathroom vs group average', 'Bathroom review limit', 'Lunch time', 'Lunch allowance', 'Lunch variance', 'Review note'];
    const rows = report.agents.map(agent => {
      const talk = durationFor(agent, 'CUSTOMER');
      const time = field => excelDuration(durationFor(agent, field));
      const breakActual = agent.breakTime, bathroomActual = agent.bathroomTime, lunchActual = agent.lunchTime;
      const avgBathroom = averageBathroomTime(report);
      const callDelta = agent.callsStatus == null || agent.callsTime == null ? null : agent.callsTime - agent.callsStatus;
      return [agent.name, agent.id, agent.region, agent.sourcePrefix || '', agent.sourceGroup || '', agent.callsStatus, agent.callsTime, callDelta, agent.customers, percentage(agent.customers, agent.calls), agent.xfer, agent.directXfer, agent.leads, percentage(agent.leads, agent.calls), agent.customers ? agent.leads / agent.customers * 100 : null, time('CUSTOMER'), agent.customers && talk != null ? excelDuration(Math.round(talk / agent.customers)) : null, time('CONNECTED'), time('LOGIN TIME'), time('WAIT'), time('TALK'), time('DISPO'), time('PAUSE'), time('DEAD'), excelDuration(breakActual), excelDuration(limits.breakTotal * 60), breakActual == null ? null : excelDuration(breakActual - limits.breakTotal * 60), excelDuration(bathroomActual), bathroomActual == null || avgBathroom == null ? null : excelDuration(bathroomActual - avgBathroom), limits.bathroomReviewLimit == null ? null : excelDuration(limits.bathroomReviewLimit * 60), excelDuration(lunchActual), excelDuration(limits.lunch * 60), lunchActual == null ? null : excelDuration(lunchActual - limits.lunch * 60), reviewText(agent, limits, report)];
    });
    return { headers, rows };
  }
  function excelStyleHeader(row) {
    row.height = 28;
    row.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17324D' } }; cell.alignment = { vertical: 'middle', wrapText: true }; cell.border = { bottom: { style: 'medium', color: { argb: 'FF25B9DC' } } }; });
  }
  async function downloadExcel() {
    if (!state.report) return;
    setStatus('Preparing the Excel workbook...', false);
    try {
      await loadScript('js/vendor/exceljs.min.js', () => !!(global.ExcelJS && global.ExcelJS.Workbook));
      const report = state.report, limits = allowances(), wb = new global.ExcelJS.Workbook();
      wb.creator = 'Biz Dashboard'; wb.subject = 'Agent performance and coaching report'; wb.created = new Date();
      const overview = wb.addWorksheet('Overview');
      overview.columns = [{ width: 30 }, { width: 22 }, { width: 86 }, ...Array.from({ length: 9 }, () => ({ width: 14 }))];
      overview.mergeCells('A1:L1'); overview.getCell('A1').value = 'AGENT PERFORMANCE & COACHING REPORT'; overview.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF10243A' } };
      overview.mergeCells('A2:L2'); overview.getCell('A2').value = report.periodView.dateLabel + ' | ' + report.periodView.shiftLine; overview.getCell('A2').font = { size: 10, color: { argb: 'FF42627D' } };
      overview.addRow([]); overview.addRow(['Report metric', 'Value', 'Interpretation']); excelStyleHeader(overview.getRow(4));
      const overviewRows = [
        ['Agents', report.totals.agents, 'Across the Guyana and Philippines Status Details exports'],
        ['Status calls', report.totals.calls, 'Primary count from the Status Details export'],
        ['Time export calls', report.totals.timeCalls, report.timeProvided ? 'Included as a cross-check against Status Details' : 'Time Details was not uploaded'],
        ['Customer interactions', report.totals.customers, 'CIcalls column from Status Details'],
        ['XFER leads', report.totals.xfer, 'XFER disposition'],
        ['Direct XFER leads', report.totals.directXfer, 'DRXFER disposition'],
        ['Total leads', report.totals.leads, 'XFER + DRXFER'],
        ['Lead rate', percentage(report.totals.leads, report.totals.calls), 'Total leads divided by Status Details calls'],
        ['Customer talk time', excelDuration(report.totals.customerTalk), report.timeProvided ? 'Sum of CUSTOMER duration values' : 'Upload Time Details to calculate'],
        ['Recorded break time', report.timeProvided ? excelDuration(report.totals.breakTime) : null, report.timeProvided ? 'Source Break field; morning and afternoon are combined' : 'Upload Time Details to calculate'],
        ['Daily break allowance', excelDuration(limits.breakTotal * 60), limits.morning + ' min morning + ' + limits.afternoon + ' min afternoon'],
        ['Recorded bathroom time', report.timeProvided ? excelDuration(report.totals.bathroomTime) : null, report.timeProvided ? 'Sum of BthRm duration values' : 'Upload Time Details to calculate'],
        ['Average bathroom time', excelDuration(averageBathroomTime(report)), report.timeProvided ? 'Average across agents with a bathroom value' : 'Not available without Time Details'],
        ['Bathroom review limit', limits.bathroomReviewLimit == null ? null : excelDuration(limits.bathroomReviewLimit * 60), limits.bathroomReviewLimit == null ? 'Not set; compare agents with group average' : 'Optional limit entered in minutes'],
        ['Recorded lunch time', report.timeProvided ? excelDuration(report.totals.lunchTime) : null, report.timeProvided ? 'Source Lunch field' : 'Upload Time Details to calculate'],
        ['Lunch allowance', excelDuration(limits.lunch * 60), limits.lunch + ' minutes']
      ];
      overviewRows.forEach((row, index) => {
        overview.addRow(row);
        const valueCell = overview.getCell(index + 5, 2);
        if (row[0] === 'Lead rate') valueCell.numFmt = '0.0%';
        else if (/time|allowance|limit/i.test(row[0])) valueCell.numFmt = '[h]:mm:ss';
      });
      overview.getColumn(1).width = 30; overview.getColumn(2).width = 22; overview.getColumn(3).width = 86;
      overview.addRow([]); overview.addRow(['Location production pulse']); overview.getRow(overview.rowCount).font = { bold: true, color: { argb: 'FF0F6993' } };
      const pulseHeader = ['Location', 'Agents in export', 'Calls', 'Customer interactions', 'XFER', 'Direct XFER', 'Total leads', 'Lead target', 'Target attainment'];
      overview.addRow(pulseHeader); excelStyleHeader(overview.getRow(overview.rowCount));
      const pulse = regionSummaries(report, limits.targets);
      pulse.forEach(summary => overview.addRow([summary.region, summary.agents, summary.calls, summary.customers, summary.xfer, summary.directXfer, summary.leads, summary.target, summary.attainment]));
      const combinedPulse = pulse.reduce((sum, summary) => ({ agents: sum.agents + summary.agents, calls: sum.calls + summary.calls, customers: sum.customers + summary.customers, xfer: sum.xfer + summary.xfer, directXfer: sum.directXfer + summary.directXfer, leads: sum.leads + summary.leads }), { agents: 0, calls: 0, customers: 0, xfer: 0, directXfer: 0, leads: 0 });
      const combinedTarget = pulse.every(summary => summary.target != null) ? pulse.reduce((sum, summary) => sum + summary.target, 0) : null;
      overview.addRow(['Combined', combinedPulse.agents, combinedPulse.calls, combinedPulse.customers, combinedPulse.xfer, combinedPulse.directXfer, combinedPulse.leads, combinedTarget, combinedTarget ? combinedPulse.leads / combinedTarget : null]);
      overview.getRow(overview.rowCount).font = { bold: true, color: { argb: 'FF10243A' } };
      overview.getColumn(9).numFmt = '0.0%';

      const leadImage = wb.addImage({ base64: $('apr-leads-chart').toDataURL('image/png'), extension: 'png' });
      const customerImage = wb.addImage({ base64: $('apr-customer-chart').toDataURL('image/png'), extension: 'png' });
      const bathroomImage = wb.addImage({ base64: $('apr-bathroom-chart').toDataURL('image/png'), extension: 'png' });
      overview.addImage(leadImage, { tl: { col: 0, row: 34 }, ext: { width: 620, height: 270 } });
      overview.addImage(customerImage, { tl: { col: 4.3, row: 34 }, ext: { width: 620, height: 270 } });
      overview.addImage(bathroomImage, { tl: { col: 0, row: 54 }, ext: { width: 620, height: 270 } });
      overview.addRow([]); overview.addRow(['Time zone and source details']); overview.getRow(overview.rowCount).font = { bold: true, color: { argb: 'FF0F6993' } };
      overview.addRow([report.periodView.windowLine]); overview.addRow([report.periodView.shiftLine]);
      overview.addRow(['The LOGIN TIME field is an elapsed duration; it is not an actual clock-in time. No clock-in or clock-out timestamps are present in these CSV files.']);
      overview.addRow(['Source files', report.fileNames.guyana + ' | ' + report.fileNames.philippines + ' | ' + report.fileNames.time]);

      const detailData = buildExcelRows(report, limits), detail = wb.addWorksheet('Agent Performance');
      detail.addRow(detailData.headers); excelStyleHeader(detail.getRow(1));
      detailData.rows.forEach(row => detail.addRow(row));
      detail.views = [{ state: 'frozen', ySplit: 1 }]; detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: detailData.headers.length } };
      detail.columns = detailData.headers.map((header, index) => ({ header, key: 'c' + index, width: index === 0 ? 26 : (index === detailData.headers.length - 1 ? 46 : header.length > 24 ? 22 : 15) }));
      detailData.rows.forEach((_, r) => {
        const row = detail.getRow(r + 2);
        row.eachCell(cell => { cell.alignment = { vertical: 'top', wrapText: cell.col === detailData.headers.length }; });
        row.height = 31;
        [10, 14].forEach(col => { row.getCell(col).numFmt = '0.0%'; });
        [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33].forEach(col => { row.getCell(col).numFmt = '[h]:mm:ss'; });
        if (row.getCell(34).value !== 'No data checks flagged') row.getCell(34).font = { color: { argb: 'FF9A6700' } };
      });

      const outcomes = wb.addWorksheet('Call Outcomes');
      const outcomeHeaders = ['Agent', 'Agent ID', 'Location', 'Source group', ...report.dispositionFields, 'Total dispositions'];
      outcomes.addRow(outcomeHeaders); excelStyleHeader(outcomes.getRow(1));
      const outcomeTotals = Object.fromEntries(report.dispositionFields.map(field => [field, 0]));
      report.agents.forEach(agent => {
        const row = [agent.name, agent.id, agent.region, agent.sourcePrefix || ''];
        report.dispositionFields.forEach(field => { const count = numeric(agent.dispositions[field]); row.push(count); outcomeTotals[field] += count; });
        row.push(report.dispositionFields.reduce((sum, field) => sum + numeric(agent.dispositions[field]), 0)); outcomes.addRow(row);
      });
      outcomes.addRow(['ALL AGENTS', '', '', '', ...report.dispositionFields.map(field => outcomeTotals[field]), Object.values(outcomeTotals).reduce((sum, n) => sum + n, 0)]);
      outcomes.views = [{ state: 'frozen', ySplit: 1 }]; outcomes.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: outcomeHeaders.length } };
      outcomes.columns = outcomeHeaders.map((header, index) => ({ header, width: index === 0 ? 26 : index < 4 ? 18 : Math.max(12, header.length + 2) }));

      const totalsSheet = wb.addWorksheet('Outcome Totals');
      totalsSheet.addRow(['Call outcome code', 'Agent total', 'Share of status calls']); excelStyleHeader(totalsSheet.getRow(1));
      report.dispositionFields.map(field => [field, outcomeTotals[field] || 0, percentage(outcomeTotals[field] || 0, report.totals.calls)]).sort((a, b) => b[1] - a[1]).forEach(row => totalsSheet.addRow(row));
      totalsSheet.columns = [{ width: 28 }, { width: 18 }, { width: 24 }]; totalsSheet.getColumn(3).numFmt = '0.0%';

      const notes = wb.addWorksheet('Report Notes');
      notes.addRows([
        ['Topic', 'Explanation'],
        ['Report period', report.periodView.dateLabel],
        ['Pacific source period', report.periodView.windowLine],
        ['Eastern shift', report.periodView.shiftLine],
        ['Calls', 'Status calls from both location exports are the main count for outcome calculations. Time calls are included as a cross-check when the optional Time Details file is uploaded.'],
        ['Customer interactions', 'CIcalls is presented as the source customer-interaction count; the report preserves the source label so it is not confused with the CUSTOMER time duration.'],
        ['Total leads', 'XFER + DRXFER. Both values are shown separately in Agent Performance and Call Outcomes.'],
        ['Customer talk time', 'The CUSTOMER field is elapsed time and is not converted between time zones.'],
        ['Breaks', 'The source Break column is combined. It does not show separate morning and afternoon entries. The report compares combined duration with the configured morning plus afternoon allowances. The current defaults are 10 minutes each, 20 minutes total.'],
        ['Break checks', 'Missing or below-allowance recorded time is a prompt to verify source capture. It is not proof a break was missed.'],
        ['Bathroom time', report.timeProvided ? 'BthRm is the total bathroom duration per agent, not a count of visits. It is compared with the group average. Above-average time is a review prompt, not a policy violation. An optional bathroom review limit can be entered if a company standard exists.' : 'Time Details was not uploaded, so bathroom duration is not available in this report.'],
        ['Lunch', 'Lunch time is compared against the configured lunch allowance. Bathroom time remains separate and is not added to break time.'],
        ['Time Details availability', report.timeProvided ? 'Time Details was uploaded and matched by numeric agent ID. Missing matches are listed in the Agent Performance review notes.' : 'Time Details was not uploaded. Customer talk, break, bathroom, lunch, and time-call values are unavailable.'],
        ['LOGIN TIME', 'This is an elapsed duration. The uploaded exports do not contain actual clock-in or clock-out timestamps, so start and finish punctuality cannot be calculated.'],
        ['Disposition labels', 'All disposition codes from both Status Details exports are preserved exactly as provided; the source files do not provide expanded definitions for every code.'],
        ['Data matching', 'Agents are assigned to Guyana or Philippines according to the Status Details file they came from. Optional Time Details rows are matched by numeric agent ID.'],
        ['Date matching', report.timeDateMismatch ? 'The Time Details filename shows a different date from the Status Details files. Confirm the period before using time metrics.' : 'The two location Status Details exports are checked for matching report dates.'],
        ['Targets', 'Targets are optional and entered by the report user. Target attainment is only calculated when a positive location target is provided.'],
        ['Files', report.fileNames.guyana + ' | ' + report.fileNames.philippines + ' | ' + report.fileNames.time]
      ]);
      excelStyleHeader(notes.getRow(1)); notes.columns = [{ width: 28 }, { width: 120 }];
      notes.eachRow((row, index) => { if (index > 1) row.alignment = { vertical: 'top', wrapText: true }; });
      const buffer = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFilename('xlsx'));
      setStatus('Excel report downloaded.', false);
    } catch (error) { console.error('[AgentReport] Excel export failed:', error); setStatus('Excel download failed: ' + (error.message || 'Export error.'), true); }
  }
  function pdfReviewNote(agent, limits, report) {
    const note = reviewText(agent, limits, report);
    return note === 'No data checks flagged' ? 'No data checks flagged' : note.replace(/ • /g, '; ');
  }
  async function downloadPdf() {
    if (!state.report) return;
    setStatus('Preparing the PDF report...', false);
    try {
      await loadScript('js/vendor/jspdf.umd.min.js', () => !!(global.jspdf && global.jspdf.jsPDF));
      await loadScript('js/vendor/jspdf.plugin.autotable.min.js', () => !!(global.jspdf && global.jspdf.jsPDF && global.jspdf.jsPDF.API && global.jspdf.jsPDF.API.autoTable));
      const report = state.report, limits = allowances();
      const doc = new global.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
      doc.setFillColor(12, 29, 48); doc.rect(0, 0, pageW, 43, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('Agent Performance & Coaching Report', 14, 15);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(194, 218, 238);
      doc.text(report.periodView.dateLabel + ' | ' + report.totals.agents + ' status agents | Eastern shift: 11:00 AM to 8:00 PM', 14, 23);
      doc.setFontSize(7.5); doc.text(pdfSafe(report.periodView.windowLine), 14, 31, { maxWidth: pageW - 28 });
      doc.text(pdfSafe(report.periodView.shiftLine), 14, 37, { maxWidth: pageW - 28 });
      const cards = [
        ['CALLS', report.totals.calls.toLocaleString()], ['CUSTOMERS', report.totals.customers.toLocaleString()],
        ['TOTAL LEADS', report.totals.leads.toLocaleString()], ['LEAD RATE', (percentage(report.totals.leads, report.totals.calls) * 100).toFixed(1) + '%'],
        ['CUSTOMER TALK', report.timeProvided ? formatDuration(report.totals.customerTalk) : 'Not uploaded'], ['BATHROOM TIME', report.timeProvided ? formatDuration(report.totals.bathroomTime) : 'Not uploaded'], ['AGENTS', String(report.totals.agents)]
      ];
      const cardGap = 3, cardY = 49, cardW = (pageW - 28 - cardGap * (cards.length - 1)) / cards.length;
      cards.forEach((card, i) => {
        const x = 14 + i * (cardW + cardGap);
        doc.setFillColor(239, 246, 252); doc.roundedRect(x, cardY, cardW, 23, 2, 2, 'F');
        doc.setTextColor(71, 96, 121); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.7); doc.text(card[0], x + 3, cardY + 7);
        doc.setTextColor(12, 53, 83); doc.setFontSize(10.5); doc.text(card[1], x + 3, cardY + 17);
      });
      const leadImage = $('apr-leads-chart').toDataURL('image/png'), customerImage = $('apr-customer-chart').toDataURL('image/png'), bathroomImage = $('apr-bathroom-chart').toDataURL('image/png');
      doc.addImage(leadImage, 'PNG', 14, 77, 129, 56); doc.addImage(customerImage, 'PNG', 148, 77, 135, 56);
      const outcomeTotal = {};
      report.dispositionFields.forEach(field => { outcomeTotal[field] = report.agents.reduce((sum, agent) => sum + numeric(agent.dispositions[field]), 0); });
      const outcomesTop = Object.entries(outcomeTotal).map(([code, count]) => [code, count, (percentage(count, report.totals.calls) * 100).toFixed(1) + '%']).sort((a, b) => b[1] - a[1]);
      doc.autoTable({ startY: 139, head: [['Call outcome code', 'Count', 'Share of calls']], body: outcomesTop.slice(0, 10), theme: 'grid', margin: { left: 14, right: 14 }, tableWidth: 111, styles: { fontSize: 6.4, cellPadding: 1.25 }, headStyles: { fillColor: [23, 50, 77] }, columnStyles: { 0: { cellWidth: 49 }, 1: { cellWidth: 28, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' } } });
      const noteX = 138, noteY = 143;
      doc.setTextColor(34, 55, 75); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Coaching and data checks', noteX, noteY);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      const reviewCount = report.agents.filter(agent => reviewText(agent, limits, report) !== 'No data checks flagged').length;
      const noteLines = [
        'Location totals come from the two uploaded Status Details files. Source outcome labels are kept as exported.',
        'Customer interactions use CIcalls. Customer talk time uses CUSTOMER duration.',
        'Total leads = XFER + DRXFER. Targets are optional and entered by the report user.',
        report.timeProvided ? 'Time calls are included as a cross-check. Break field is combined, so separate 10-minute breaks cannot be verified.' : 'Time Details was not uploaded. Talk, break, lunch, and bathroom duration are not included.',
        report.timeProvided ? (limits.bathroomReviewLimit == null ? 'BthRm is total bathroom duration, not visit count. Above-average time is a review prompt; no policy limit is set.' : 'BthRm is total bathroom duration, not visit count. Review limit is ' + limits.bathroomReviewLimit + ' minutes; above-average time is also shown for context.') : 'Upload Time Details to compare bathroom totals with the group average.',
        report.timeProvided ? 'Short or missing break/lunch records need verification and do not prove a missed break.' : 'Two 10-minute breaks (20 total) and 45 minutes lunch are set as the comparison allowances.',
        'LOGIN TIME is an elapsed duration. No clock-in/out stamps are available to assess shift punctuality.',
        reviewCount + ' agent record(s) have a call, break, lunch, or source data check to review.'
      ];
      if (report.timeDateMismatch) noteLines.splice(noteLines.length - 1, 0, 'Time Details filename date differs from the Status Details report date. Confirm it before using time metrics.');
      let y = noteY + 7;
      noteLines.forEach(line => { const lines = doc.splitTextToSize(pdfSafe(line), pageW - noteX - 14); doc.text(lines, noteX, y); y += lines.length * 3.2 + 1.5; });

      doc.addPage();
      doc.setTextColor(15, 43, 68); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Production Pulse by Location', 14, 15);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 101, 121);
      doc.text(report.periodView.dateLabel + ' | Agents, calls, customer interactions, and leads from the two Status Details exports.', 14, 22);
      doc.text('Targets are optional. Attainment is calculated only when a positive target is entered for each location.', 14, 28);
      const pulse = regionSummaries(report, limits.targets);
      const pulseBody = pulse.map(summary => [summary.region, summary.agents, summary.calls, summary.customers, summary.xfer, summary.directXfer, summary.leads, summary.target == null ? 'Not set' : summary.target, summary.attainment == null ? 'Not set' : (summary.attainment * 100).toFixed(1) + '%']);
      const combinedPulse = pulse.reduce((sum, summary) => ({ agents: sum.agents + summary.agents, calls: sum.calls + summary.calls, customers: sum.customers + summary.customers, xfer: sum.xfer + summary.xfer, directXfer: sum.directXfer + summary.directXfer, leads: sum.leads + summary.leads }), { agents: 0, calls: 0, customers: 0, xfer: 0, directXfer: 0, leads: 0 });
      const combinedTarget = pulse.every(summary => summary.target != null) ? pulse.reduce((sum, summary) => sum + summary.target, 0) : null;
      pulseBody.push(['Combined', combinedPulse.agents, combinedPulse.calls, combinedPulse.customers, combinedPulse.xfer, combinedPulse.directXfer, combinedPulse.leads, combinedTarget == null ? 'Not set' : combinedTarget, combinedTarget ? (combinedPulse.leads / combinedTarget * 100).toFixed(1) + '%' : 'Not set']);
      doc.autoTable({ startY: 36, head: [['Location', 'Agents', 'Calls', 'Customer interactions', 'XFER', 'Direct XFER', 'Total leads', 'Target', 'Attainment']], body: pulseBody, theme: 'grid', margin: { left: 14, right: 14 }, styles: { fontSize: 8, cellPadding: 2.5 }, headStyles: { fillColor: [23, 50, 77] }, columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 20 }, 2: { cellWidth: 28 }, 3: { cellWidth: 40 }, 4: { cellWidth: 22 }, 5: { cellWidth: 27 }, 6: { cellWidth: 28 }, 7: { cellWidth: 30 }, 8: { cellWidth: 32 } } });

      doc.addPage();
      doc.setTextColor(15, 43, 68); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Bathroom Time Review', 14, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 101, 121);
      doc.text(report.timeProvided ? 'BthRm records total bathroom duration, not visit count. Above-average time is a review prompt, not a policy finding.' : 'Time Details was not uploaded. Add it to calculate bathroom duration and compare agents.', 14, 21);
      doc.addImage(bathroomImage, 'PNG', 14, 27, 269, 116);
      const bathroomAvg = averageBathroomTime(report);
      const bathroomTop = report.agents.slice().sort((a, b) => (b.bathroomTime || 0) - (a.bathroomTime || 0)).slice(0, 10).map(agent => [agent.name, agent.id, formatDuration(agent.bathroomTime), formatDuration(bathroomAvg), formatDifference(agent.bathroomTime == null || bathroomAvg == null ? null : agent.bathroomTime - bathroomAvg), limits.bathroomReviewLimit == null ? 'Not set' : limits.bathroomReviewLimit + ' min']);
      doc.autoTable({ startY: 148, head: [['Agent', 'ID', 'Bathroom time', 'Group average', 'Difference', 'Review limit']], body: bathroomTop, theme: 'grid', margin: { left: 14, right: 14 }, styles: { fontSize: 7.2, cellPadding: 1.5 }, headStyles: { fillColor: [23, 50, 77] }, columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 20 }, 2: { cellWidth: 38 }, 3: { cellWidth: 38 }, 4: { cellWidth: 38 }, 5: { cellWidth: 38 } } });

      doc.addPage();
      doc.setTextColor(15, 43, 68); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Agent Performance Detail', 14, 13);
      const agentHead = [['Agent', 'ID', 'Location', 'Group', 'Status calls', 'Time calls', 'CIcalls', 'XFER', 'Direct', 'Leads', 'Lead %', 'Customer talk', 'Avg / contact', 'Break / limit', 'Bathroom time', 'vs group avg', 'Lunch / limit', 'Review note']];
      const agentBody = report.agents.map(agent => {
        const avg = agent.customerTalk != null && agent.customers ? formatDuration(Math.round(agent.customerTalk / agent.customers)) : 'N/A';
        const bathroomAvg = averageBathroomTime(report);
        const bathroomDelta = agent.bathroomTime == null || bathroomAvg == null ? null : agent.bathroomTime - bathroomAvg;
        return [agent.name, agent.id, agent.region, agent.sourcePrefix || '-', agent.callsStatus == null ? '-' : agent.callsStatus, agent.callsTime == null ? '-' : agent.callsTime, agent.customers, agent.xfer, agent.directXfer, agent.leads, (percentage(agent.leads, agent.calls) * 100).toFixed(1) + '%', formatDuration(agent.customerTalk), avg, formatDuration(agent.breakTime) + ' / ' + limits.breakTotal + 'm', formatDuration(agent.bathroomTime), formatDifference(bathroomDelta), formatDuration(agent.lunchTime) + ' / ' + limits.lunch + 'm', pdfSafe(pdfReviewNote(agent, limits, report))];
      });
      doc.autoTable({ startY: 18, head: agentHead, body: agentBody, theme: 'grid', margin: { left: 8, right: 8, bottom: 13 }, styles: { fontSize: 5.8, cellPadding: 1, overflow: 'linebreak', valign: 'middle' }, headStyles: { fillColor: [23, 50, 77], fontSize: 5.6 }, columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 9 }, 2: { cellWidth: 15 }, 3: { cellWidth: 9 }, 4: { cellWidth: 12 }, 5: { cellWidth: 12 }, 6: { cellWidth: 11 }, 7: { cellWidth: 8 }, 8: { cellWidth: 8 }, 9: { cellWidth: 9 }, 10: { cellWidth: 9 }, 11: { cellWidth: 15 }, 12: { cellWidth: 14 }, 13: { cellWidth: 18 }, 14: { cellWidth: 15 }, 15: { cellWidth: 18 }, 16: { cellWidth: 18 }, 17: { cellWidth: 'auto' } } });

      doc.addPage();
      doc.setTextColor(15, 43, 68); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Call Outcomes by Agent', 14, 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80, 101, 121); doc.text('Every non-zero source disposition is listed. Expanded outcome definitions are not supplied in the CSV.', 14, 19);
      const outcomeBody = report.agents.map(agent => {
        const summary = report.dispositionFields.map(field => [field, numeric(agent.dispositions[field])]).filter(item => item[1] > 0).map(item => item[0] + ': ' + item[1]).join(' | ') || 'No dispositions recorded';
        return [agent.name, agent.id, agent.region, agent.sourcePrefix || '-', summary];
      });
      doc.autoTable({ startY: 24, head: [['Agent', 'ID', 'Location', 'Group', 'Call outcome breakdown']], body: outcomeBody, theme: 'grid', margin: { left: 14, right: 14, bottom: 13 }, styles: { fontSize: 6.6, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' }, headStyles: { fillColor: [23, 50, 77] }, columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 18 }, 2: { cellWidth: 26 }, 3: { cellWidth: 20 }, 4: { cellWidth: 'auto' } } });
      const pages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        doc.text('Internal coaching report | Data from uploaded CSV exports', 14, pageH - 5);
        doc.text('Page ' + p + ' of ' + pages, pageW - 14, pageH - 5, { align: 'right' });
      }
      doc.save(reportFilename('pdf'));
      setStatus('PDF report downloaded.', false);
    } catch (error) { console.error('[AgentReport] PDF export failed:', error); setStatus('PDF download failed: ' + (error.message || 'Export error.'), true); }
  }
  function pdfSafe(text) { return String(text == null ? '' : text).replace(/[–—]/g, '-').replace(/•/g, '|').replace(/÷/g, '/').replace(/’/g, "'"); }

  global.AgentPerformanceReport = { mount, parseDuration, formatDuration };
})(window);
