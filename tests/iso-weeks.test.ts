import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, isoPeriod } from '../src/iso-weeks';
const day = (text: string) => new Date(`${text}T12:00`);
test('ISO week-year boundaries use Monday through Sunday in every test timezone', () => {
  for (const [date, year, week] of [
    ['2025-12-28',2025,52],['2025-12-29',2026,1],['2026-01-04',2026,1],['2026-01-05',2026,2],
    ['2026-11-23',2026,48],['2026-11-29',2026,48],['2026-12-28',2026,53],['2027-01-03',2026,53],['2027-01-04',2027,1],
    ['2024-12-30',2025,1],['2000-01-01',1999,52]
  ] as const) assert.deepEqual(isoWeek(day(date)), {year,week}, date);
});
test('displayed Week and Day label the viewed week rather than today', () => {
  assert.equal(isoPeriod(day('2026-11-23'),day('2026-11-30'),'timeGridWeek'),'2026-W48');
  assert.equal(isoPeriod(day('2025-12-29'),day('2026-01-05'),'timeGridWeek'),'2026-W01');
  assert.equal(isoPeriod(day('2027-01-03'),day('2027-01-04'),'timeGridDay'),'2026-W53');
});
test('Month and Year use nominal dates and an exclusive end, including cross-year ISO ranges', () => {
  assert.equal(isoPeriod(day('2026-11-01'),day('2026-12-01'),'dayGridMonth'),'2026-W44–W49');
  assert.equal(isoPeriod(day('2027-01-01'),day('2028-01-01'),'multiMonthYear'),'2026-W53 – 2027-W52');
  assert.equal(isoPeriod(day('2026-01-01'),day('2027-01-01'),'multiMonthYear'),'2026-W01–W53');
  assert.equal(isoPeriod(day('2021-02-01'),day('2021-03-01'),'dayGridMonth'),'2021-W05–W08');
  assert.equal(isoPeriod(day('2025-12-01'),day('2026-01-01'),'dayGridMonth'),'2025-W49 – 2026-W01');
  assert.equal(isoPeriod(day('2027-01-01'),day('2027-02-01'),'dayGridMonth'),'2026-W53 – 2027-W04');
});
test('ISO calculation remains correct through DST and handles four-digit years below 100', () => {
  assert.deepEqual(isoWeek(day('2026-03-29')), {year:2026,week:13});
  assert.deepEqual(isoWeek(day('2026-11-01')), {year:2026,week:44});
  const early = new Date(0); early.setFullYear(26,10,23); assert.ok(isoWeek(early).year < 100);
  assert.throws(()=>isoWeek(new Date(NaN)), /Invalid/);
});
