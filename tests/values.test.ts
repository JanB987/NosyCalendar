import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateValue, NullValue, NumberValue, StringValue, type Value } from 'obsidian';
import { dateInput } from '../src/values';
import { convertDates } from '../src/dates';

test('public native date/date-time serialization retains explicit midnight', () => {
  assert.equal(dateInput(DateValue.parseFromString('2026-11-23')), '2026-11-23');
  const input = dateInput(DateValue.parseFromString('2026-11-23T00:00:00'));
  assert.equal(convertDates(input).dates?.allDay, false);
});

test('numeric years are accepted without broadly coercing numbers', () => {
  assert.equal(dateInput(new NumberValue(2026)), 2026);
  for (const value of [26, 2026.5, 20261122, Infinity, NaN]) assert.equal(convertDates(dateInput(new NumberValue(value))).reason, 'invalid start');
});
test('date-looking display text from lists, booleans or errors is not treated as a date', () => {
  for (const text of ['2026', '2026-11-23', '2026-11-23T09:00']) {
    const otherValue = { toString: () => text, isTruthy: () => true } as unknown as Value;
    assert.equal(convertDates(dateInput(otherValue)).reason, 'invalid start');
  }
});
test('native period normalization does not erase original precision', () => {
  const year = DateValue.parseFromString('2026-01-01');
  assert.equal(dateInput(year, '2026'), '2026');
  assert.equal(dateInput(year, 2026), 2026);
  assert.equal(dateInput(year, '2027'), '2026-01-01');
  assert.equal(dateInput(DateValue.parseFromString('2026-11-01'), '2026-11'), '2026-11');
  assert.equal(convertDates(dateInput(DateValue.parseFromString('2026-11-01'), '2026-11')).dates?.end, '2026-12-01');
});
test('Bases adapters preserve both original week spellings and evaluated-value authority', () => {
  for (const original of ['2026W48', '2026-W48']) {
    assert.equal(dateInput(new StringValue(original)), original);
    assert.equal(dateInput(DateValue.parseFromString('2026-11-23'), original), original);
    assert.deepEqual(convertDates(dateInput(new StringValue(original))), {
      dates: { allDay: true, start: '2026-11-23', end: '2026-11-30' }
    });
    assert.equal(dateInput(DateValue.parseFromString('2026-11-24'), original), '2026-11-24');
    assert.equal(dateInput(new StringValue('2026-12-01'), original), '2026-12-01');
  }
});
test('native space-separated values retain seconds and fractions', () => {
  const original = '2026-11-22 10:00:00.125';
  assert.equal(dateInput(DateValue.parseFromString('2026-11-22T10:00:00.125'), original), original);
});
test('matching original native input retains offsets and precision', () => {
  const original = '2026-10-25T02:15:00.125+01:00';
  const value = DateValue.parseFromString(original);
  assert.ok(value);
  assert.equal(dateInput(value, original), original);
  assert.equal((convertDates(dateInput(value, original)).dates?.start as Date).toISOString(), '2026-10-25T01:15:00.125Z');
});
test('different cached metadata cannot override the evaluated Bases value', () => {
  const value = DateValue.parseFromString('2026-11-23T09:00:00');
  assert.ok(value);
  assert.equal(dateInput(value, '2026-11-24T09:00:00'), '2026-11-23T09:00:00');
  assert.equal(dateInput(value, 'bad'), '2026-11-23T09:00:00');
});
test('only null is missing; strict string values still undergo date validation', () => {
  assert.equal(dateInput(null), null);
  assert.equal(dateInput(NullValue.value), null);
  assert.equal(dateInput(new StringValue('2026-11-23'), '2026-11-24'), '2026-11-23');
  assert.equal(convertDates(dateInput(new StringValue('23/11/2026'))).reason, 'invalid start');
});
