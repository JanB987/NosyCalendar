import { addCalendarDays, convertDates, parseDate, type DateInput, type EventDates } from './dates';
import { localCalendarDate, planMove, planResize, serializeTimed, type MovePlan, type MoveSnapshot, type ResizeEdge } from './writeback';

export interface DateProjection { dates: EventDates; rolled: boolean; originalText: string }
const missing = (value: DateInput) => value == null || value === '';
const originalText = (start: DateInput, end: DateInput) => String(start) + (missing(end) ? '' : ` → ${String(end)}`);
const utcDay = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const value = new Date(0); value.setUTCFullYear(year, month - 1, day); return +value;
};

/** Local calendar-day eligibility; source values and source query membership are never changed. */
export function projectDates(start: DateInput, end: DateInput, dates: EventDates, enabled: boolean, now = new Date()): DateProjection {
  const result = { dates, rolled: false, originalText: originalText(start, end) };
  if (!enabled) return result;
  const today = localCalendarDate(now);
  const midnight = new Date(+now); midnight.setHours(0, 0, 0, 0);
  const past = dates.allDay ? (dates.end as string) <= today
    : missing(end) ? localCalendarDate(dates.start as Date) < today : +(dates.end as Date) <= +midnight;
  if (!past) return result;
  if (dates.allDay) {
    const days = (utcDay(dates.end as string) - utcDay(dates.start as string)) / 86_400_000;
    return { ...result, rolled: true, dates: { allDay: true, start: today, end: addCalendarDays(today, days) } };
  }
  const source = dates.start as Date;
  const projected = new Date(0);
  projected.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  // ECMAScript's compatible local-time resolution advances spring gaps and chooses the earlier fall instance.
  projected.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), source.getMilliseconds());
  const projectedEnd = new Date(+projected + +(dates.end as Date) - +source);
  // Keep rendering inside the same supported date bounds as all other calendar entries.
  localCalendarDate(projected); localCalendarDate(projectedEnd);
  return { ...result, rolled: true, dates: { allDay: false, start: projected, end: projectedEnd } };
}

function displayedSnapshot(source: MoveSnapshot, projection: DateProjection): MoveSnapshot {
  if (!projection.rolled) return source;
  const a = parseDate(source.startInput), b = parseDate(source.endInput);
  const startInput = projection.dates.allDay ? projection.dates.start as string
    : serializeTimed(projection.dates.start as Date, a?.kind === 'time' ? a : undefined);
  const endInput = missing(source.endInput) ? source.endInput : projection.dates.allDay
    ? addCalendarDays(projection.dates.end as string, -1)
    : serializeTimed(projection.dates.end as Date, b?.kind === 'time' ? b : undefined);
  // Exact raw field snapshots remain historical for conflict checking; only editing anchors become projected.
  return { ...source, dates: projection.dates, startInput, endInput };
}

function sameRange(a: EventDates, b: EventDates): boolean {
  if (a.allDay !== b.allDay) return false;
  return a.allDay ? a.start === b.start && a.end === b.end : +a.start === +b.start && +a.end === +b.end;
}

export function planDisplayedMove(source: MoveSnapshot, projection: DateProjection, target: { start: Date; allDay: boolean }): MovePlan | null {
  const plan = planMove(displayedSnapshot(source, projection), target);
  if (sameRange(plan.dates, projection.dates)) return null;
  if (projection.rolled && plan.end === undefined) {
    const fallback = convertDates(plan.start).dates;
    if (!fallback || !sameRange(fallback, plan.dates)) {
      if (!source.end) throw new Error('Select an End mapping before moving this projected range.');
      const b = parseDate(source.endInput), a = parseDate(source.startInput);
      plan.end = plan.dates.allDay ? addCalendarDays(plan.dates.end as string, -1)
        : serializeTimed(plan.dates.end as Date, b?.kind === 'time' ? b : a?.kind === 'time' ? a : undefined);
      plan.writeEnd = true;
    }
  }
  return plan;
}

export function planDisplayedResize(source: MoveSnapshot, projection: DateProjection, edge: ResizeEdge,
  target: { start: Date; end: Date; allDay: boolean }): MovePlan | null {
  const plan = planResize(displayedSnapshot(source, projection), edge, target);
  if (plan && projection.rolled) { plan.writeStart = true; plan.writeEnd = true; }
  return plan;
}
