import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import type { Calendar } from '@fullcalendar/core';
import { TFile, StringValue, LinkValue, ListValue, NullValue, type App, type BasesEntry, type BasesQueryResult, type BasesViewConfig, type QueryController } from 'obsidian';
import { NosyCalendarView } from '../src/view';
import { SerialSaves } from '../src/writeback';
import { ROLES_KEY, type CalendarRole } from '../src/roles';
import { FuzzySuggestModal } from './obsidian-stub';
import type { PropertyPicker } from '../src/role-editor';
import { COLORS_KEY, type ColorRule, type Literal } from '../src/colors';
import { isoWeek } from '../src/iso-weeks';

// Real view, editor DOM and FullCalendar; only the unavailable Obsidian host APIs are doubled.
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
const win = dom.window;
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'DOMParser'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? win : win[key] });
}
globalThis.getComputedStyle = win.getComputedStyle.bind(win) as typeof getComputedStyle;
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
for (const key of ['clientWidth', 'offsetWidth']) Object.defineProperty(win.HTMLElement.prototype, key, { configurable: true, get: () => 1000 });
for (const key of ['clientHeight', 'offsetHeight']) Object.defineProperty(win.HTMLElement.prototype, key, { configurable: true, get: () => 600 });
Object.defineProperty(win.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement ?? document.body; } });
win.HTMLElement.prototype.getBoundingClientRect = function () {
  const rowEl = this.tagName === 'TR' ? this : this.tagName === 'TD' ? this.parentElement : null;
  const row = rowEl ? [...rowEl.parentElement!.children].indexOf(rowEl) : -1;
  const top = row < 0 ? 0 : row * 100, height = row < 0 ? 600 : 100;
  return { x: 0, y: top, left: 0, top, right: 1000, bottom: top + height, width: 1000, height, toJSON() { return {}; } };
};
let hitElement: Element = document.body, fallback: Element = document.body;
document.elementFromPoint = () => hitElement.isConnected ? hitElement : fallback;
const css = document.createElement('style'); css.textContent = readFileSync('styles.css', 'utf8'); document.head.append(css);
const frame = () => new Promise<void>(resolve => win.requestAnimationFrame(() => resolve()));
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!;
after(() => dom.window.close());

async function fixture(rolled = false) {
  const host = document.createElement('div'); document.body.append(host);
  const fm: Record<string, unknown> = { scheduled: rolled ? '2025-11-20T09:00' : '2026-11-23T09:00', until: rolled ? '2025-11-20T10:00' : '2026-11-23T10:00', 'Exact Other.Start': '2026-11-23T11:00' };
  const file = Object.assign(new TFile(), { path: 'event.md', basename: 'Note', extension: 'md' });
  const configValues: Record<string, unknown> = rolled ? { [ROLES_KEY]: [{ id: 'reminder', label: 'Reminder', startProperty: 'note.scheduled', endProperty: 'note.until', rollPastDates: true, edgeColor: '#123456' }] } : {};
  let writes = 0, opens = 0;
  const listeners = new Set<(...args: unknown[]) => void>();
  const app = { vault: { getMarkdownFiles: () => [file], getAbstractFileByPath: () => file },
    metadataCache: { getFileCache: () => ({ frontmatter: fm }), on: (_name: string, callback: (...args: unknown[]) => void) => { listeners.add(callback); return callback; }, offref: (callback: (...args: unknown[]) => void) => listeners.delete(callback) },
    workspace: { on() {}, offref() {}, getLeaf: () => ({ openFile: async () => { opens++; } }) },
    fileManager: { processFrontMatter: async (_file: TFile, callback: (value: Record<string, unknown>) => void) => {
      const draft = { ...fm }; callback(draft); Object.assign(fm, draft); writes++;
      for (const callback of listeners) callback(file);
      setData(); view.onDataUpdated();
    } }
  } as unknown as App;
  const view = new NosyCalendarView({ app } as unknown as QueryController, host, () => {}, new SerialSaves(), () => new Date(2026, 10, 23, 12));
  view.config = { get: (key: string) => configValues[key], getAsPropertyId: (key: string) => key === 'startProperty' ? 'note.scheduled' : 'note.until',
    set: (key: string, value: unknown) => { configValues[key] = structuredClone(value); view.onDataUpdated(); }
  } as unknown as BasesViewConfig;
  const setData = () => {
    const frozen = { ...fm };
    view.data = { data: [{ file, getValue: (property: string) => {
      const value = frozen[property.slice(property.indexOf('.') + 1)]; return typeof value === 'string' ? new StringValue(value) : NullValue.value;
    } } as unknown as BasesEntry] } as BasesQueryResult;
  };
  setData(); view.onload(); await frame(); await frame();
  const calendar = (view as unknown as { calendar: Calendar }).calendar;
  calendar.gotoDate('2026-11-23'); host.querySelector<HTMLButtonElement>('.fc-dayGridMonth-button')!.click(); await frame();
  return { host, fm, calendar, view, setData, configValues, writes: () => writes, opens: () => opens, close: () => { view.unload(); host.remove(); hitElement = fallback = document.body; } };
}

