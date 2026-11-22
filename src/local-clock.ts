import { localCalendarDate } from './writeback';

type ClockWindow = Pick<Window, 'setTimeout' | 'clearTimeout' | 'addEventListener' | 'removeEventListener'>;
type ClockDocument = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
export function clockSignature(date: Date): string {
  return `${localCalendarDate(date)}|${date.getTimezoneOffset()}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
}
export function nextClockDelay(now: Date): number {
  const midnight = new Date(+now); midnight.setHours(24, 0, 0, 0);
  return Math.max(1, Math.min(60_000, +midnight - +now + 25));
}

/** Midnight boundary plus focus/resume checks and a bounded timezone/clock-change poll. */
export function watchLocalClock(win: ClockWindow, doc: ClockDocument, changed: () => void, now = () => new Date()): () => void {
  let signature = clockSignature(now()), timer = 0, disposed = false;
  const check = (force = false) => {
    if (disposed) return;
    win.clearTimeout(timer);
    const current = now(), next = clockSignature(current);
    if (force || next !== signature) { signature = next; changed(); }
    timer = win.setTimeout(() => check(), nextClockDelay(current));
  };
  const resume = () => check(true);
  const visible = () => { if (!doc.hidden) resume(); };
  win.addEventListener('focus', resume); win.addEventListener('pageshow', resume);
  doc.addEventListener('visibilitychange', visible);
  check();
  return () => {
    disposed = true; win.clearTimeout(timer);
    win.removeEventListener('focus', resume); win.removeEventListener('pageshow', resume);
    doc.removeEventListener('visibilitychange', visible);
  };
}
