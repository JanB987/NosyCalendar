import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { App, BasesQueryResult, BasesViewConfig, QueryController } from 'obsidian';
import type { DatesSetArg, DayHeaderContentArg } from '@fullcalendar/core';
import { Calendar } from './calendar-stub';
import { NosyCalendarView } from '../src/view';
import { SerialSaves } from '../src/writeback';
import { installDomHelpers } from './dom-helpers.mjs';

test('view roots and detached header callbacks use the target document while another window is focused', () => {
  const focused = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const popout = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  for (const dom of [focused, popout]) installDomHelpers(dom.window.document);
  globalThis.document = focused.window.document;
  Object.defineProperty(globalThis, 'activeWindow', { configurable: true, value: focused.window });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  const app = { metadataCache: { on() {}, offref() {} }, workspace: { on() {}, offref() {} } } as unknown as App;
  const host = popout.window.document.body.createDiv();
  const view = new NosyCalendarView({ app } as unknown as QueryController, host, () => {}, new SerialSaves());
  view.config = { get: () => [], getAsPropertyId: () => null } as unknown as BasesViewConfig;
  view.data = { data: [] } as unknown as BasesQueryResult;
  try {
    view.onload();
    for (const selector of ['.nosy-calendar', '.nosy-calendar-status', '.nosy-calendar-host']) {
      assert.equal(host.querySelector(selector)?.ownerDocument, popout.window.document);
    }
    const calendar = Calendar.instances.at(-1)!;
    const header = calendar.options.dayHeaderContent;
    assert.equal(typeof header, 'function');
    const content = (header as (info: DayHeaderContentArg) => { domNodes: HTMLElement[] })({ date: new Date(2026, 10, 23), view: { type: 'timeGridWeek' } } as DayHeaderContentArg);
    assert.deepEqual(content.domNodes.map(node => node.className), ['nosy-weekday', 'nosy-header-date']);
    for (const node of content.domNodes) {
      assert.equal(node.ownerDocument, popout.window.document); assert.equal(node.parentNode, null);
    }
    const title = host.querySelector<HTMLElement>('.nosy-calendar-host')!.createDiv();
    title.createEl('h2', { cls: 'fc-toolbar-title' });
    const datesSet = calendar.options.datesSet!;
    datesSet({ view: { currentStart: new Date(2026, 10, 23), currentEnd: new Date(2026, 10, 30), type: 'timeGridWeek' } } as DatesSetArg);
    assert.equal(title.querySelector('.nosy-iso-indicator')?.ownerDocument, popout.window.document);
    assert.equal(title.querySelector('.nosy-iso-indicator')?.textContent, '2026-W48');
    assert.equal(document, focused.window.document);
  } finally { view.unload(); popout.window.close(); focused.window.close(); }
});