test('real calendar settings button opens the role editor; DOM edits save exact IDs and produce independent clickable events', async () => {
  const f = await fixture();
  try {
    f.host.querySelector<HTMLButtonElement>('.fc-calendarRoles-button')!.click();
    const editor = document.querySelector<HTMLElement>('.nosy-role-editor')!; assert.ok(editor);
    button(editor, '+ Add role').click();
    const row = editor.querySelectorAll<HTMLElement>('.nosy-role-row')[1]!;
    const input = row.querySelector<HTMLInputElement>('[aria-label="Role label"]')!;
    input.value = 'Custom role'; input.dispatchEvent(new win.Event('input', { bubbles: true }));
    row.querySelector<HTMLButtonElement>('[aria-label="Start property"]')!.click();
    const picker = FuzzySuggestModal.instances[FuzzySuggestModal.instances.length - 1] as unknown as PropertyPicker;
    assert.ok(picker.getItems().includes('note.Exact Other.Start'));
    picker.onChooseItem('note.Exact Other.Start'); picker.close();
    button(editor, 'Save').click(); await frame(); await frame();
    assert.equal((f.configValues[ROLES_KEY] as CalendarRole[])[1]?.startProperty, 'note.Exact Other.Start');
    assert.equal(f.calendar.getEvents().length, 2);
    assert.equal(new Set(f.calendar.getEvents().map(event => event.id)).size, 2);
    const titles = [...f.host.querySelectorAll<HTMLElement>('.fc-event-title')];
    assert.ok(titles.every(title => title.textContent?.includes('Note') && !title.textContent.includes('Custom role')));
    assert.ok([...f.host.querySelectorAll('.nosy-role-label')].some(label => label.textContent === 'Custom role'));
    for (const title of titles) title.click();
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.opens(), 2); assert.equal(f.writes(), 0);
  } finally { f.close(); }
});

