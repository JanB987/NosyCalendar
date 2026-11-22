import type { CalendarOptions, EventContentArg } from '@fullcalendar/core';

export const resizeRendering: CalendarOptions = {
  eventResizableFromStart: true,
  eventDisplay: 'block',
  eventMinHeight: 28
};

export function eventClasses(info: EventContentArg): string[] {
  const status = ['nosy-event', ...(info.event.extendedProps.rolled ? ['nosy-rolled-event'] : [])];
  if (typeof info.event.extendedProps.roleLabel === 'string' && info.event.extendedProps.roleLabel) status.push('nosy-role-event');
  if (!info.event.durationEditable) return status;
  return [...status, 'nosy-resize-enabled', 'fc-event-resizable',
    ...(info.isStart ? [] : ['nosy-continuation-start']), ...(info.isEnd ? [] : ['nosy-continuation-end'])];
}

export function eventContents(doc: Document, info: EventContentArg): { domNodes: HTMLElement[] } {
  const title = doc.createElement('span');
  title.className = 'fc-event-title';
  const noteTitle = typeof info.event.extendedProps.noteTitle === 'string' ? info.event.extendedProps.noteTitle : info.event.title;
  title.textContent = noteTitle;
  const copy = doc.createElement('div'); copy.className = 'nosy-event-copy'; copy.append(title);
  if (info.timeText) {
    const time = doc.createElement('span'); time.className = 'nosy-event-time'; time.textContent = info.timeText; copy.append(time);
  }
  const domNodes: HTMLElement[] = [copy];
  if (typeof info.event.extendedProps.roleLabel === 'string' && info.event.extendedProps.roleLabel) {
    const role = doc.createElement('span'); role.className = 'nosy-role-label';
    role.textContent = info.event.extendedProps.roleLabel;
    // The event's accessible label and tooltip already include the full role name.
    role.setAttribute('aria-hidden', 'true'); domNodes.push(role);
  }
  if (info.event.extendedProps.rolled) {
    const rolled = doc.createElement('span'); rolled.className = 'nosy-rolled-label'; rolled.textContent = 'Rolled';
    const original = doc.createElement('span'); original.className = 'nosy-original-dates';
    original.textContent = `Original: ${String(info.event.extendedProps.originalDatesText)}`;
    copy.append(rolled, original);
  }
  if (info.event.durationEditable && !info.isMirror) {
    for (const edge of ['start', 'end'] as const) {
      // FullCalendar v6 omits native handles for timed day-grid events and resliced overflow segments.
      // These fallback elements use its delegated native resizing interaction, not a separate drag engine.
      if ((edge === 'start' ? info.isStart && !info.isStartResizable : info.isEnd && !info.isEndResizable)) {
        const handle = doc.createElement('span');
        handle.className = `fc-event-resizer fc-event-resizer-${edge} nosy-resize-fallback`;
        handle.title = `Resize ${edge}`;
        handle.setAttribute('aria-label', `Resize ${edge}`);
        domNodes.push(handle);
      }
    }
  }
  return { domNodes };
}
