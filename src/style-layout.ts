import type { Calendar } from '@fullcalendar/core';
import { geometryDefaults } from './style-defaults';

/** CSS stays live; geometry-affecting values are pinned only for the lifetime of a gesture/save. */
export class StyleLayout {
  private frame: number | null = null;
  private observer: MutationObserver | null = null;
  private frozen: Record<string, string> | null = null;
  private pinned = new Set<HTMLElement>();
  private signature = '';
  private disposed = false;
  private id = `nosy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  constructor(private root: HTMLElement, private calendar: Calendar, private busy: () => boolean) {
    const doc = root.ownerDocument;
    if (typeof MutationObserver === 'function' && doc.head && doc.body) {
      this.observer = new MutationObserver(() => this.request());
      this.observer.observe(doc.head, { childList: true, subtree: true, characterData: true, attributes: true });
      this.observer.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style'] });
      this.observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    this.request();
  }
  private values(): Record<string, string> {
    const style = this.root.ownerDocument.defaultView!.getComputedStyle(this.root);
    return Object.fromEntries(Object.entries(geometryDefaults).map(([key, fallback]) => [key, style.getPropertyValue(key).trim() || fallback]));
  }
  request(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.root.ownerDocument.defaultView!.requestAnimationFrame(() => {
      this.frame = null;
      if (this.disposed || this.busy()) return; // release() schedules the deferred work.
      const values = this.values(), signature = JSON.stringify(values);
      if (signature === this.signature) return;
      this.signature = signature;
      const number = (key: string, min: number, max: number) => Math.min(max, Math.max(min, parseFloat(values[key]!) || parseFloat(geometryDefaults[key]!)));
      const height = number('--nosy-calendar-event-min-height', 24, 80), width = number('--nosy-calendar-year-min-width', 200, 520);
      this.calendar.batchRendering(() => {
        if (this.calendar.getOption('eventMinHeight') !== height) this.calendar.setOption('eventMinHeight', height);
        if (this.calendar.getOption('multiMonthMinWidth') !== width) this.calendar.setOption('multiMonthMinWidth', width);
        // In v6, updateSize alone can leave memoized slat coordinates unchanged after CSS-only sizing.
        // Reapply the same public duration value with fresh identity to remeasure slats; never change times.
        const duration = this.calendar.getOption('slotDuration');
        if (duration && typeof duration === 'object') this.calendar.setOption('slotDuration', { ...duration });
        else if (duration == null) this.calendar.setOption('slotDuration', { minutes: 30 });
      });
      if (this.root.clientWidth > 0 && this.root.clientHeight > 0) this.calendar.updateSize();
    });
  }
  mount(element: HTMLElement): void {
    element.dataset.nosyView = this.id;
    if (this.frozen) this.pin(element);
  }
  unmount(element: HTMLElement): void { this.pinned.delete(element); }
  private pin(element: HTMLElement): void {
    for (const [key, value] of Object.entries(this.frozen!)) element.style.setProperty(key, value);
    this.pinned.add(element);
  }
  freeze(elements: Iterable<HTMLElement>): void {
    if (this.frozen || this.disposed) return;
    this.frozen = this.values(); this.pin(this.root);
    for (const element of elements) this.pin(element);
  }
  release(): void {
    if (!this.frozen) return;
    // FullCalendar's floating body-drag mirror is a clone outside the view root.
    for (const element of this.root.ownerDocument.querySelectorAll<HTMLElement>(`[data-nosy-view="${this.id}"]`)) this.pinned.add(element);
    for (const element of this.pinned) for (const key of Object.keys(this.frozen)) element.style.removeProperty(key);
    this.pinned.clear(); this.frozen = null; this.request();
  }
  dispose(): void {
    this.disposed = true; this.release(); this.observer?.disconnect(); this.observer = null;
    if (this.frame !== null) this.root.ownerDocument.defaultView!.cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
