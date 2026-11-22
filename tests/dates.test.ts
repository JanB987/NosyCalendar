import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertDates, nextCalendarDate, parseDate, type EventDates } from '../src/dates';

function dates(start: string | number | null | undefined, end?: string | number | null): EventDates {
  const result = convertDates(start, end);
  assert.ok(result.dates, `Unexpected omission: ${result.reason}`);
  return result.dates;
}

test('one all-day event with an exclusive end; equal dates remain one day', () => {
  const expected = { allDay: true, start: '2026-11-23', end: '2026-11-24' };
  assert.deepEqual(dates('2026-11-23'), expected);
  assert.deepEqual(dates('2026-11-23', ''), expected);
  assert.deepEqual(dates('2026-11-23', '2026-11-23'), expected);
});
test('inclusive multi-day range across DST ends on the following calendar day', () => {
  assert.deepEqual(dates('2026-10-24', '2026-10-26'), { allDay: true, start: '2026-10-24', end: '2026-10-27' });
  assert.equal(dates('2026-03-28', '2026-03-30').end, '2026-03-31');
  assert.equal(dates('2026-11-23', '2026-11-25').end, '2026-11-26');
});
test('calendar arithmetic handles leap days and month/year rollover', () => {
  assert.equal(nextCalendarDate('2024-02-28'), '2024-02-29');
  assert.equal(nextCalendarDate('2024-02-29'), '2024-03-01');
  assert.equal(nextCalendarDate('2026-12-31'), '2027-01-01');
  assert.equal(nextCalendarDate('0099-12-31'), '0100-01-01');
});
test('timed duration and missing-end default; explicit midnight remains timed', () => {
  const meeting = dates('2026-11-23T09:00', '2026-11-23T10:00');
  assert.equal(meeting.allDay, false);
  assert.equal(+meeting.end - +meeting.start, 60 * 60_000);
  for (const end of [undefined, null, '']) {
    const event = dates('2026-11-23T00:00:00', end);
    assert.equal(event.allDay, false);
    assert.equal(+event.end - +event.start, 30 * 60_000);
    assert.equal((event.start as Date).getHours(), 0);
  }
});
test('offset-free timestamps use local wall time', () => {
  const event = dates('2026-11-23T09:12:34.125');
  const start = event.start as Date;
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 10);
  assert.equal(start.getDate(), 23);
  assert.equal(start.getHours(), 9);
  assert.equal(start.getMinutes(), 12);
  assert.equal(start.getSeconds(), 34);
  assert.equal(start.getMilliseconds(), 125);
});
test('Z and explicit offsets identify instants regardless of local timezone', () => {
  for (const input of ['2026-11-23T08:00Z', '2026-11-23T09:00+01:00', '2026-11-23T09:00+0100', '2026-11-23T03:00-05:00']) {
    assert.equal((dates(input).start as Date).toISOString(), '2026-11-23T08:00:00.000Z');
  }
  if (process.env.TZ === 'Europe/Berlin') assert.equal((dates('2026-11-23T08:00Z').start as Date).getHours(), 9);
});
test('offset-aware fall-back endpoints compare instants, not wall-clock order', () => {
  const event = dates('2026-10-25T02:45+02:00', '2026-10-25T02:15+01:00');
  assert.equal(+event.end - +event.start, 30 * 60_000);
});
test('default timed duration is 30 elapsed minutes across DST', () => {
  const event = dates('2026-03-29T01:45+01:00');
  assert.equal(+event.end - +event.start, 30 * 60_000);
  if (process.env.TZ === 'Europe/Berlin') assert.equal((event.end as Date).getHours(), 3);
});
test('missing starts are distinguished from invalid input', () => {
  for (const value of [undefined, null, '']) assert.equal(convertDates(value, 'garbage').reason, 'missing start');
  for (const value of [' ', '23/11/2026', 'November 23, 2026', '2026-2-3', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-11-00', '2026-11-23T24:00', '2026-11-23T09:60', '2026-11-23T09:00:60', '2026-11-23T09:00+25:00', '2026-11-23T09:00+01:60', '\u0000invalid']) {
    assert.equal(convertDates(value).reason, 'invalid start', value);
  }
});

test('all seven representations, including a numeric YAML year', () => {
  for (const year of ['2026', 2026]) assert.deepEqual(dates(year), { allDay: true, start: '2026-01-01', end: '2027-01-01' });
  assert.deepEqual(dates('2026-11'), { allDay: true, start: '2026-11-01', end: '2026-12-01' });
  assert.equal(dates('2026-11-22').allDay, true);
  for (const value of ['2026-11-22 10:00', '2026-11-22 10:00:00', '2026-11-22T10:00', '2026-11-22T10:00:00']) {
    const event = dates(value);
    assert.equal(event.allDay, false);
    assert.equal((event.start as Date).getHours(), 10);
    assert.equal(+event.end - +event.start, 30 * 60_000);
  }
});

test('both dated ISO week spellings cover the same complete Monday–Sunday period', () => {
  for (const value of ['2026W48', '2026-W48']) {
    assert.deepEqual(parseDate(value), { kind: 'date', value: '2026-11-23', last: '2026-11-29', precision: 'week' });
    assert.deepEqual(dates(value), { allDay: true, start: '2026-11-23', end: '2026-11-30' });
  }
});
test('ISO week-year boundaries include dates in adjacent calendar years', () => {
  for (const value of ['2026W01', '2026-W01']) {
    assert.deepEqual(dates(value), { allDay: true, start: '2025-12-29', end: '2026-01-05' });
  }
  for (const value of ['2026W53', '2026-W53']) {
    assert.deepEqual(dates(value), { allDay: true, start: '2026-12-28', end: '2027-01-04' });
  }
});
test('nonexistent ISO weeks, incomplete spellings and deferred recurrence syntax are rejected', () => {
  for (const value of ['2025W53', '2025-W53', '2026W00', '2026-W00', '2026W54', '2026-W54',
    '2026W1', '2026-W1', '2026w48', '2026--W48', '2026-W48-1', '2026-W48T10:00', '2026-W48 ',
    'W48', 'YYYY-W48', 'YYYY-11-DD', 'FREQ=YEARLY;BYWEEKNO=48']) {
    assert.equal(parseDate(value), null, value);
    assert.equal(convertDates(value).reason, 'invalid start', value);
    assert.equal(convertDates('2026-11-23', value).reason, 'invalid end', value);
  }
});
test('configured week ends include Sunday and combine with calendar-only precision', () => {
  for (const start of ['2026W48', '2026-W48']) for (const end of ['2026W49', '2026-W49']) {
    assert.deepEqual(dates(start, end), { allDay: true, start: '2026-11-23', end: '2026-12-07' });
  }
  assert.equal(dates('2026-11-25', '2026-W48').end, '2026-11-30');
  assert.equal(dates('2026-W48', '2026-W48').end, '2026-11-30');
  assert.equal(dates('2026-W48', '2026-11').end, '2026-12-01');
  assert.equal(convertDates('2026-W49', '2026-W48').reason, 'end before start');
  assert.equal(convertDates('2026-W48', '2026-11-23T10:00').reason, 'mixed date/date-time range');
  assert.equal(convertDates('2026-11-23T10:00', '2026-W48').reason, 'mixed date/date-time range');
});
test('week 53 existence follows the independent January-1 rule over a 400-year Gregorian cycle', () => {
  let yearsWith53Weeks = 0;
  for (let year = 2000; year < 2400; year++) {
    const jan1Day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const expected53 = jan1Day === 4 || (leap && jan1Day === 3);
    const last = parseDate(`${year}-W53`);
    assert.equal(Boolean(last), expected53, String(year));
    if (expected53) yearsWith53Weeks++;
    const first = parseDate(`${year}-W01`);
    assert.ok(first?.kind === 'date');
    assert.equal(new Date(first.value + 'T00:00Z').getUTCDay(), 1);
    assert.equal(new Date(first.last + 'T00:00Z').getUTCDay(), 0);
    assert.ok(first.value <= `${year}-01-04` && first.last >= `${year}-01-04`);
  }
  assert.equal(yearsWith53Weeks, 71);
});
test('week arithmetic handles low years and weeks crossing daylight-saving changes', () => {
  assert.deepEqual(dates('0001-W01'), { allDay: true, start: '0001-01-01', end: '0001-01-08' });
  assert.deepEqual(dates('2026-W13'), { allDay: true, start: '2026-03-23', end: '2026-03-30' });
  assert.deepEqual(dates('2026-W43'), { allDay: true, start: '2026-10-19', end: '2026-10-26' });
});
test('whole months, leap years and period ends are inclusive', () => {
  assert.equal(dates('2024-02').end, '2024-03-01');
  assert.equal(dates('2026-02').end, '2026-03-01');
  assert.equal(dates('2026-12').end, '2027-01-01');
  assert.equal(dates('2026-11-22', '2026').end, '2027-01-01');
  assert.equal(dates('2026-11-22', '2026-11').end, '2026-12-01');
  assert.deepEqual(dates('2026', '2026-01'), { allDay: true, start: '2026-01-01', end: '2026-02-01' });
  assert.deepEqual(dates('2026-11', 2027), { allDay: true, start: '2026-11-01', end: '2028-01-01' });
});
test('period precision is retained and invalid/ambiguous partial inputs are rejected', () => {
  assert.equal(parseDate(2026)?.kind === 'date' && (parseDate(2026) as { precision: string }).precision, 'year');
  for (const input of [26, 999, 2026.5, 20261122, NaN, Infinity, '2026-00', '2026-13', '2026-1', '26', '2026T10:00', '2026-11 10:00', '2026-11-22  10:00']) assert.equal(parseDate(input), null, String(input));
  assert.equal(convertDates('2026-11', '2026-10').reason, 'end before start');
  assert.equal(convertDates('2026', '2026-11-22T10:00').reason, 'mixed date/date-time range');
  assert.equal(convertDates('2026-11-22 00:00').dates?.allDay, false);
});
test('invalid ends never silently receive the missing-end default', () => {
  for (const end of ['bad', ' ', '2026-02-30', '2026-11-23T09:00+30:00', '\u0000invalid']) {
    assert.equal(convertDates('2026-11-23T09:00', end).reason, 'invalid end', end);
  }
});
test('mixed, reversed and equal timed endpoints are omitted', () => {
  assert.equal(convertDates('2026-11-23', '2026-11-23T10:00').reason, 'mixed date/date-time range');
  assert.equal(convertDates('2026-11-23T10:00', '2026-11-23').reason, 'mixed date/date-time range');
  assert.equal(convertDates('2026-11-25', '2026-11-23').reason, 'end before start');
  assert.equal(convertDates('2026-11-23T10:00', '2026-11-23T09:00').reason, 'end before start');
  assert.equal(convertDates('2026-11-23T09:00', '2026-11-23T09:00').reason, 'equal timed endpoints');
  assert.equal(convertDates('2026-11-23T09:00+01:00', '2026-11-23T08:00Z').reason, 'equal timed endpoints');
});
test('nonexistent spring-forward local times are rejected; repeated times use native local resolution', () => {
  if (process.env.TZ === 'Europe/Berlin') {
    assert.equal(parseDate('2026-03-29T02:30'), null);
    assert.equal((dates('2026-10-25T02:30').start as Date).toISOString(), '2026-10-25T00:30:00.000Z');
  }
  if (process.env.TZ === 'America/New_York') assert.equal(parseDate('2026-03-08T02:30'), null);
});
test('fractional seconds and low years do not roll over silently', () => {
  assert.equal((dates('2026-11-23T09:00:00.1Z').start as Date).getUTCMilliseconds(), 100);
  assert.equal((dates('2026-11-23T09:00:00.123456Z').start as Date).getUTCMilliseconds(), 123);
  assert.equal((dates('0099-11-23T09:00').start as Date).getFullYear(), 99);
  assert.equal(dates('2024-02-29').end, '2024-03-01');
  assert.equal(convertDates('9999-12-31').reason, 'invalid start');
});
