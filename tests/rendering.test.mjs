import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

// Real FullCalendar modules with a headless DOM and synthetic geometry, not Obsidian/browser visual testing.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const win = dom.window;
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'DOMParser']) {
  globalThis[key] = key === 'window' ? win : win[key];
}
globalThis.getComputedStyle = win.getComputedStyle.bind(win);
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
let hitElement = document.body;
document.elementFromPoint = () => hitElement;
for (const key of ['clientWidth', 'offsetWidth']) Object.defineProperty(win.HTMLElement.prototype, key, { configurable: true, get: () => 1000 });
for (const key of ['clientHeight', 'offsetHeight']) Object.defineProperty(win.HTMLElement.prototype, key, { configurable: true, get: () => 600 });
Object.defineProperty(win.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement ?? document.body; } });
win.HTMLElement.prototype.getBoundingClientRect = function () {
  const rowEl = this.tagName === 'TR' ? this : this.tagName === 'TD' ? this.parentElement : null;
  const row = rowEl ? [...rowEl.parentElement.children].indexOf(rowEl) : -1;
  const top = row < 0 ? 0 : row * 100;
  const height = row < 0 ? 600 : 100;
  return { x: 0, y: top, left: 0, top, right: 1000, bottom: top + height, width: 1000, height, toJSON() { return {}; } };
};
const { Calendar } = await import('@fullcalendar/core');
const { default: timeGrid } = await import('@fullcalendar/timegrid');
const { default: dayGrid } = await import('@fullcalendar/daygrid');
const { default: multiMonth } = await import('@fullcalendar/multimonth');
const { default: interaction } = await import('@fullcalendar/interaction');
const require = createRequire(import.meta.url);
const { resizeRendering, eventClasses, eventContents } = require('../.test-build/handles.cjs');
after(() => dom.window.close());

function render(view, events, extra = {}) {
  const host = document.createElement('div'); document.body.append(host);
  const calendar = new Calendar(host, {
    ...resizeRendering, plugins: [timeGrid, dayGrid, multiMonth, interaction],
    initialView: view, initialDate: '2026-11-23', firstDay: 1, timeZone: 'local', height: 600,
    eventDurationEditable: false, eventStartEditable: false, dayMaxEvents: false,
    eventClassNames: eventClasses, eventContent: info => eventContents(document, info),
    eventDidMount: info => {
      info.el.dataset.note = info.event.id;
      info.el.dataset.realStart = String(info.isStart);
      info.el.dataset.realEnd = String(info.isEnd);
    }, events, ...extra
  });
  calendar.render();
  return { host, calendar, close: () => { calendar.destroy(); host.remove(); } };
}
const event = (id, start, end, allDay = true, enabled = true) => ({ id, title: id, start, end, allDay, durationEditable: enabled, startEditable: enabled });

