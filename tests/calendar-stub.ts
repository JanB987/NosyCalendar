import type { CalendarOptions, EventInput, EventSourceApi } from '@fullcalendar/core';

/** Calendar callback double: no FullCalendar rendering or Obsidian runtime. */
export class Calendar {
  static instances: Calendar[] = [];
  events: EventInput[] = [];
  destroyed = false;
  replacements = 0;
  constructor(_host: HTMLElement, public options: CalendarOptions) { Calendar.instances.push(this); }
  render(): void {}
  updateSize(): void {}
  getOption<K extends keyof CalendarOptions>(key: K): CalendarOptions[K] { return this.options[key]; }
  setOption<K extends keyof CalendarOptions>(key: K, value: CalendarOptions[K]): void { this.options[key] = value; }
  destroy(): void { this.destroyed = true; }
  batchRendering(callback: () => void): void { callback(); }
  addEventSource(events: EventInput[]): EventSourceApi {
    this.replacements++;
    this.events = events.slice();
    return { remove: () => { this.events = []; } } as unknown as EventSourceApi;
  }
}