test('real ISO heading and native row numbers follow navigation, week-years and nominal periods with empty results', async()=>{
  const f=await fixture();try{
    const label=()=>f.host.querySelector('.nosy-iso-indicator')!.textContent;
    f.calendar.changeView('timeGridWeek','2025-12-29');await frame();assert.equal(label(),'2026-W01');
    f.calendar.prev();await frame();assert.equal(label(),'2025-W52');f.calendar.next();await frame();assert.equal(label(),'2026-W01');
    f.calendar.today();await frame();const today=isoWeek(new Date(2026,10,23,12));assert.equal(label(),`${today.year}-W${String(today.week).padStart(2,'0')}`);
    f.calendar.changeView('timeGridDay','2027-01-03');await frame();assert.equal(label(),'2026-W53');
    f.calendar.changeView('dayGridMonth','2026-11-23');await frame();assert.equal(label(),'2026-W44–W49');assert.ok(f.host.querySelectorAll('.fc-daygrid-week-number').length);
    f.calendar.changeView('multiMonthYear','2027-06-01');await frame();assert.equal(label(),'2026-W53 – 2027-W52');assert.ok(f.host.querySelectorAll('.fc-daygrid-week-number').length);
    f.view.data={data:[]} as unknown as BasesQueryResult;f.view.onDataUpdated();await frame();
    assert.equal(f.calendar.getEvents().length,0);assert.equal(label(),'2026-W53 – 2027-W52');assert.equal(f.writes(),0);
  }finally{f.close();}
});
test('real rolled calendar event shows source dates and native resize commits projected endpoints through guarded writeback', async () => {
  const f = await fixture(true);
  try {
    assert.equal(f.calendar.getEvents()[0]?.start?.getFullYear(), 2026);
    const event = f.host.querySelector<HTMLElement>('.fc-daygrid-event')!;
    assert.ok(event.classList.contains('nosy-rolled-event'));
    assert.match(event.querySelector('.nosy-original-dates')!.textContent!, /2025-11-20T09:00/);
    assert.equal(event.style.backgroundColor, ''); assert.equal(event.style.borderColor, 'rgb(18, 52, 86)');
    const handle = event.querySelector<HTMLElement>('.fc-event-resizer-end')!;
    assert.equal(win.getComputedStyle(handle).opacity, '0');
    hitElement = handle; fallback = f.host.querySelector('.fc-daygrid-body')!;
    handle.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 150 }));
    document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 100, clientY: 250 }));
    document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 100, clientY: 250 }));
    await new Promise(resolve => setTimeout(resolve, 0)); await frame(); await frame();
    assert.equal(f.writes(), 1); assert.equal(f.opens(), 0);
    assert.equal(f.fm.scheduled, '2026-11-23T09:00'); assert.equal(f.fm.until, '2026-11-30T10:00');
    assert.equal(f.fm['Exact Other.Start'], '2026-11-23T11:00');
  } finally { f.close(); }
});

