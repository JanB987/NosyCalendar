import { addCalendarDays, convertDates, parseDate, type DateInput, type EventDates, type Parsed } from './dates';

export interface Mappings { start: string | null; end: string | null }
interface Field { key: string; present: boolean; value: unknown }
export interface MoveSnapshot {
  path: string;
  mappings: Mappings;
  start: Field;
  end?: Field;
  startInput: DateInput;
  endInput: DateInput;
  dates: EventDates;
}
export type MoveAccess = { snapshot: MoveSnapshot; reason?: never } | { reason: string; snapshot?: never };
export interface MovePlan { start: string; end?: string; dates: EventDates; writeStart?: boolean; writeEnd?: boolean }
type Timed = Extract<Parsed, { kind: 'time' }>;
const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const missing = (value: unknown) => value === undefined || value === null || value === '';
const input = (value: unknown): DateInput => typeof value === 'string' || typeof value === 'number' || value == null ? value : '\u0000invalid';

export function sameDateInput(left: DateInput, right: DateInput): boolean {
  if (missing(left) || missing(right)) return missing(left) && missing(right);
  const a = parseDate(left), b = parseDate(right);
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'date' && b.kind === 'date'
    ? a.precision === b.precision && a.value === b.value && a.last === b.last
    : a.kind === 'time' && b.kind === 'time' && +a.value === +b.value;
}

function noteKey(property: string | null): string | null {
  return property?.startsWith('note.') && property.length > 5 ? property.slice(5) : null;
}

/** The query remains authoritative; cached metadata can only establish a matching write target. */
export function prepareMove(path: string, mappings: Mappings, frontmatter: Record<string, unknown> | undefined,
  startInput: DateInput, endInput: DateInput): MoveAccess {
  return prepareEdit(path, mappings, frontmatter, startInput, endInput, 'move');
}

export function prepareResize(path: string, mappings: Mappings, frontmatter: Record<string, unknown> | undefined,
  startInput: DateInput, endInput: DateInput): MoveAccess {
  return prepareEdit(path, mappings, frontmatter, startInput, endInput, 'resize');
}

function prepareEdit(path: string, mappings: Mappings, frontmatter: Record<string, unknown> | undefined,
  startInput: DateInput, endInput: DateInput, kind: 'move' | 'resize'): MoveAccess {
  if (kind === 'resize' && !mappings.end) return { reason: 'Select an End note property in layout options to enable resize handles.' };
  const startKey = noteKey(mappings.start), endKey = noteKey(mappings.end);
  if (!startKey || (mappings.end !== null && !endKey)) return { reason: 'Formula/file mappings are display-only; choose writable note properties to edit.' };
  if (startKey === endKey) return { reason: 'Start and End must target different note properties to edit.' };
  if (!frontmatter) return { reason: 'Wait for note metadata to refresh before editing.' };
  const capture = (key: string): Field => ({ key, present: hasOwn(frontmatter, key), value: frontmatter[key] });
  const start = capture(startKey), end = endKey ? capture(endKey) : undefined;
  if (!start.present) return { reason: 'Wait for note metadata to refresh before editing.' };
  const rawStart = input(start.value), rawEnd = end ? input(end.value) : null;
  if (!sameDateInput(startInput, rawStart) || !sameDateInput(endInput, rawEnd)) return { reason: 'Note properties are updating; wait for Bases to refresh before dragging.' };
  const a = parseDate(rawStart), b = parseDate(rawEnd);
  if (kind === 'move' && ((a?.kind === 'date' && a.precision !== 'day') || (b?.kind === 'date' && b.precision !== 'day'))) {
    return { reason: 'Body dragging year/month/week spans requires full dates.' };
  }
  const result = convertDates(rawStart, rawEnd);
  if (!result.dates) return { reason: 'Only valid date ranges can be dragged.' };
  return { snapshot: { path, mappings: { ...mappings }, start, end, startInput: rawStart, endInput: rawEnd, dates: result.dates } };
}

