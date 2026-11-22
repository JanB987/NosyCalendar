import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertDates, type DateInput, type EventDates } from '../src/dates';
import { planDisplayedMove, planDisplayedResize, projectDates } from '../src/rolling';
import { persistMove, prepareMove, prepareResize, type MoveSnapshot } from '../src/writeback';

const today = () => new Date(2026, 10, 23, 12);
function dates(start: DateInput, end?: DateInput): EventDates {
  const result = convertDates(start, end); assert.ok(result.dates, result.reason); return result.dates;
}
function source(start: string | number, end?: string | number | null, endMapped = true): MoveSnapshot {
  const access = prepareResize('a.md', { start: 'note.when', end: endMapped ? 'note.until' : null },
    { when: start, ...(end !== undefined ? { until: end } : {}) }, start, end);
  if (access.snapshot) return access.snapshot;
  const move = prepareMove('a.md', { start: 'note.when', end: null }, { when: start }, start, null);
  assert.ok(move.snapshot, move.reason); return move.snapshot;
}
const rendered = (value: string | Date) => typeof value === 'string' ? new Date(value + 'T00:00') : new Date(+value);

test('rolling defaults off and never changes original inputs or source dates', () => {
  const original = dates('2025-11-20', '2025-11-22');
  const before = structuredClone(original);
  assert.deepEqual(projectDates('2025-11-20', '2025-11-22', original, false, today()).dates, original);
  const projected = projectDates('2025-11-20', '2025-11-22', original, true, today());
  assert.equal(projected.rolled, true);
  assert.deepEqual(original, before);
  assert.equal(projected.originalText, '2025-11-20 → 2025-11-22');
});
test('all-day ranges roll only after their inclusive last day and preserve calendar-day span', () => {
  assert.equal(projectDates('2026-11-21', '2026-11-23', dates('2026-11-21', '2026-11-23'), true, today()).rolled, false);
  const p = projectDates('2026-11-20', '2026-11-22', dates('2026-11-20', '2026-11-22'), true, today());
  assert.deepEqual(p.dates, { allDay: true, start: '2026-11-23', end: '2026-11-26' });
  assert.equal(projectDates('2026-11-23', null, dates('2026-11-23'), true, today()).rolled, false);
});
test('explicit timed ranges use local midnight and an end exactly at midnight is past', () => {
  for (const now of [new Date(2026, 10, 23, 0, 1), new Date(2026, 10, 23, 23, 59)]) {
    assert.equal(projectDates('2026-11-22T23:00', '2026-11-23T00:00', dates('2026-11-22T23:00', '2026-11-23T00:00'), true, now).rolled, true);
    assert.equal(projectDates('2026-11-22T23:00', '2026-11-23T00:01', dates('2026-11-22T23:00', '2026-11-23T00:01'), true, now).rolled, false);
    assert.equal(projectDates('2026-11-23T08:00', '2026-11-23T09:00', dates('2026-11-23T08:00', '2026-11-23T09:00'), true, now).rolled, false);
  }
});
test('start-only timestamps are due by calendar day even when their fallback crosses midnight', () => {
  const p = projectDates('2026-11-22T23:45', null, dates('2026-11-22T23:45'), true, today());
  assert.equal(p.rolled, true);
  assert.equal((p.dates.start as Date).getDate(), 23); assert.equal((p.dates.start as Date).getHours(), 23);
  assert.equal(+p.dates.end - +p.dates.start, 30 * 60_000);
  assert.equal(projectDates('2026-11-23T01:00', null, dates('2026-11-23T01:00'), true, today()).rolled, false);
});
test('explicit offsets use the device-local calendar day for overdue eligibility', () => {
  const instant = '2026-11-23T00:30Z';
  const original = dates(instant), start = original.start as Date;
  const expected = start.getFullYear() < 2026 || start.getMonth() < 10 || start.getDate() < 23;
  assert.equal(projectDates(instant, null, original, true, today()).rolled, expected);
  const end = '2026-11-23T04:00Z', range = dates('2026-11-22T09:00Z', end);
  const boundary = today(); boundary.setHours(0, 0, 0, 0);
  assert.equal(projectDates('2026-11-22T09:00Z', end, range, true, today()).rolled, +(range.end as Date) <= +boundary);
});
test('year/month/week periods wait until fully past and retain their complete original span', () => {
  for (const [start, during, after, days] of [
    [2024, new Date(2024, 11, 31), new Date(2025, 0, 1), 366],
    ['2024-02', new Date(2024, 1, 29), new Date(2024, 2, 1), 29],
    ['2026W48', new Date(2026, 10, 29), new Date(2026, 10, 30), 7]
  ] as const) {
    assert.equal(projectDates(start, null, dates(start), true, during).rolled, false);
    const p = projectDates(start, null, dates(start), true, after);
    assert.equal(p.rolled, true);
    const startUtc = new Date(p.dates.start + 'T00:00Z'), endUtc = new Date(p.dates.end + 'T00:00Z');
    assert.equal((+endUtc - +startUtc) / 86_400_000, days);
  }
});
test('timed projection preserves elapsed duration and local wall time across DST dates', () => {
  const original = dates('2026-03-29T01:30+01:00', '2026-03-29T04:30+02:00');
  const p = projectDates('2026-03-29T01:30+01:00', '2026-03-29T04:30+02:00', original, true, new Date(2026, 9, 25, 12));
  assert.equal(+p.dates.end - +p.dates.start, +original.end - +original.start);
  assert.equal((p.dates.start as Date).getHours(), (original.start as Date).getHours());
});
test('spring gaps normalize forward and fall folds select the earlier local instance', () => {
  if (process.env.TZ === 'UTC') return;
  const berlin = process.env.TZ === 'Europe/Berlin';
  const gapDay = berlin ? new Date(2026, 2, 29, 12) : new Date(2026, 2, 8, 12);
  const p = projectDates('2026-01-01T02:30', null, dates('2026-01-01T02:30'), true, gapDay);
  assert.equal((p.dates.start as Date).getHours(), 3); assert.equal((p.dates.start as Date).getMinutes(), 30);
  const foldStart = berlin ? '2026-01-01T02:30' : '2026-01-01T01:30';
  const foldDay = berlin ? new Date(2026, 9, 25, 12) : new Date(2026, 10, 1, 12);
  const fold = projectDates(foldStart, null, dates(foldStart), true, foldDay);
  assert.equal((fold.dates.start as Date).toISOString(), berlin ? '2026-10-25T00:30:00.000Z' : '2026-11-01T05:30:00.000Z');
  const s = source('2026-01-01T02:30');
  assert.equal(planDisplayedMove(s, p, { start: rendered(p.dates.start), allDay: false }), null);
  assert.equal(planDisplayedResize(s, p, 'end', { start: rendered(p.dates.start), end: rendered(p.dates.end), allDay: false }), null);
});
test('rolled body moves serialize the requested displayed range, not historical endpoints', () => {
  const s = source('2025-11-20T09:00:34.125600+0100', '2025-11-20T10:00:45.250700+01:00');
  const p = projectDates(s.startInput, s.endInput, s.dates, true, today());
  const target = new Date(2026, 10, 24, 11);
  const plan = planDisplayedMove(s, p, { start: target, allDay: false }); assert.ok(plan);
  assert.equal((plan.dates.start as Date).getFullYear(), 2026);
  assert.equal((plan.dates.start as Date).getDate(), 24);
  assert.ok(plan.start.endsWith(':34.125600+0100'));
  assert.ok(plan.end?.endsWith(':45.250700+01:00'));
  assert.equal(+plan.dates.end - +plan.dates.start, +s.dates.end - +s.dates.start);
});
test('rolled resize commits the projected opposite endpoint, including mapped empty Ends', () => {
  for (const withEnd of [false, true]) {
    const s = source('2025-11-20', withEnd ? '2025-11-22' : undefined);
    const p = projectDates(s.startInput, s.endInput, s.dates, true, today());
    const plan = planDisplayedResize(s, p, 'start', { start: new Date(2026, 10, 22), end: rendered(p.dates.end), allDay: true }); assert.ok(plan);
    assert.equal(plan.start, '2026-11-22'); assert.equal(plan.end, withEnd ? '2026-11-25' : '2026-11-23');
    assert.equal(plan.writeStart, true); assert.equal(plan.writeEnd, true);
  }
});
test('rolled partial-period resize commits both exact projected boundaries', () => {
  const s = source('2026W48'), now = new Date(2026, 11, 7, 12);
  const p = projectDates(s.startInput, s.endInput, s.dates, true, now);
  const plan = planDisplayedResize(s, p, 'end', { start: rendered(p.dates.start), end: new Date(2026, 11, 15), allDay: true }); assert.ok(plan);
  assert.equal(plan.start, '2026-12-07'); assert.equal(plan.end, '2026-12-14');
  assert.equal(plan.writeStart, true); assert.equal(plan.writeEnd, true);
});
test('rolled start-only body moves leave absent or unmapped ends unchanged', async () => {
  for (const endMapped of [false, true]) {
    const s = source('2025-11-20T09:00', undefined, endMapped);
    const p = projectDates(s.startInput, s.endInput, s.dates, true, today());
    const plan = planDisplayedMove(s, p, { start: new Date(2026, 10, 24, 10), allDay: false }); assert.ok(plan);
    assert.equal(plan.end, undefined);
    const fm = { when: '2025-11-20T09:00' };
    await persistMove(s, plan, { isCurrent: () => true, processFrontMatter: async callback => callback(fm) });
    assert.deepEqual(Object.keys(fm), ['when']); assert.equal(fm.when, '2026-11-24T10:00');
  }
});
test('no-op projected moves/resizes never commit or acknowledge rolling', () => {
  for (const s of [source('2025-11-20'), source('2025-11-20T09:00'), source('2025-11-20', '2025-11-22')]) {
    const p = projectDates(s.startInput, s.endInput, s.dates, true, today());
    assert.equal(planDisplayedMove(s, p, { start: rendered(p.dates.start), allDay: p.dates.allDay }), null);
    assert.equal(planDisplayedResize(s, p, 'end', { start: rendered(p.dates.start), end: rendered(p.dates.end), allDay: p.dates.allDay }), null);
  }
});
test('projected edits still conflict-check exact historical source values', async () => {
  const s = source('2025-11-20', '2025-11-22'), p = projectDates(s.startInput, s.endInput, s.dates, true, today());
  const plan = planDisplayedMove(s, p, { start: new Date(2026, 10, 24), allDay: true }); assert.ok(plan);
  const fm = { when: '2025-11-21', until: '2025-11-22' };
  await assert.rejects(persistMove(s, plan, { isCurrent: () => true, processFrontMatter: async callback => callback(fm) }), /property changed/);
  assert.deepEqual(fm, { when: '2025-11-21', until: '2025-11-22' });
});

test('rolled single-day all-day range converts using the dropped displayed date and a new timed End', async () => {
  const s = source('2025-11-20', '2025-11-20'), p = projectDates(s.startInput, s.endInput, s.dates, true, today());
  assert.equal(p.rolled, true);
  const plan = planDisplayedMove(s, p, { start: new Date(2026, 10, 23, 23, 45), allDay: false }); assert.ok(plan);
  assert.equal(plan.start, '2026-11-23T23:45'); assert.equal(plan.end, '2026-11-24T00:15');
  const fm = { when: '2025-11-20', until: '2025-11-20' };
  await persistMove(s, plan, { isCurrent: () => true, processFrontMatter: async callback => callback(fm) });
  assert.deepEqual(fm, { when: '2026-11-23T23:45', until: '2026-11-24T00:15' });
});
