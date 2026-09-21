/* Shared break calculations. All schedules use Guyana time (UTC-4, no DST). */
(function (root) {
  'use strict';
  const slots = ['morning', 'afternoon'];
  function day(now) { return new Date(now - 4 * 3600000).toISOString().slice(0, 10); }
  function scheduledAt(date, time) { return Date.parse(date + 'T' + time + ':00-04:00'); }
  function validSchedule(s, slot) {
    return s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) && Number.isInteger(s.minutes) &&
      s.minutes >= 1 && s.minutes <= 120 && (slot === 'morning' ? s.time < '12:00' : s.time >= '12:00');
  }
  function dueAt(record) { return Number(record.startedAt) + record.minutes * 60000; }
  function available(state, schedule, slot, now) {
    return slots.includes(slot) && validSchedule(schedule, slot) && !state?.active &&
      !state?.days?.[day(now)]?.[slot] && now >= scheduledAt(day(now), schedule.time);
  }
  function begin(state, schedule, slot, now, identity, timestamp) {
    if (!available(state, schedule, slot, now)) return;
    const date = day(now);
    const record = { id: date + '_' + slot, date, slot, userId: identity.userId,
      name: identity.name, team: identity.team || '', scheduledTime: schedule.time,
      minutes: schedule.minutes, startedAt: timestamp };
    const days = { ...(state?.days || {}) };
    // Keep 31 days of completed monitoring history. Never discard an active break.
    for (const key of Object.keys(days)) if (key < day(now - 30 * 86400000)) delete days[key];
    days[date] = { ...(days[date] || {}), [slot]: record };
    return { ...(state || {}), active: record, days };
  }
  function finish(state, id, timestamp) {
    const record = state?.active;
    if (!record || record.id !== id) return;
    return { ...state, active: null, days: { ...(state.days || {}), [record.date]: {
      ...(state.days?.[record.date] || {}), [record.slot]: { ...record, returnedAt: timestamp }
    } } };
  }
  function duration(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  const api = { slots, day, scheduledAt, validSchedule, dueAt, available, begin, finish, duration };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BreakCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
