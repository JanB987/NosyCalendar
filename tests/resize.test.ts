import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertDates } from '../src/dates';
import { persistMove, planMove, planResize, prepareMove, prepareResize, SerialSaves, type MoveSnapshot, type ResizeEdge } from '../src/writeback';

const mappings = { start: 'note.scheduled', end: 'note.until' };
function snapshot(start: string | number, end?: string | number | null): MoveSnapshot {
  const access = prepareResize('event.md', mappings, { scheduled: start, ...(end !== undefined ? { until: end } : {}) }, start, end);
  assert.ok(access.snapshot, access.reason);
  return access.snapshot;
}
const rendered = (value: string | Date) => value instanceof Date ? new Date(+value) : new Date(value + 'T00:00:00');
function resize(source: MoveSnapshot, edge: ResizeEdge, boundary: Date) {
  const target = { start: rendered(source.dates.start), end: rendered(source.dates.end), allDay: source.dates.allDay };
  target[edge] = boundary;
  const plan = planResize(source, edge, target);
  assert.ok(plan);
  return plan;
}

test('timed start/end resizing changes one endpoint and keeps the other exact', () => {
  const source = snapshot('2026-11-23 09:00:00', '2026-11-23 10:00:00');
  const start = resize(source, 'start', new Date(2026, 10, 23, 8, 30));
  assert.equal(start.start, '2026-11-23T08:30:00');
  assert.equal(start.end, '2026-11-23 10:00:00');
  assert.equal(start.writeStart, true); assert.equal(start.writeEnd, false);
  const end = resize(source, 'end', new Date(2026, 10, 23, 11));
  assert.equal(end.start, '2026-11-23 09:00:00');
  assert.equal(end.end, '2026-11-23T11:00:00');
  assert.equal(end.writeStart, false); assert.equal(end.writeEnd, true);
});
test('all-day resizing keeps inclusive stored ends and permits a single day', () => {
  const source = snapshot('2026-11-23', '2026-11-25');
  assert.equal(resize(source, 'start', new Date(2026, 10, 24)).end, '2026-11-25');
  const end = resize(source, 'end', new Date(2026, 10, 28));
  assert.equal(end.start, '2026-11-23'); assert.equal(end.end, '2026-11-27');
  assert.equal(resize(source, 'end', new Date(2026, 10, 24)).end, '2026-11-23');
});
test('fixed endpoints come from the full source range, never a clipped/mutated segment', () => {
  const source = snapshot('2026-11-01', '2026-12-20');
  const start = planResize(source, 'start', { start: new Date(2026, 10, 2), end: new Date(2026, 10, 8), allDay: true });
  assert.equal(start?.end, '2026-12-20');
  const end = planResize(source, 'end', { start: new Date(2026, 10, 16), end: new Date(2026, 11, 22), allDay: true });
  assert.equal(end?.start, '2026-11-01'); assert.equal(end?.end, '2026-12-21');
});
test('missing timed ends anchor to the original 30-minute boundary when start changes', () => {
  const source = snapshot('2026-11-23 09:00');
  const start = resize(source, 'start', new Date(2026, 10, 23, 8, 30));
  assert.equal(start.start, '2026-11-23T08:30'); assert.equal(start.end, '2026-11-23T09:30');
  assert.equal(start.writeEnd, true);
  const end = resize(source, 'end', new Date(2026, 10, 23, 10));
  assert.equal(end.start, '2026-11-23 09:00'); assert.equal(end.end, '2026-11-23T10:00');
});
test('missing all-day ends anchor to the original inclusive day', () => {
  const source = snapshot('2026-11-23');
  const start = resize(source, 'start', new Date(2026, 10, 22));
  assert.equal(start.start, '2026-11-22'); assert.equal(start.end, '2026-11-23');
});
test('year/month/week partial periods convert both full-range endpoints to exact dates', () => {
  for (const [value, first, last] of [
    [2026, '2026-01-01', '2026-12-31'], ['2026-11', '2026-11-01', '2026-11-30'],
    ['2026W48', '2026-11-23', '2026-11-29'], ['2026-W48', '2026-11-23', '2026-11-29']
  ] as const) {
    const source = snapshot(value);
    const start = rendered(first); start.setDate(start.getDate() + 1);
    const plan = resize(source, 'start', start);
    assert.equal(plan.end, last); assert.equal(plan.writeStart, true); assert.equal(plan.writeEnd, true);
    assert.match(plan.start, /^\d{4}-\d{2}-\d{2}$/);
    const end = rendered(source.dates.end); end.setDate(end.getDate() + 1);
    const extended = resize(source, 'end', end);
    assert.equal(extended.start, first); assert.equal(extended.writeStart, true); assert.equal(extended.writeEnd, true);
    if (typeof value === 'string' && value.includes('W48')) assert.equal(extended.end, '2026-11-30');
  }
  const partialEnd = resize(snapshot('2026-11-23', '2026-W49'), 'end', new Date(2026, 11, 8));
  assert.equal(partialEnd.start, '2026-11-23'); assert.equal(partialEnd.end, '2026-12-07'); assert.equal(partialEnd.writeStart, true);
});
test('no-op boundaries never create an end or convert partial precision', () => {
  for (const source of [snapshot('2026W48'), snapshot(2026), snapshot('2026-11-23'), snapshot('2026-11-23T09:00')]) {
    for (const edge of ['start', 'end'] as const) assert.equal(planResize(source, edge,
      { start: rendered(source.dates.start), end: rendered(source.dates.end), allDay: source.dates.allDay }), null);
  }
});
test('resizing requires distinct writable mappings, including an explicit End mapping', () => {
  for (const config of [{ start: 'note.scheduled', end: null }, { start: 'note.scheduled', end: 'note.scheduled' },
    { start: 'formula.start', end: 'note.until' }, { start: 'note.scheduled', end: 'file.mtime' }]) {
    assert.ok(prepareResize('a.md', config, { scheduled: '2026-11-23' }, '2026-11-23', null).reason);
  }
  assert.match(prepareResize('a.md', { start: 'note.scheduled', end: null }, {}, '2026-11-23', null).reason!, /Select an End/);
  assert.ok(prepareMove('a.md', { start: 'note.scheduled', end: null }, { scheduled: '2026-11-23' }, '2026-11-23', null).snapshot);
  assert.ok(prepareMove('a.md', mappings, { scheduled: '2026W48' }, '2026W48', null).reason);
  assert.ok(prepareResize('a.md', mappings, { scheduled: '2026W48' }, '2026W48', null).snapshot);
});
test('invalid/equal timed ranges, reversed all-day ranges and kind changes are rejected', () => {
  const timed = snapshot('2026-11-23T09:00', '2026-11-23T10:00');
  assert.throws(() => resize(timed, 'start', new Date(2026, 10, 23, 10)), /equal timed/);
  assert.throws(() => resize(timed, 'end', new Date(2026, 10, 23, 8)), /before start/);
  assert.throws(() => resize(snapshot('2026-11-23'), 'start', new Date(2026, 10, 24)), /before start/);
  assert.throws(() => planResize(timed, 'end', { start: new Date(), end: new Date(), allDay: true }), /kind unchanged/);
  assert.throws(() => resize(timed, 'end', new Date(NaN)), /Invalid dropped time/);
});
test('seconds/fractions and fixed numeric offset intent are preserved at the changed endpoint', () => {
  const source = snapshot('2026-11-23 09:00:34.125600+0100', '2026-11-23 10:00:45.250700+01:00');
  const start = resize(source, 'start', new Date('2026-11-23T07:30:00Z'));
  assert.equal(start.start, '2026-11-23T08:30:34.125600+0100');
  assert.equal(start.end, '2026-11-23 10:00:45.250700+01:00');
  const end = resize(source, 'end', new Date('2026-11-23T10:30:00Z'));
  assert.equal(end.start, '2026-11-23 09:00:34.125600+0100');
  assert.equal(end.end, '2026-11-23T11:30:45.250700+01:00');
});
test('day-grid timed changes retain wall time across DST; inclusive ends cross DST/year boundaries', () => {
  const source = snapshot('2026-03-28T09:12:34.125', '2026-03-28T10:15:45.250');
  const end = resize(source, 'end', new Date(2026, 2, 29, 10, 15));
  assert.equal(end.end, '2026-03-29T10:15:45.250');
  assert.equal(end.start, '2026-03-28T09:12:34.125');
  assert.equal(resize(snapshot('2026-10-24', '2026-10-26'), 'end', new Date(2026, 9, 28)).end, '2026-10-27');
  assert.equal(resize(snapshot('2026-12-31'), 'end', new Date(2027, 0, 3)).end, '2027-01-02');
});
test('later repeated-hour instants retain their instant on resize', () => {
  if (process.env.TZ === 'UTC') return;
  const berlin = process.env.TZ === 'Europe/Berlin';
  const source = snapshot(berlin ? '2026-10-25T01:15' : '2026-11-01T00:15');
  const later = new Date(berlin ? '2026-10-25T01:15Z' : '2026-11-01T06:15Z');
  const end = resize(source, 'end', later);
  assert.equal(+(end.dates.end as Date), +later);
  assert.ok(end.end?.endsWith(berlin ? '+01:00' : '-05:00'));
});
test('existing fixed endpoints are not assigned, while empty mapped ends are created atomically', async () => {
  for (const end of [undefined, null, '', '2026-11-23']) {
    const source = snapshot('2026-11-23', end);
    const fm: Record<string, unknown> = { scheduled: '2026-11-23', ...(end !== undefined ? { until: end } : {}), other: 'keep' };
    const assigned: string[] = [];
    const proxy = new Proxy(fm, { defineProperty: (object, key, descriptor) => { assigned.push(String(key)); return Reflect.defineProperty(object, key, descriptor); } });
    const plan = resize(source, 'start', new Date(2026, 10, 22));
    let calls = 0;
    await persistMove(source, plan, { isCurrent: () => true, processFrontMatter: async callback => { calls++; callback(proxy); } });
    assert.equal(calls, 1); assert.equal(fm.until, '2026-11-23'); assert.equal(fm.other, 'keep');
    assert.deepEqual(assigned, end === '2026-11-23' ? ['scheduled'] : ['scheduled', 'until']);
  }
});
test('conflicting mapped-end edits abort a resize before either assignment', async () => {
  const source = snapshot('2026-11-23');
  const fm = { scheduled: '2026-11-23', until: '2026-12-01' };
  await assert.rejects(persistMove(source, resize(source, 'start', new Date(2026, 10, 22)), {
    isCurrent: () => true, processFrontMatter: async callback => callback(fm)
  }), /property changed/);
  assert.deepEqual(fm, { scheduled: '2026-11-23', until: '2026-12-01' });
});
test('move and resize saves share one per-note queue and stale mutations cannot overwrite a prior save', async () => {
  const source = snapshot('2026-11-23', '2026-11-25'), saves = new SerialSaves();
  const fm = { scheduled: '2026-11-23', until: '2026-11-25' };
  const host = { isCurrent: () => true, processFrontMatter: async (callback: (value: Record<string, unknown>) => void) => callback(fm) };
  const move = saves.run('event.md', () => persistMove(source, planMove(source, { start: new Date(2026, 10, 24), allDay: true }), host));
  const resizeSave = saves.run('event.md', () => persistMove(source, resize(source, 'end', new Date(2026, 10, 28)), host));
  await move; await assert.rejects(resizeSave, /property changed/);
  assert.deepEqual(fm, { scheduled: '2026-11-24', until: '2026-11-26' });
  assert.ok(convertDates(fm.scheduled, fm.until).dates);
});
