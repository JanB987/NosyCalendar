import { DateValue, NullValue, NumberValue, StringValue, type Value } from 'obsidian';
import { parseDate, type DateInput } from './dates';

export function dateInput(value: Value | null, original?: unknown): DateInput {
  if (value === null || value instanceof NullValue) return null;
  // Public serialization retains DateValue's date-only/time distinction, including midnight.
  // Reject lists, numbers, booleans and errors even if their display text looks like a date.
  if (value instanceof DateValue) {
    // Native serialization normalizes offsets to wall time and drops milliseconds.
    // Recover the exact note input only when public equality confirms it is the same value.
    if (typeof original === 'string' || typeof original === 'number') {
      const period = parseDate(original);
      const normalized = period?.kind === 'date' ? period.value : String(original).replace(' ', 'T');
      const parsed = DateValue.parseFromString(normalized);
      if (parsed && value.equals(parsed)) return original;
    }
    return value.toString();
  }
  if (value instanceof StringValue) return value.toString();
  if (value instanceof NumberValue) {
    const text = value.toString();
    if (/^\d{4}$/.test(text)) return Number(text);
  }
  return '\u0000invalid';
}