test('real Event colors editor applies ordered fills to all roles in all modes while retaining borders and source dates', async () => {
  const f = await fixture(true);
  try {
    const roles = f.configValues[ROLES_KEY] as CalendarRole[];
    f.view.config.set(ROLES_KEY, [...roles, { ...roles[0], id: 'second', label: 'Other', edgeColor: '#654321' }]);
    await frame(); f.host.querySelector<HTMLButtonElement>('.fc-eventColors-button')!.click();
    const editor = document.querySelector<HTMLElement>('.nosy-color-editor')!;
    button(editor, '+ Add rule').click(); editor.querySelector<HTMLButtonElement>('[aria-label="Property"]')!.click();
    const picker = FuzzySuggestModal.instances[FuzzySuggestModal.instances.length - 1] as unknown as PropertyPicker;
    picker.onChooseItem('note.scheduled'); picker.close();
    const input = editor.querySelector<HTMLInputElement>('[aria-label="Value"]')!;
    input.value = '2025-11-20T09:00'; input.dispatchEvent(new win.Event('input'));
    const color = editor.querySelector<HTMLInputElement>('[aria-label="Fill color"]')!;
    color.value = '#ffff00'; color.dispatchEvent(new win.Event('input'));
    button(editor, 'Save').click(); await frame(); await frame();
    assert.equal((f.configValues[COLORS_KEY] as ColorRule[])[0]?.property, 'note.scheduled');
    assert.equal(f.calendar.getEvents().length, 2); assert.equal(f.calendar.getDate().getMonth(), 10);
    for (const mode of ['timeGridWeek', 'timeGridDay', 'dayGridMonth', 'multiMonthYear']) {
      f.calendar.changeView(mode, '2026-11-23'); await frame();
      const nodes = [...f.host.querySelectorAll<HTMLElement>('.fc-event:not(.fc-event-mirror)')]; assert.ok(nodes.length >= 2);
      for (const event of nodes) {
        assert.equal(event.style.backgroundColor, 'rgb(255, 255, 0)');
        assert.ok(['rgb(18, 52, 86)', 'rgb(101, 67, 33)'].includes(event.style.borderColor));
        assert.equal(event.querySelector<HTMLElement>('.fc-event-main')!.style.color, 'rgb(0, 0, 0)');
        assert.ok(event.querySelector('.nosy-rolled-label')); assert.match(event.textContent!, /2025-11-20/);
        const role = event.querySelector<HTMLElement>('.nosy-role-label')!; assert.ok(role);
        assert.ok(['Reminder', 'Other'].includes(role.textContent!));
        const badgeStyle = win.getComputedStyle(role);
        assert.equal(badgeStyle.position, 'absolute'); assert.equal(badgeStyle.top, '0px');
        assert.equal(badgeStyle.right, '4px'); assert.match(badgeStyle.transform, /translateY/);
        assert.equal(badgeStyle.pointerEvents, 'none');
        assert.ok(!event.querySelector('.fc-event-title')!.textContent!.includes(' · '));
        assert.equal(win.getComputedStyle(event.querySelector<HTMLElement>('.fc-event-resizer')!).opacity, '0');
      }
    }
    assert.equal(f.writes(), 0); assert.equal(f.fm.scheduled, '2025-11-20T09:00');
    // A source change removes the match without resetting the selected mode/period or event count.
    f.fm.scheduled = '2025-11-21T09:00'; f.fm.until = '2025-11-21T10:00'; f.setData(); f.view.onDataUpdated(); await frame();
    assert.equal(f.calendar.view.type, 'multiMonthYear'); assert.equal(f.calendar.getEvents().length, 2);
    assert.ok(f.calendar.getEvents().every(event => event.backgroundColor === ''));
    f.view.config.set(COLORS_KEY, []); await frame(); assert.equal(f.writes(), 0);
  } finally { f.close(); }
});

test('real per-view color editors reject stale saves, discard Cancel and stay independent between views', async () => {
  const a = await fixture(), b = await fixture();
  const rule: ColorRule = { id: 'a', property: 'note.scheduled', operator: 'contains', operand: { type: 'text', value: '2026' }, color: '#112233' };
  try {
    a.view.config.set(COLORS_KEY, [rule]); await frame();
    assert.equal(a.calendar.getEvents()[0]?.backgroundColor, '#112233'); assert.equal(b.calendar.getEvents()[0]?.backgroundColor, '');
    a.host.querySelector<HTMLButtonElement>('.fc-eventColors-button')!.click();
    let editor = document.querySelector<HTMLElement>('.nosy-color-editor')!;
    a.view.config.set(COLORS_KEY, []); button(editor, 'Save').click();
    assert.match(editor.querySelector('[role=status]')!.textContent!, /changed while/);
    assert.deepEqual(a.configValues[COLORS_KEY], []); button(editor, 'Cancel').click();
    a.host.querySelector<HTMLButtonElement>('.fc-eventColors-button')!.click(); editor = document.querySelector<HTMLElement>('.nosy-color-editor')!;
    button(editor, '+ Add rule').click(); button(editor, 'Cancel').click(); assert.deepEqual(a.configValues[COLORS_KEY], []);
    a.view.config.set(COLORS_KEY, [rule]); await frame();
    a.host.querySelector<HTMLButtonElement>('.fc-eventColors-button')!.click(); editor = document.querySelector<HTMLElement>('.nosy-color-editor')!;
    a.view.config.set = () => { throw new Error('Base is read-only'); };
    button(editor, 'Save').click(); assert.match(editor.querySelector('[role=status]')!.textContent!, /Base is read-only/);
    assert.ok(editor.isConnected); assert.equal((a.configValues[COLORS_KEY] as ColorRule[])[0]?.color, '#112233'); button(editor, 'Cancel').click();
    assert.equal(a.writes(), 0); assert.equal(b.writes(), 0);
  } finally { a.close(); b.close(); }
});