for (const mode of ['timeGridWeek', 'timeGridDay', 'dayGridMonth', 'multiMonthYear']) {
  test(`real ${mode}: both handles on short timed and single-day events; disabled events have none`, () => {
    const f = render(mode, [event('short', '2026-11-23T09:00', '2026-11-23T09:05', false),
      { ...event('single', '2026-11-23', '2026-11-24'), startEditable: false }, event('disabled', '2026-11-23', '2026-11-24', true, false)]);
    try {
      for (const id of ['short', 'single']) {
        const nodes = f.host.querySelectorAll(`[data-note="${id}"]`);
        assert.ok(nodes.length, `${mode}: ${id} was not rendered`);
        assert.equal([...nodes].reduce((sum, node) => sum + node.querySelectorAll('.fc-event-resizer-start').length, 0), 1, `${mode}: ${id} start`);
        assert.equal([...nodes].reduce((sum, node) => sum + node.querySelectorAll('.fc-event-resizer-end').length, 0), 1, `${mode}: ${id} end`);
      }
      assert.equal(f.host.querySelectorAll('[data-note="disabled"] .fc-event-resizer').length, 0);
      if (mode === 'dayGridMonth' || mode === 'multiMonthYear') {
        assert.equal(f.host.querySelectorAll('[data-note="short"] .nosy-resize-fallback').length, 2);
        assert.ok(f.host.querySelector('[data-note="short"].fc-daygrid-block-event'));
      }
    } finally { f.close(); }
  });
  test(`real ${mode}: continuation segments expose only actual endpoints`, () => {
    const f = render(mode, [event('long', '2026-10-01', '2026-12-20'), event('timed-span', '2026-11-22T23:00', '2026-11-25T01:00', false)]);
    try {
      const nodes = f.host.querySelectorAll('[data-note]');
      assert.ok(nodes.length);
      for (const node of nodes) {
        if (node.dataset.realStart !== 'true') assert.equal(node.querySelectorAll('.fc-event-resizer-start').length, 0);
        if (node.dataset.realEnd !== 'true') assert.equal(node.querySelectorAll('.fc-event-resizer-end').length, 0);
      }
      const long = f.host.querySelectorAll('[data-note="long"]');
      assert.ok(long.length);
      assert.equal([...long].reduce((sum, node) => sum + node.querySelectorAll('.fc-event-resizer').length, 0), mode === 'multiMonthYear' ? 2 : 0);
    } finally { f.close(); }
  });
}
for (const mode of ['dayGridMonth', 'multiMonthYear']) {
  test(`real ${mode}: fallback handles enter the native resize interaction rather than body dragging`, async () => {
    let resizeStarted = 0, resizeStopped = 0, moveStarted = 0;
    // June starts on Monday: the synthetic first-cell hit is active even with Year's hidden adjacent-month cells.
    const f = render(mode, [event('timed', '2026-06-15T09:00', '2026-06-15T10:00', false)], {
      initialDate: '2026-06-15',
      dragRevertDuration: 0,
      eventResizeStart: () => { resizeStarted++; }, eventResizeStop: () => { resizeStopped++; },
      eventDragStart: () => { moveStarted++; }
    });
    try {
      const handle = f.host.querySelector('[data-note="timed"] .fc-event-resizer-end');
      assert.ok(handle?.classList.contains('nosy-resize-fallback'));
      hitElement = handle;
      handle.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
      document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 120, clientY: 100 }));
      document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 120, clientY: 100 }));
      await new Promise(resolve => setTimeout(resolve, 0)); // FullCalendar deliberately completes pointer-up asynchronously.
      await new Promise(resolve => win.requestAnimationFrame(resolve));
      assert.equal(resizeStarted, 1);
      assert.equal(resizeStopped, 1);
      assert.equal(moveStarted, 0);
    } finally { hitElement = document.body; f.close(); }
  });
  test(`real ${mode}: overflow entries retain a start handle without inventing a clipped end`, async () => {
    const f = render(mode, [event('a-blocker', '2026-11-23', '2026-11-24'),
      { ...event('z-overflow', '2026-11-23', '2026-11-26'), backgroundColor: '#112233', borderColor: '#abcdef', textColor: '#ffffff' }], { dayMaxEvents: 1, eventOrder: 'title' });
    try {
      const link = f.host.querySelector('[data-date="2026-11-23"] .fc-daygrid-more-link');
      assert.ok(link, `${mode}: missing overflow link`);
      link.click();
      await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
      const entry = f.host.querySelector('.fc-popover [data-note="z-overflow"]');
      assert.ok(entry, `${mode}: overflow event missing`);
      assert.equal(entry.style.backgroundColor, 'rgb(17, 34, 51)');
      assert.equal(entry.style.borderColor, 'rgb(171, 205, 239)');
      assert.equal(entry.querySelector('.fc-event-main').style.color, 'rgb(255, 255, 255)');
      assert.equal(entry.querySelectorAll('.fc-event-resizer-start').length, 1);
      assert.equal(entry.querySelectorAll('.fc-event-resizer-end').length, 0);
    } finally { f.close(); }
  });
}
