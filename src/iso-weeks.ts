export interface IsoWeek { year: number; week: number }

/** UTC arithmetic on local calendar components: independent of DST and the display locale. */
export function isoWeek(date: Date): IsoWeek {
  if (!Number.isFinite(+date)) throw new RangeError('Invalid ISO week date.');
  const thursday = new Date(0);
  thursday.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setUTCDate(thursday.getUTCDate() + 3 - (thursday.getUTCDay() + 6) % 7);
  const year = thursday.getUTCFullYear(), first = new Date(0);
  first.setUTCFullYear(year, 0, 4);
  first.setUTCDate(4 + 3 - (first.getUTCDay() + 6) % 7);
  return { year, week: 1 + Math.round((+thursday - +first) / (7 * 86_400_000)) };
}
const number = (week: number) => `W${String(week).padStart(2, '0')}`;
const label = ({year, week}: IsoWeek) => `${String(year).padStart(4,'0')}-${number(week)}`;

/** currentStart/currentEnd describe the nominal period, not adjacent grid spillover. End is exclusive. */
export function isoPeriod(start: Date, exclusiveEnd: Date, mode: string): string {
  const first = isoWeek(start);
  if (mode === 'timeGridDay' || mode === 'timeGridWeek') return label(first);
  const lastDay = new Date(+exclusiveEnd); lastDay.setDate(lastDay.getDate() - 1);
  const last = isoWeek(lastDay);
  if (first.year !== last.year) return `${label(first)} – ${label(last)}`;
  return first.week === last.week ? label(first) : `${label(first)}–${number(last.week)}`;
}