test('real body-drag previews retain conditional fill and independent role border', async () => {
  const f = await fixture(true);
  try {
    f.view.config.set(COLORS_KEY, [{ id: 'a', property: 'note.scheduled', operator: 'contains', operand: { type: 'text', value: '2025' }, color: '#112233' }]); await frame();
    f.calendar.setOption('dragRevertDuration', 0);
    const body = f.host.querySelector<HTMLElement>('.fc-daygrid-event .fc-event-main')!;
    hitElement = body; fallback = f.host.querySelector('.fc-daygrid-body')!;
    body.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 150 }));
    document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 100, clientY: 250 })); await frame();
    // Body dragging uses a floating cloned element outside the calendar host.
    const preview = document.querySelector<HTMLElement>('.fc-event-dragging')!; assert.ok(preview);
    assert.equal(preview.querySelector('.nosy-role-label')!.textContent, 'Reminder');
    assert.equal(preview.style.backgroundColor, 'rgb(17, 34, 51)'); assert.equal(preview.style.borderColor, 'rgb(18, 52, 86)');
    document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 100, clientY: 250 }));
    await new Promise(resolve => setTimeout(resolve, 0)); await frame(); await frame(); assert.equal(f.writes(), 1);
  } finally { f.close(); }
});

test('real project-link color correction updates both role events without changing source properties', async () => {
  const f = await fixture(true);
  try {
    const original = JSON.stringify(f.fm), roles = f.configValues[ROLES_KEY] as CalendarRole[];
    f.view.config.set(ROLES_KEY, [...roles, { ...roles[0], id: 'other', edgeColor: '#654321' }]);
    const source = f.view.data.data[0]!;
    f.view.data = { data: [{ file: source.file, getValue: (property: string) => property === 'note.project'
      ? new ListValue([LinkValue.parseFromString(f.view.app, '[[PRJT - Debeka]]', source.file.path)!])
      : source.getValue(property as 'note.scheduled') }] } as unknown as BasesQueryResult;
    f.view.config.set(COLORS_KEY, [{ id: 'reported', property: 'note.project', operator: 'contains', operand: { type: 'text', value: 'Debeka' }, color: '#3788d8' }]); await frame();
    assert.ok(f.calendar.getEvents().every(event => event.backgroundColor === ''));
    f.host.querySelector<HTMLButtonElement>('.fc-eventColors-button')!.click();
    const editor = document.querySelector<HTMLElement>('.nosy-color-editor')!;
    assert.match(editor.querySelector('.nosy-rule-feedback')!.textContent!, /0 of 1 source notes/);
    button(editor, 'Source values…').click();
    const picker = FuzzySuggestModal.instances[FuzzySuggestModal.instances.length - 1] as unknown as { getItems(): Literal[]; onChooseItem(value: Literal): void; close(): void };
    picker.onChooseItem(picker.getItems()[0]!); picker.close();
    assert.match(editor.querySelector('.nosy-rule-feedback')!.textContent!, /1 of 1 source notes/);
    button(editor, 'Save').click(); await frame();
    assert.equal(f.calendar.getEvents().length, 2); assert.ok(f.calendar.getEvents().every(event => event.backgroundColor === '#3788d8'));
    assert.deepEqual(f.calendar.getEvents().map(event => event.borderColor).sort(), ['#123456', '#654321']);
    assert.equal(f.writes(), 0); assert.equal(JSON.stringify(f.fm), original);
  } finally { f.close(); }
});

