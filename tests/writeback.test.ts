import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertDates, parseDate } from '../src/dates';
import { dropRestriction, persistMove, planMove, prepareMove, serializeTimed, SerialSaves, type Mappings, type MoveSnapshot, type WriteHost } from '../src/writeback';
import { resultReady } from '../src/results';

const mappings: Mappings = { start: 'note.scheduled', end: 'note.until' };
const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
function snapshot(start: string | number, end?: string | number | null): MoveSnapshot {
  const fm = { scheduled: start, ...(end !== undefined ? { until: end } : {}) };
  const access = prepareMove('event.md', mappings, fm, start, end);
  assert.ok(access.snapshot, access.reason);
  return access.snapshot;
}
function memoryHost(frontmatter: Record<string, unknown>, guard = () => true): WriteHost {
  return { isCurrent: guard, processFrontMatter: async callback => {
    const draft = { ...frontmatter };
    callback(draft);
    Object.assign(frontmatter, draft);
  } };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('partial starts and ends stay display-only without losing precision', () => {
  for (const value of ['2026', 2026, '2026-11']) {
    assert.match(prepareMove('a.md', mappings, { scheduled: value }, value, null).reason!, /full dates/);
    assert.match(prepareMove('a.md', mappings, { scheduled: '2026-01-01', until: value }, '2026-01-01', value).reason!, /full dates/);
  }
});
test('week precision on either endpoint is display-only with a week-specific explanation', () => {
  for (const week of ['2026W48', '2026-W48']) {
    for (const fm of [{ scheduled: week, until: '2026-12-01' }, { scheduled: '2026-11-23', until: week }]) {
      const before = { ...fm };
      const access = prepareMove('a.md', mappings, fm, fm.scheduled, fm.until);
      assert.equal(access.snapshot, undefined);
      assert.match(access.reason!, /Body dragging.*week.*full dates/);
      assert.deepEqual(fm, before);
    }
  }
});
test('derived start/end and identical mappings prevent dragging, including an absent derived end', () => {
  for (const config of [
    { start: 'formula.start', end: null }, { start: 'file.ctime', end: null },
    { start: 'note.scheduled', end: 'formula.end' }, { start: 'note.scheduled', end: 'file.mtime' }
  ]) assert.match(prepareMove('a.md', config, { scheduled: '2026-11-23' }, '2026-11-23', null).reason!, /display-only/);
  assert.match(prepareMove('a.md', { start: 'note.scheduled', end: 'note.scheduled' }, { scheduled: '2026-11-23' }, '2026-11-23', '2026-11-23').reason!, /different/);
});
test('cached frontmatter cannot substitute unrelated evaluated query values', () => {
  assert.match(prepareMove('a.md', mappings, { scheduled: '2026-11-24' }, '2026-11-23', null).reason!, /updating/);
  assert.match(prepareMove('a.md', mappings, undefined, '2026-11-23', null).reason!, /metadata/);
});
test('all-day moves preserve calendar-day span and inclusive ends across DST and year boundaries', () => {
  const original = snapshot('2026-10-24', '2026-10-26');
  const moved = planMove(original, { start: new Date(2026, 11, 31), allDay: true });
  assert.equal(moved.start, '2026-12-31');
  assert.equal(moved.end, '2027-01-02');
  assert.deepEqual(moved.dates, { allDay: true, start: '2026-12-31', end: '2027-01-03' });
  const spring = planMove(original, { start: new Date(2026, 2, 28), allDay: true });
  assert.equal(spring.end, '2026-03-30');
  assert.equal(planMove(snapshot('2026-11-23', '2026-11-23'), { start: new Date(2024, 1, 29), allDay: true }).end, '2024-02-29');
});
test('timed ranges preserve elapsed duration across DST, ignoring an implied wall-clock end', () => {
  const original = snapshot('2026-03-29T01:30+01:00', '2026-03-29T04:30+02:00');
  const target = new Date('2026-10-25T00:30:00Z');
  const moved = planMove(original, { start: target, allDay: false });
  assert.equal(+(moved.dates.start as Date), +target);
  assert.equal(+moved.dates.end - +moved.dates.start, 2 * 60 * 60_000);
  assert.ok(moved.start.endsWith('+01:00'));
  assert.ok(moved.end!.endsWith('+02:00'));
});
test('seconds, fractional precision and explicit offset spelling survive a minute-grid move', () => {
  for (const offset of ['Z', '+01:00', '+0100', '-05:00']) {
    const original = snapshot(`2026-11-23T09:00:34.125600${offset}`, `2026-11-23T10:00:45.250700${offset}`);
    const moved = planMove(original, { start: new Date('2026-11-24T12:30:00Z'), allDay: false });
    assert.ok(moved.start.endsWith(`:34.125600${offset}`), moved.start);
    assert.ok(moved.end!.endsWith(`:45.250700${offset}`), moved.end);
    assert.equal((moved.dates.start as Date).toISOString(), '2026-11-24T12:30:34.125Z');
    assert.equal(+moved.dates.end - +moved.dates.start, +original.dates.end - +original.dates.start);
  }
});
test('timed serialization normalizes spaces to T and retains minute/second/fraction formatting', () => {
  for (const [original, expected] of [
    ['2026-11-23 09:00', '2026-11-24T10:00'],
    ['2026-11-23 09:00:00', '2026-11-24T10:00:00'],
    ['2026-11-23T09:00:00.0', '2026-11-24T10:00:00.0']
  ] as const) assert.equal(planMove(snapshot(original), { start: new Date(2026, 10, 24, 10), allDay: false }).start, expected);
});
test('offset-free times acquire an explicit offset only when a fold needs disambiguation', () => {
  const later = process.env.TZ === 'America/New_York' ? new Date('2026-11-01T06:15:00Z') : new Date('2026-10-25T01:15:00Z');
  const serialized = serializeTimed(later);
  const parsed = parseDate(serialized);
  assert.ok(parsed?.kind === 'time');
  assert.equal(+parsed.value, +later);
  if (process.env.TZ === 'Europe/Berlin') assert.equal(serialized, '2026-10-25T02:15+01:00');
  if (process.env.TZ === 'America/New_York') assert.equal(serialized, '2026-11-01T01:15-05:00');
});
test('start-only cross-kind moves use a date or a 30-minute timed block and never synthesize an end', async () => {
  for (const initial of ['2026-11-23', '2026-11-23 09:00']) {
    const original = snapshot(initial);
    const timed = planMove(original, { start: new Date(2026, 10, 24, 10), allDay: false });
    assert.equal(timed.end, undefined);
    assert.equal(+timed.dates.end - +timed.dates.start, 30 * 60_000);
    const fm = { scheduled: initial, unrelated: 'keep' };
    await persistMove(original, timed, memoryHost(fm));
    assert.equal(hasOwn(fm, 'until'), false);
    const allDay = planMove(snapshot(initial), { start: new Date(2026, 10, 24), allDay: true });
    assert.equal(allDay.start, '2026-11-24');
    assert.equal(allDay.end, undefined);
    assert.equal(allDay.dates.end, '2026-11-25');
  }
});
test('empty configured ends retain their exact absence/null/empty representation', async () => {
  for (const end of [undefined, null, '']) {
    const original = snapshot('2026-11-23', end);
    const fm: Record<string, unknown> = { scheduled: '2026-11-23', ...(end !== undefined ? { until: end } : {}) };
    await persistMove(original, planMove(original, { start: new Date(2026, 10, 24, 10), allDay: false }), memoryHost(fm));
    assert.equal(fm.until, end);
    assert.equal(hasOwn(fm, 'until'), end !== undefined);
  }
});
test('unconfigured end and unrelated frontmatter are never written', async () => {
  const fm = { scheduled: '2026-11-23', until: 'unrelated value', tags: ['one'], other: { keep: true } };
  const access = prepareMove('a.md', { start: 'note.scheduled', end: null }, fm, fm.scheduled, null);
  assert.ok(access.snapshot);
  await persistMove(access.snapshot, planMove(access.snapshot, { start: new Date(2026, 10, 24), allDay: true }), memoryHost(fm));
  assert.equal(fm.until, 'unrelated value');
  assert.deepEqual(fm.tags, ['one']);
  assert.deepEqual(fm.other, { keep: true });
});
test('multi-day all-day and timed explicit-end ranges retain their cross-kind restrictions', () => {
  for (const original of [snapshot('2026-11-23', '2026-11-25'), snapshot('2026-11-23T09:00', '2026-11-23T10:00')]) {
    assert.match(dropRestriction(original, !original.dates.allDay)!, /must stay/);
    assert.throws(() => planMove(original, { start: new Date(2026, 10, 24, 10), allDay: !original.dates.allDay }), /must stay/);
  }
});

test('single-day all-day ranges become 30-minute timed ranges, including midnight and DST transitions', async () => {
  const initial = snapshot('2026-11-22', '2026-11-22');
  const berlin = process.env.TZ === 'Europe/Berlin';
  for (const target of [new Date(2026, 10, 23, 10), new Date(2026, 10, 23, 23, 45),
    new Date(berlin ? '2026-03-29T00:45:00Z' : '2026-03-08T06:45:00Z'),
    new Date(berlin ? '2026-10-25T00:45:00Z' : '2026-11-01T05:45:00Z')]) {
    assert.equal(dropRestriction(initial, false), null);
    const plan = planMove(initial, { start: target, allDay: false });
    assert.equal(plan.dates.allDay, false); assert.equal(+plan.dates.start, +target);
    assert.equal(+plan.dates.end - +plan.dates.start, 30 * 60_000);
    const fm = { scheduled: '2026-11-22', until: '2026-11-22', other: 'keep' };
    await persistMove(initial, plan, memoryHost(fm));
    assert.equal(fm.scheduled, plan.start); assert.equal(fm.until, plan.end); assert.equal(fm.other, 'keep');
  }
});

test('all-day to timed conversion checks both historical fields and propagates failed writes', async () => {
  const initial = snapshot('2026-11-22', '2026-11-22');
  const plan = planMove(initial, { start: new Date(2026, 10, 23, 10), allDay: false });
  for (const field of ['scheduled', 'until']) {
    const fm = { scheduled: '2026-11-22', until: '2026-11-22', [field]: '2026-11-23' }, before = { ...fm };
    await assert.rejects(persistMove(initial, plan, memoryHost(fm)), /property changed/); assert.deepEqual(fm, before);
  }
  await assert.rejects(persistMove(initial, plan, { isCurrent: () => true, processFrontMatter: async () => { throw new Error('disk unavailable'); } }), /disk unavailable/);
});
test('both existing fields are saved together in one frontmatter transaction', async () => {
  const original = snapshot('2026-11-23', '2026-11-25');
  const fm = { scheduled: '2026-11-23', until: '2026-11-25' };
  let calls = 0;
  await persistMove(original, planMove(original, { start: new Date(2026, 10, 24), allDay: true }), {
    isCurrent: () => true, processFrontMatter: async callback => { calls++; callback(fm); }
  });
  assert.equal(calls, 1);
  assert.deepEqual(fm, { scheduled: '2026-11-24', until: '2026-11-26' });
});
test('intervening start or end edits abort before either field is mutated', async () => {
  for (const field of ['scheduled', 'until']) {
    const original = snapshot('2026-11-23', '2026-11-25');
    const fm: Record<string, unknown> = { scheduled: '2026-11-23', until: '2026-11-25', [field]: '2026-12-01', unrelated: 42 };
    const before = { ...fm };
    await assert.rejects(persistMove(original, planMove(original, { start: new Date(2026, 10, 24), allDay: true }), memoryHost(fm)), /property changed/);
    assert.deepEqual(fm, before);
  }
});
test('new/deleted ends and representation-only edits are conflicts', async () => {
  for (const [original, fm] of [
    [snapshot('2026-11-23'), { scheduled: '2026-11-23', until: '2026-11-25' }],
    [snapshot('2026-11-23', null), { scheduled: '2026-11-23' }],
    [snapshot('2026-11-23 09:00'), { scheduled: '2026-11-23T09:00' }]
  ] as const) {
    const before = { ...fm };
    await assert.rejects(persistMove(original, planMove(original, { start: new Date(2026, 10, 24, 10), allDay: original.dates.allDay }), memoryHost(fm)), /property changed/);
    assert.deepEqual(fm, before);
  }
});
test('missing/renamed file, changed mapping or closed view is checked again inside the callback', async () => {
  for (const reason of ['rename', 'delete', 'mapping', 'unload']) {
    const original = snapshot('2026-11-23');
    const fm = { scheduled: '2026-11-23' };
    let current = true;
    let calls = 0;
    const done = persistMove(original, planMove(original, { start: new Date(2026, 10, 24), allDay: true }), {
      isCurrent: () => current,
      processFrontMatter: async callback => { calls++; current = false; callback(fm); }
    });
    await assert.rejects(done, /note, view or property mappings changed/, reason);
    assert.equal(calls, 1);
    assert.equal(fm.scheduled, '2026-11-23');
  }
});
test('a stale guard aborts before even asking the host to write', async () => {
  const original = snapshot('2026-11-23');
  let called = false;
  await assert.rejects(persistMove(original, planMove(original, { start: new Date(2026, 10, 24), allDay: true }), {
    isCurrent: () => false, processFrontMatter: async () => { called = true; }
  }), /changed/);
  assert.equal(called, false);
});
test('host parse/storage failures propagate without committing a partial transaction', async () => {
  const original = snapshot('2026-11-23', '2026-11-25');
  const fm = { scheduled: '2026-11-23', until: '2026-11-25' };
  for (const afterCallback of [false, true]) {
    await assert.rejects(persistMove(original, planMove(original, { start: new Date(2026, 10, 24), allDay: true }), {
      isCurrent: () => true, processFrontMatter: async callback => {
        if (afterCallback) callback({ ...fm });
        throw new Error('host write failure');
      }
    }), /host write failure/);
    assert.deepEqual(fm, { scheduled: '2026-11-23', until: '2026-11-25' });
  }
});
test('literal property names cannot mutate the frontmatter prototype', async () => {
  const fm = JSON.parse('{"__proto__":"2026-11-23"}') as Record<string, unknown>;
  const access = prepareMove('a.md', { start: 'note.__proto__', end: null }, fm, '2026-11-23', null);
  assert.ok(access.snapshot);
  await persistMove(access.snapshot, planMove(access.snapshot, { start: new Date(2026, 10, 24), allDay: true }), memoryHost(fm));
  assert.equal(fm.__proto__, '2026-11-24');
  assert.equal(Object.getPrototypeOf(fm), Object.prototype);
});
test('same-note saves serialize, including after a failure; other notes proceed independently', async () => {
  const saves = new SerialSaves(), gate = deferred();
  const order: string[] = [];
  const first = saves.run('a.md', async () => { order.push('a1'); await gate.promise; throw new Error('first failed'); });
  const firstFailure = assert.rejects(first, /first failed/);
  const second = saves.run('a.md', async () => { order.push('a2'); });
  await saves.run('b.md', async () => { order.push('b'); });
  assert.deepEqual(order, ['a1', 'b']);
  assert.equal(saves.isBusy('a.md'), true);
  gate.resolve();
  await Promise.all([firstFailure, second]);
  assert.deepEqual(order, ['a1', 'b', 'a2']);
  assert.equal(saves.isBusy('a.md'), false);
});
test('a queued stale move cannot overwrite a preceding successful move', async () => {
  const saves = new SerialSaves(), original = snapshot('2026-11-23');
  const fm = { scheduled: '2026-11-23' }, host = memoryHost(fm);
  const first = saves.run('event.md', () => persistMove(original, planMove(original, { start: new Date(2026, 10, 24), allDay: true }), host));
  const second = saves.run('event.md', () => persistMove(original, planMove(original, { start: new Date(2026, 10, 25), allDay: true }), host));
  await first;
  await assert.rejects(second, /property changed/);
  assert.equal(fm.scheduled, '2026-11-24');
});
test('query reconciliation hides stale rows, accepts confirmed data and respects filtered exclusion', () => {
  const original = snapshot('2026-11-23');
  const plan = planMove(original, { start: new Date(2026, 10, 24), allDay: true });
  const wait = { plan, mappings, dragRevision: 2, settledRevision: 3, before: { start: '2026-11-23', end: null } };
  assert.equal(resultReady(wait, mappings, 3, { start: '2026-11-23', end: null }), false);
  assert.equal(resultReady(wait, mappings, 3, { start: '2026-11-24', end: null }), true);
  assert.equal(resultReady(wait, mappings, 3, undefined), true);
  assert.equal(resultReady(wait, mappings, 2, undefined), false);
  assert.equal(resultReady(wait, mappings, 4, { start: '2026-12-01', end: null }), true);
  assert.equal(resultReady(wait, mappings, 4, { start: '2026-11-23', end: null }), false);
  assert.equal(resultReady(wait, mappings, 4, { start: '2026-11-23', end: null }, { start: '2026-11-23', end: null, changedSinceSave: true }), true);
  assert.equal(resultReady(wait, { start: 'note.other', end: null }, 3, undefined), true);
  assert.ok(convertDates(plan.start).dates);
});
