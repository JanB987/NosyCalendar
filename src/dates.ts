/** Only four-digit integer numbers are accepted as YAML years. */
export type DateInput = string | number | null | undefined;
export type Parsed =
  | { kind: 'date'; value: string; last: string; precision: 'year' | 'month' | 'week' | 'day' }
  | { kind: 'time'; value: Date; seconds: boolean; fraction: string; offset: string | undefined };
export type Omission = 'missing start' | 'invalid start' | 'invalid end' | 'mixed date/date-time range' | 'end before start' | 'equal timed endpoints';
export type EventDates = { allDay: boolean; start: string | Date; end: string | Date };
export type Conversion = { dates: EventDates; reason?: never } | { reason: Omission; dates?: never };

function validDate(year: number, month: number, day: number): boolean {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isoWeekMonday(year: number): Date {
  // ISO week 1 contains January 4. UTC calendar arithmetic is independent of timezone and display firstDay.
  const monday = new Date(0);
  monday.setUTCFullYear(year, 0, 4);
  monday.setUTCDate(4 - (monday.getUTCDay() + 6) % 7);
  return monday;
}

export function parseDate(input: DateInput): Parsed | null {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 1000 || input > 9999) return null;
    input = String(input);
  }
  if (typeof input !== 'string') return null;
  const weekInput = /^(\d{4})-?W(\d{2})$/.exec(input);
  if (weekInput) {
    const year = Number(weekInput[1]), week = Number(weekInput[2]);
    if (week < 1 || week > 53) return null;
    const monday = isoWeekMonday(year);
    monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
    // A nonexistent week 53 must not spill into the following ISO week-year.
    if (monday >= isoWeekMonday(year + 1)) return null;
    const sunday = new Date(+monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    if (monday.getUTCFullYear() < 0 || sunday.getUTCFullYear() > 9999) return null;
    return { kind: 'date', value: monday.toISOString().slice(0, 10), last: sunday.toISOString().slice(0, 10), precision: 'week' };
  }
  const period = /^(\d{4})(?:-(\d{2}))?$/.exec(input);
  if (period) {
    const year = period[1]!, month = period[2];
    if (month === undefined) return { kind: 'date', value: `${year}-01-01`, last: `${year}-12-31`, precision: 'year' };
    if (Number(month) < 1 || Number(month) > 12) return null;
    const last = new Date(0);
    last.setUTCFullYear(Number(year), Number(month), 0);
    return { kind: 'date', value: `${year}-${month}-01`, last: `${year}-${month}-${last.getUTCDate()}`, precision: 'month' };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(input);
  if (!match) return null;
  const [, y, m, d, h, min, s, fraction, offset] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  if (!validDate(year, month, day)) return null;
  if (h === undefined) return { kind: 'date', value: input, last: input, precision: 'day' };
  const hour = Number(h), minute = Number(min), second = Number(s ?? 0);
  const ms = Number((fraction ?? '').slice(0, 3).padEnd(3, '0'));
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (offset && offset !== 'Z') {
    const digits = offset.slice(1).replace(':', '');
    if (Number(digits.slice(0, 2)) > 23 || Number(digits.slice(2)) > 59) return null;
  }
  let date: Date;
  if (offset) {
    const normalizedOffset = offset === 'Z' ? offset : offset.slice(0, 3) + ':' + offset.replace(':', '').slice(3);
    date = new Date(`${y}-${m}-${d}T${h}:${min}:${s ?? '00'}.${String(ms).padStart(3, '0')}${normalizedOffset}`);
  } else {
    date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(hour, minute, second, ms);
    // Reject nonexistent local wall times (spring-forward), rather than silently shifting them.
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
        date.getHours() !== hour || date.getMinutes() !== minute) return null;
  }
  return Number.isFinite(date.getTime()) ? { kind: 'time', value: date, seconds: s !== undefined, fraction: fraction ?? '', offset } : null;
}

export function nextCalendarDate(value: string): string {
  return addCalendarDays(value, 1);
}

export function addCalendarDays(value: string, days: number): string {
  // Calendar arithmetic in UTC avoids device-local DST and midnight transitions.
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day + days);
  const next = date.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new RangeError('Date exceeds supported ISO year');
  return next;
}

export function convertDates(startInput: DateInput, endInput?: DateInput): Conversion {
  if (startInput == null || startInput === '') return { reason: 'missing start' };
  const start = parseDate(startInput);
  if (!start) return { reason: 'invalid start' };
  const end = endInput == null || endInput === '' ? null : parseDate(endInput);
  if (endInput != null && endInput !== '' && !end) return { reason: 'invalid end' };
  if (end && start.kind !== end.kind) return { reason: 'mixed date/date-time range' };
  if (start.kind === 'date') {
    const last = end?.kind === 'date' ? end.last : start.last;
    if (last < start.value) return { reason: 'end before start' };
    try {
      return { dates: { allDay: true, start: start.value, end: nextCalendarDate(last) } };
    } catch { return { reason: end ? 'invalid end' : 'invalid start' }; }
  }
  const endDate = end?.kind === 'time' ? end.value : new Date(start.value.getTime() + 30 * 60_000);
  if (endDate < start.value) return { reason: 'end before start' };
  if (+endDate === +start.value) return { reason: 'equal timed endpoints' };
  return { dates: { allDay: false, start: start.value, end: endDate } };
}