for (const mode of ['timeGridWeek', 'timeGridDay']) test(`real ${mode}: native drag from date-only all-day range into a time slot persists a 30-minute range`, async () => {
  const originalGeometry = win.HTMLElement.prototype.getBoundingClientRect;
  // Separate the all-day row from the time grid in the headless geometry, as a browser lays them out.
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    let top: number | undefined, height = 1440;
    if (this.closest('.fc-timegrid-slots') && (this.tagName === 'TR' || this.tagName === 'TD')) {
      const row = this.tagName === 'TR' ? this : this.parentElement!;
      top = 100 + [...row.parentElement!.children].indexOf(row) * 30; height = 30;
    } else if (this.matches('.fc-timegrid-body, .fc-timegrid-slots, .fc-timegrid-cols') || this.closest('.fc-timegrid-cols')) top = 100;
    if (top === undefined) return originalGeometry.call(this);
    return { x: 0, y: top, left: 0, top, right: 1000, bottom: top + height, width: 1000, height, toJSON() { return {}; } };
  };
  const f = await fixture();
  try {
    Object.assign(f.fm, { scheduled: '2026-11-23', until: '2026-11-23' }); f.setData(); f.view.onDataUpdated(); await frame();
    f.calendar.changeView(mode, '2026-11-23'); f.calendar.setOption('dragRevertDuration', 0); await frame();
    assert.equal(f.calendar.getEvents()[0]?.allDay, true);
    const body = f.host.querySelector<HTMLElement>('.fc-daygrid-event .fc-event-main')!; assert.ok(body);
    hitElement = body; fallback = f.host.querySelector('.fc-timegrid-body')!;
    body.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 50 }));
    hitElement = f.host.querySelector('.fc-timegrid-slot-lane[data-time="04:00:00"]')!;
    document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 100, clientY: 350 })); await frame();
    assert.ok(f.host.querySelector('.fc-timegrid-event.fc-event-mirror'), 'native preview must enter the timed grid');
    document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 100, clientY: 350 }));
    await new Promise(resolve => setTimeout(resolve, 0)); await frame(); await frame();
    assert.equal(f.writes(), 1); assert.match(String(f.fm.scheduled), /^2026-11-23T/); assert.match(String(f.fm.until), /^2026-11-23T/);
    assert.equal(+new Date(String(f.fm.until)) - +new Date(String(f.fm.scheduled)), 30 * 60_000);
    assert.equal(f.calendar.getEvents()[0]?.allDay, false); assert.equal(f.opens(), 0);
  } finally { f.close(); win.HTMLElement.prototype.getBoundingClientRect = originalGeometry; }
});

test('real native resize previews retain fills; rule refresh waits for gesture and never changes guarded writes', async () => {
  const f = await fixture(true);
  try {
    f.view.config.set(COLORS_KEY, [{ id: 'a', property: 'note.scheduled', operator: 'contains', operand: { type: 'text', value: '2025' }, color: '#112233' }]); await frame();
    const event = f.host.querySelector<HTMLElement>('.fc-daygrid-event')!;
    const handle = event.querySelector<HTMLElement>('.fc-event-resizer-end')!;
    hitElement = handle; fallback = f.host.querySelector('.fc-daygrid-body')!;
    handle.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 150 }));
    document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: 100, clientY: 250 })); await frame();
    const preview = f.host.querySelector<HTMLElement>('.fc-event-mirror')!; assert.ok(preview);
    assert.equal(preview.style.backgroundColor, 'rgb(17, 34, 51)'); assert.equal(preview.style.borderColor, 'rgb(18, 52, 86)');
    f.view.config.set(COLORS_KEY, []); await frame();
    assert.equal(f.calendar.getEvents()[0]?.backgroundColor, '#112233');
    document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 100, clientY: 250 }));
    await new Promise(resolve => setTimeout(resolve, 0)); await frame(); await frame();
    assert.equal(f.writes(), 1); assert.equal(f.fm.scheduled, '2026-11-23T09:00'); assert.equal(f.fm.until, '2026-11-30T10:00');
    assert.ok(f.calendar.getEvents().every(event => event.backgroundColor === ''));
  } finally { f.close(); }
});
