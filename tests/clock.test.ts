import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockSignature, nextClockDelay, watchLocalClock } from '../src/local-clock';

test('clock delay targets local midnight and polls timezone/clock changes at least once a minute', () => {
  assert.equal(nextClockDelay(new Date(2026, 10, 23, 12)), 60_000);
  assert.equal(nextClockDelay(new Date(2026, 10, 23, 23, 59, 59, 990)), 35);
});
test('clock refreshes at midnight, resume/focus/visibility, and timezone changes; teardown removes timers/listeners', () => {
  let current = new Date(2026, 10, 23, 23, 59), changes = 0, nextId = 0;
  const timers = new Map<number, () => void>(), listeners = new Map<string, Set<() => void>>();
  const add = (type: string, fn: () => void) => { const set = listeners.get(type) ?? new Set(); set.add(fn); listeners.set(type, set); };
  const remove = (type: string, fn: () => void) => { listeners.get(type)?.delete(fn); };
  const win = { setTimeout: (fn: () => void) => { timers.set(++nextId, fn); return nextId; }, clearTimeout: (id: number) => { timers.delete(id); }, addEventListener: add, removeEventListener: remove };
  const doc = { hidden: false, addEventListener: add, removeEventListener: remove };
  const dispose = watchLocalClock(win as unknown as Window, doc as unknown as Document, () => { changes++; }, () => current);
  const poll = () => [...timers.values()][0]!();
  poll(); assert.equal(changes, 0);
  current = new Date(2026, 10, 24, 0, 0); poll(); assert.equal(changes, 1);
  for (const type of ['focus', 'pageshow', 'visibilitychange']) for (const callback of listeners.get(type) ?? []) callback();
  assert.equal(changes, 4);
  const timezone = process.env.TZ;
  try {
    const signature = clockSignature(current);
    process.env.TZ = 'Asia/Tokyo'; assert.notEqual(clockSignature(current), signature);
    poll(); assert.equal(changes, 5);
  } finally { process.env.TZ = timezone; }
  dispose(); assert.equal(timers.size, 0); assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
});
