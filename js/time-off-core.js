(function (g) {
  'use strict';
  const TYPES = { dayoff: 'Day off', late: 'Late arrival', early: 'Early departure', appointment: 'Appointment', other: 'Other request' };
  const STATUSES = { Requested: 'Pending approval', Approved: 'Approved', Declined: 'Declined', Cancelled: 'Cancelled' };
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  const safeKey = s => !!s && !/[.#$\[\]\/\u0000-\u001f\u007f]/.test(String(s));
  const team = t => ({ BERBICE: 'BB', BERB: 'BB', GYB: 'BB', PROVIDENCE: 'PR', PROV: 'PR', GYP: 'PR', REMOTE: 'RM' })[String(t || '').trim().toUpperCase()] || String(t || '').trim().toUpperCase();
  const today = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guyana', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  function validate(input, now) {
    const r = { type: String(input.type || ''), date: String(input.date || ''), endDate: String(input.endDate || ''), allDay: input.allDay === true, time: String(input.time || ''), endTime: String(input.endTime || ''), notes: String(input.notes || '').trim() };
    if (!Object.hasOwn(TYPES, r.type)) throw Error('Choose a request type.');
    if (!validDate(r.date) || !validDate(r.endDate) || r.endDate < r.date) throw Error('Select a valid start and end date.');
    if (r.date < today(now)) throw Error('The start date cannot be in the past.');
    if (Date.parse(r.endDate) - Date.parse(r.date) > 366 * 86400000) throw Error('Choose a date range of one year or less.');
    if (!r.notes || r.notes.length > 2000) throw Error('Write a reason, up to 2,000 characters.');
    if (r.allDay && ['late', 'early'].includes(r.type)) throw Error('Select the hours for a late arrival or early departure.');
    if (r.allDay) { r.time = ''; r.endTime = ''; }
    else {
      if (![r.time, r.endTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw Error('Select both the start and end time.');
      if (r.date + r.time >= r.endDate + r.endTime) throw Error('The end must be after the start.');
      if (Date.parse(r.date + 'T' + r.time + ':00-04:00') < now) throw Error('The start time cannot be in the past.');
    }
    return r;
  }
  function interval(r) { return [r.date + 'T' + (r.allDay ? '00:00' : r.time || '00:00'), r.endDate + 'T' + (r.allDay ? '23:59:59' : r.endTime || '23:59:59')]; }
  function overlaps(a, b) { const x = interval(a), y = interval(b); return x[0] < y[1] && y[0] < x[1]; }
  function create(input, profile, now) {
    const r = validate(input, now), agentId = String(profile.userId || profile.ytelId || '').trim(), name = String(profile.fullName || profile.name || '').trim(), t = team(profile.team);
    if (!safeKey(agentId) || !name || !['BB', 'PR', 'RM'].includes(t)) throw Error('Your agent name or team could not be verified. Ask an admin to update your profile.');
    return { ...r, agentId, name, team: t, title: name + ' · ' + TYPES[r.type], status: 'Requested', revision: 1, createdAt: now, updatedAt: now, createdBy: agentId, updatedBy: agentId, source: 'agent_request', reminder: 1440 };
  }
  function transition(current, expectedRevision, status, actor, note, now) {
    if (!current || current.revision !== expectedRevision || current.status !== 'Requested') return;
    if (actor.role === 'agent') {
      if (current.agentId !== actor.id || status !== 'Cancelled') return;
    } else if (actor.role !== 'admin' || !actor.id || !['Approved', 'Declined'].includes(status)) return;
    note = String(note || '').trim();
    if (note.length > 2000) throw Error('The admin reply must be 2,000 characters or fewer.');
    if (status === 'Declined' && !note) throw Error('Write a short reply so the agent knows why the request was declined.');
    const next = { ...current, status, revision: current.revision + 1, updatedAt: now, updatedBy: actor.id };
    if (actor.role === 'admin') Object.assign(next, { reviewedAt: now, reviewedBy: actor.id, reviewerName: actor.name || actor.id, reviewNote: note });
    return next;
  }
  function flatten(tree) {
    return Object.entries(tree || {}).flatMap(([agentId, requests]) => Object.entries(requests || {}).filter(([, r]) => r && r.agentId === agentId && Object.hasOwn(STATUSES, r.status) && validDate(r.date) && validDate(r.endDate)).map(([requestId, r]) => ({ ...r, agentId, requestId, id: 'request:' + agentId + ':' + requestId, source: 'agent_request' })));
  }
  const api = { TYPES, STATUSES, validDate, safeKey, team, today, validate, create, transition, overlaps, flatten };
  g.TimeOffCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