export function dropRestriction(snapshot: MoveSnapshot, allDay: boolean): string | null {
  if (missing(snapshot.endInput) || allDay === snapshot.dates.allDay) return null;
  const start = parseDate(snapshot.startInput), end = parseDate(snapshot.endInput);
  if (snapshot.dates.allDay && !allDay && start?.kind === 'date' && start.precision === 'day'
    && end?.kind === 'date' && end.precision === 'day' && start.value === end.value) return null;
  return 'Ranges with an End must stay in their all-day or timed area, except single-day all-day ranges moved into a time slot.';
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');
export function localCalendarDate(date: Date): string {
  const year = date.getFullYear();
  if (!Number.isFinite(+date) || year < 0 || year > 9999) throw new Error('The dropped date is outside the supported range.');
  return `${pad(year, 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Keep fixed-offset intent; offset-free fold times gain an offset only when needed to retain the instant. */
export function serializeTimed(date: Date, style?: Timed): string {
  if (!Number.isFinite(+date)) throw new Error('Invalid dropped time.');
  const offset = style?.offset;
  const digits = offset?.replace(':', '').slice(1);
  const offsetMinutes = offset && offset !== 'Z'
    ? (Number(digits!.slice(0, 2)) * 60 + Number(digits!.slice(2))) * (offset.startsWith('-') ? -1 : 1) : 0;
  const wall = offset ? new Date(+date + offsetMinutes * 60_000) : date;
  const year = offset ? wall.getUTCFullYear() : wall.getFullYear();
  if (year < 0 || year > 9999) throw new Error('The dropped date is outside the supported range.');
  const month = offset ? wall.getUTCMonth() : wall.getMonth();
  const day = offset ? wall.getUTCDate() : wall.getDate();
  const hour = offset ? wall.getUTCHours() : wall.getHours();
  const minute = offset ? wall.getUTCMinutes() : wall.getMinutes();
  const second = offset ? wall.getUTCSeconds() : wall.getSeconds();
  const ms = wall.getMilliseconds();
  const minimumDigits = ms === 0 ? 0 : ms % 10 !== 0 ? 3 : ms % 100 !== 0 ? 2 : 1;
  const fractionLength = Math.max(style?.fraction.length ?? 0, minimumDigits);
  const fraction = fractionLength ? '.' + (pad(ms, 3) + (style?.fraction.slice(3) ?? '')).slice(0, fractionLength) : '';
  let result = `${pad(year, 4)}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
  if (style?.seconds || second || fractionLength) result += `:${pad(second)}${fraction}`;
  if (offset) result += offset;
  else {
    const parsed = parseDate(result);
    if (parsed?.kind !== 'time' || +parsed.value !== +date) {
      const minutes = -date.getTimezoneOffset();
      result += `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
    }
  }
  const parsed = parseDate(result);
  if (parsed?.kind !== 'time' || +parsed.value !== +date) throw new Error('The dropped time cannot be represented without changing its instant.');
  return result;
}

function calendarDays(start: string, end: string): number {
  const utc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return +date;
  };
  return (utc(end) - utc(start)) / 86_400_000;
}

export function planMove(snapshot: MoveSnapshot, target: { start: Date; allDay: boolean }): MovePlan {
  const restriction = dropRestriction(snapshot, target.allDay);
  if (restriction) throw new Error(restriction);
  let start: string, end: string | undefined;
  if (target.allDay) {
    start = localCalendarDate(target.start);
    if (!missing(snapshot.endInput)) {
      const days = calendarDays(snapshot.dates.start as string, snapshot.dates.end as string);
      end = addCalendarDays(start, days - 1);
    }
  } else {
    const oldStart = parseDate(snapshot.startInput), oldEnd = parseDate(snapshot.endInput);
    const moved = new Date(+target.start);
    if (oldStart?.kind === 'time') {
      // The time grid is minute-based. Retain the original sub-minute position on every move.
      moved.setTime(+moved + (oldStart.value.getSeconds() - moved.getSeconds()) * 1000 + oldStart.value.getMilliseconds() - moved.getMilliseconds());
    }
    start = serializeTimed(moved, oldStart?.kind === 'time' ? oldStart : undefined);
    if (oldStart?.kind === 'time' && oldEnd?.kind === 'time') {
      end = serializeTimed(new Date(+moved + +oldEnd.value - +oldStart.value), oldEnd);
    } else if (!missing(snapshot.endInput)) {
      // A date-only range has no recoverable clock duration. The approved single-day conversion is 30 minutes.
      end = serializeTimed(new Date(+moved + 30 * 60_000));
    }
  }
  const result = convertDates(start, end);
  if (!result.dates) throw new Error(`Invalid drop: ${result.reason}.`);
  return { start, end, dates: result.dates };
}

export type ResizeEdge = 'start' | 'end';

/** Use the complete event range; the fixed endpoint never comes from a clipped segment/proposed mutation. */
export function planResize(snapshot: MoveSnapshot, edge: ResizeEdge,
  target: { start: Date; end: Date; allDay: boolean }): MovePlan | null {
  if (!snapshot.end || snapshot.start.key === snapshot.end.key) throw new Error('Resize requires distinct writable Start and End mappings.');
  if (target.allDay !== snapshot.dates.allDay) throw new Error('Resizing must keep the all-day or timed kind unchanged.');
  const a = parseDate(snapshot.startInput), b = parseDate(snapshot.endInput);
  const partial = (a?.kind === 'date' && a.precision !== 'day') || (b?.kind === 'date' && b.precision !== 'day');
  let start: string, end: string;
  if (target.allDay) {
    const first = edge === 'start' ? localCalendarDate(target.start) : snapshot.dates.start as string;
    const exclusiveEnd = edge === 'end' ? localCalendarDate(target.end) : snapshot.dates.end as string;
    const changed = edge === 'start' ? first !== snapshot.dates.start : exclusiveEnd !== snapshot.dates.end;
    if (!changed) return null;
    start = partial || edge === 'start' ? first : String(snapshot.startInput);
    end = partial || edge === 'end' || missing(snapshot.endInput) ? addCalendarDays(exclusiveEnd, -1) : String(snapshot.endInput);
  } else {
    const original = edge === 'start' ? snapshot.dates.start as Date : snapshot.dates.end as Date;
    const proposed = new Date(+(edge === 'start' ? target.start : target.end));
    // Native day-grid resizing adds calendar days; time-grid snapping retains the sub-minute position.
    proposed.setTime(+proposed + (original.getSeconds() - proposed.getSeconds()) * 1000 + original.getMilliseconds() - proposed.getMilliseconds());
    if (+proposed === +original) return null;
    start = edge === 'start' ? serializeTimed(proposed, a?.kind === 'time' ? a : undefined) : String(snapshot.startInput);
    end = edge === 'end' ? serializeTimed(proposed, b?.kind === 'time' ? b : a?.kind === 'time' ? a : undefined)
      : missing(snapshot.endInput) ? serializeTimed(snapshot.dates.end as Date, a?.kind === 'time' ? a : undefined) : String(snapshot.endInput);
  }
  const result = convertDates(start, end);
  if (!result.dates) throw new Error(`Invalid resize: ${result.reason}.`);
  return { start, end, dates: result.dates,
    writeStart: Boolean(partial || edge === 'start'), writeEnd: Boolean(partial || edge === 'end' || missing(snapshot.endInput)) };
}

export interface WriteHost {
  isCurrent(): boolean;
  processFrontMatter(callback: (frontmatter: Record<string, unknown>) => void): Promise<void>;
}

export async function persistMove(snapshot: MoveSnapshot, plan: MovePlan, host: WriteHost): Promise<void> {
  const guard = () => {
    if (!host.isCurrent()) throw new Error('The note, view or property mappings changed. Drag again from refreshed results.');
  };
  guard();
  await host.processFrontMatter(frontmatter => {
    guard();
    // Check both fields before mutating either; compare representation and absence, not just parsed dates.
    for (const field of [snapshot.start, snapshot.end]) {
      if (field && (hasOwn(frontmatter, field.key) !== field.present || !Object.is(frontmatter[field.key], field.value))) {
        throw new Error('A mapped date property changed during the gesture. Your edit was kept; try again.');
      }
    }
    const result = convertDates(plan.start, plan.end);
    if (!result.dates) throw new Error(`Invalid saved range: ${result.reason}.`);
    if (plan.writeStart !== false) Object.defineProperty(frontmatter, snapshot.start.key, { value: plan.start, enumerable: true, writable: true, configurable: true });
    if (snapshot.end && plan.end !== undefined && plan.writeEnd !== false) {
      Object.defineProperty(frontmatter, snapshot.end.key, { value: plan.end, enumerable: true, writable: true, configurable: true });
    }
  });
}

/** One coordinator per plugin, shared by all of its Bases views. */
export class SerialSaves {
  private tails = new Map<string, Promise<unknown>>();
  isBusy(path: string): boolean { return this.tails.has(path); }
  async run<T>(path: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(path) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(work);
    this.tails.set(path, task);
    try { return await task; }
    finally { if (this.tails.get(path) === task) this.tails.delete(path); }
  }
}
