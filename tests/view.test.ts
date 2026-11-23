import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TFile, StringValue, NumberValue, NullValue, type BasesEntry, type BasesQueryResult, type BasesViewConfig, type QueryController } from 'obsidian';
import type { CalendarOptions, EventApi } from '@fullcalendar/core';
import { NosyCalendarView } from '../src/view';
import { SerialSaves } from '../src/writeback';
import { Calendar } from './calendar-stub';
import { noticeMessages } from './obsidian-stub';
import { eventId, ROLES_KEY, type CalendarRole } from '../src/roles';
import { COLORS_KEY } from '../src/colors';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(initial: Record<string, unknown> = { scheduled: '2026-11-23' }, now = () => new Date(), configWritable = true) {
  noticeMessages.length = 0;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0, opened = 0, exists = true;
  let nextTimer = 0;
  const timers = new Map<number, TimerHandler>();
  const listeners = new Map<string, Set<() => void>>();
  const addListener = (type: string, listener: () => void) => { const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set); };
  const removeListener = (type: string, listener: () => void) => { listeners.get(type)?.delete(listener); };
  const win = {
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
    setTimeout: (handler: TimerHandler) => { const id = ++nextTimer; timers.set(id, handler); return id; },
    clearTimeout: (id: number) => { timers.delete(id); }, addEventListener: addListener, removeEventListener: removeListener
  };
  const doc = { defaultView: win, createDocumentFragment: () => ({ createEl: () => element() }), createElement: (_tag: string) => element(), querySelectorAll: () => [], hidden: false, addEventListener: addListener, removeEventListener: removeListener };
  const element = () => ({
    createDiv: () => element(), createSpan: () => element(),
    ownerDocument: doc, className: '', textContent: '', title: '', hidden: false,
    clientWidth: 800, clientHeight: 600, append() {}, remove() {}, setAttribute() {},
    style: { setProperty() {}, removeProperty() {} }, dataset: {},
    addEventListener() {}, removeEventListener() {}
  });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  const file = Object.assign(new TFile(), { path: 'event.md', basename: 'Event', extension: 'md' });
  const frontmatter = { ...initial };
  const cacheListeners = new Set<(file: TFile) => void>();
  const configValues: Record<string, unknown> = {};
  const properties: Record<string, string | null> = new Proxy({ startProperty: 'note.scheduled', endProperty: 'note.until' }, {
    set: (object: Record<string, string | null>, key: string, value: string | null) => {
      object[key] = value;
      const roles = configValues[ROLES_KEY] as CalendarRole[] | undefined;
      if (roles?.[0] && (key === 'startProperty' || key === 'endProperty')) roles[0][key] = value as CalendarRole[typeof key];
      return true;
    }
  });
  let processor = async (callback: (fm: Record<string, unknown>) => void) => {
    const draft = { ...frontmatter };
    callback(draft);
    Object.assign(frontmatter, draft);
  };
  const app = {
    metadataCache: { getFileCache: () => ({ frontmatter }),
      on: (_event: string, callback: (file: TFile) => void) => { cacheListeners.add(callback); return callback; },
      offref: (callback: (file: TFile) => void) => { cacheListeners.delete(callback); } },
    vault: { getAbstractFileByPath: (path: string) => exists && path === file.path ? file : null, getMarkdownFiles: () => [file] },
    fileManager: { processFrontMatter: (_file: TFile, callback: (fm: Record<string, unknown>) => void) => processor(callback) },
    workspace: { on() {}, offref() {}, getLeaf: () => ({ openFile: async () => { opened++; } }) }
  };
  const view = new NosyCalendarView({ app } as unknown as QueryController, element() as unknown as HTMLElement, () => {}, new SerialSaves(), now);
  view.config = { getAsPropertyId: (key: string) => properties[key] ?? null,
    get: (key: string) => configValues[key], set: (key: string, value: unknown) => { if (!configWritable) throw new Error('Base is read-only'); configValues[key] = structuredClone(value); }
  } as unknown as BasesViewConfig;
  const setData = (values: Record<string, unknown> | null) => {
    const frozen = values ? { ...values } : null;
    const entries = frozen ? [{ file, getValue: (prop: string) => {
      const value = frozen[prop.slice(prop.indexOf('.') + 1)];
      return typeof value === 'string' ? new StringValue(value) : typeof value === 'number' ? new NumberValue(value) : NullValue.value;
    } } as unknown as BasesEntry] : [];
    view.data = { data: entries } as BasesQueryResult;
  };
  setData(frontmatter);
  const flush = () => {
    for (let pass = 0; frames.size && pass < 10; pass++) {
      const batch = [...frames.values()]; frames.clear();
      for (const callback of batch) callback(0);
    }
    assert.equal(frames.size, 0);
  };
  view.onload(); flush();
  const calendar = Calendar.instances[Calendar.instances.length - 1]!;
  const fire = (name: keyof CalendarOptions, arg: unknown) => (calendar.options[name] as (arg: unknown) => unknown)(arg);
  let reverted = 0;
  const event = { id: eventId(file.path, 'legacy-calendar'), title: file.basename, extendedProps: { path: file.path }, start: new Date(2026, 10, 24), allDay: true,
    setDates() {}, setProp() {} } as unknown as EventApi;
  const dragStart = () => { fire('eventDragStart', { event }); };
  const drop = (start?: Date, allDay?: boolean) => {
    if (start) Object.assign(event, { start });
    if (allDay !== undefined) Object.assign(event, { allDay });
    fire('eventDragStop', { event });
    fire('eventDrop', { event, revert: () => { reverted++; } });
  };
  const resizeStart = () => { fire('eventResizeStart', { event }); };
  const resize = (edge: 'start' | 'end', start: Date, end: Date, allDay = true, noDelta = false) => {
    Object.assign(event, { start, end, allDay });
    fire('eventResizeStop', { event });
    const zero = { years: 0, months: 0, days: 0, milliseconds: 0 };
    fire('eventResize', { event, startDelta: { ...zero, days: edge === 'start' && !noDelta ? 1 : 0 },
      endDelta: { ...zero, days: edge === 'end' && !noDelta ? 1 : 0 }, revert: () => { reverted++; } });
  };
  const click = () => fire('eventClick', { event, jsEvent: { preventDefault() {} } });
  return { view, file, frontmatter, properties, calendar, fire, flush, setData, dragStart, drop, resizeStart, resize, click,
    configValues,
    setRoles: (roles: CalendarRole[]) => { configValues[ROLES_KEY] = structuredClone(roles); view.onDataUpdated(); flush(); },
    selectRole: (id: string) => { Object.assign(event, { id: eventId('event.md', id) }); },
    triggerClock: (type = 'focus') => { for (const callback of listeners.get(type) ?? []) callback(); },
    timerCount: () => timers.size,
    cacheChanged: () => { for (const callback of cacheListeners) callback(file); },
    setProcessor: (value: typeof processor) => { processor = value; }, deleteFile: () => { exists = false; },
    opened: () => opened, reverted: () => reverted };
}

test('fills follow evaluated source/formula values and malformed rules never change current result membership', () => {
  const f = fixture({ scheduled: '2026-11-23', score: 0 });
  try {
    f.configValues[COLORS_KEY] = [null, { id: 'a', property: 'formula.score', operator: '=', operand: { type: 'number', value: 5 }, color: '#112233' }];
    f.setData({ scheduled: '2026-11-23', score: 5 }); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events.length, 1); assert.equal(f.calendar.events[0]?.backgroundColor, '#112233');
    assert.equal(f.frontmatter.score, 0);
    f.setData({ scheduled: '2026-11-23', score: 0 }); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events.length, 1); assert.equal(f.calendar.events[0]?.backgroundColor, undefined);
    f.setData(null); f.view.onDataUpdated(); f.flush(); assert.equal(f.calendar.events.length, 0);
  } finally { f.view.unload(); }
});

test('view callback failure reverts the drop, suppresses its click and keeps normal note clicks', async () => {
  const now = Date.now;
  Date.now = () => 1000;
  const f = fixture();
  try {
    f.click(); assert.equal(f.opened(), 1);
    f.setProcessor(async () => { throw new Error('disk is read-only'); });
    f.dragStart(); f.drop(); f.click();
    await tick(); f.flush();
    assert.equal(f.reverted(), 1);
    assert.equal(f.frontmatter.scheduled, '2026-11-23');
    assert.equal(f.calendar.events[0]?.start, '2026-11-23');
    assert.equal(f.opened(), 1);
    assert.ok(noticeMessages.some(message => message.includes('disk is read-only')));
    Date.now = () => 2000;
    f.click(); assert.equal(f.opened(), 2);
  } finally { Date.now = now; f.view.unload(); }
});
test('pending saves freeze refresh and a successful filter exclusion is never reinserted', async () => {
  const f = fixture(), gate = deferred();
  f.setProcessor(async callback => {
    await gate.promise;
    callback(f.frontmatter);
    f.setData(null); f.view.onDataUpdated();
  });
  try {
    const replacements = f.calendar.replacements;
    f.dragStart(); f.drop();
    await tick();
    f.setData({ scheduled: '2026-11-23', unrelated: true });
    f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.replacements, replacements);
    gate.resolve(); await tick(); f.flush();
    assert.equal(f.frontmatter.scheduled, '2026-11-24');
    assert.equal(f.reverted(), 0);
    assert.equal(f.calendar.events.length, 0);
  } finally { f.view.unload(); }
});
test('saved moves hide stale query rows until authoritative results arrive', async () => {
  const f = fixture();
  try {
    f.dragStart(); f.drop(); await tick(); f.flush();
    assert.equal(f.frontmatter.scheduled, '2026-11-24');
    assert.equal(f.calendar.events.length, 0);
    f.view.onDataUpdated(); f.flush(); // An unrelated result refresh must not restore the stale date.
    assert.equal(f.calendar.events.length, 0);
    f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events.length, 1);
    assert.equal(f.calendar.events[0]?.start, '2026-11-24');
    assert.equal(f.calendar.events[0]?.startEditable, true);
  } finally { f.view.unload(); }
});
test('a later source edit restoring the original date is accepted after a file-specific cache update', async () => {
  const f = fixture();
  try {
    f.dragStart(); f.drop(); await tick(); f.flush();
    f.frontmatter.scheduled = '2026-11-23';
    f.cacheChanged(); f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events[0]?.start, '2026-11-23');
  } finally { f.view.unload(); }
});
test('real view guards reject mapping changes, field edits, rename and delete before the write callback', async () => {
  for (const kind of ['mapping', 'field', 'rename', 'delete']) {
    const f = fixture(), gate = deferred();
    f.setProcessor(async callback => { await gate.promise; callback(f.frontmatter); });
    try {
      f.dragStart(); f.drop(); await tick();
      if (kind === 'mapping') f.properties.startProperty = 'note.other';
      if (kind === 'field') f.frontmatter.scheduled = '2026-12-01';
      if (kind === 'rename') f.file.path = 'renamed.md';
      if (kind === 'delete') f.deleteFile();
      f.view.onDataUpdated();
      gate.resolve(); await tick(); f.flush();
      assert.equal(f.frontmatter.scheduled, kind === 'field' ? '2026-12-01' : '2026-11-23', kind);
      assert.equal(f.reverted(), 1, kind);
      assert.ok(noticeMessages.some(message => message.startsWith('Move not saved:')), kind);
    } finally { f.view.unload(); }
  }
});
test('unload cancels queued callbacks without touching the note or resurrecting the calendar', async () => {
  const f = fixture(), gate = deferred();
  f.setProcessor(async callback => { await gate.promise; callback(f.frontmatter); });
  f.dragStart(); f.drop(); await tick();
  f.view.unload(); gate.resolve(); await tick(); f.flush();
  assert.equal(f.frontmatter.scheduled, '2026-11-23');
  assert.equal(f.calendar.destroyed, true);
  assert.equal(f.reverted(), 0);
  assert.equal(noticeMessages.length, 0);
});
test('partial dates and derived mappings expose display-only explanations', () => {
  const f = fixture({ scheduled: 2026 });
  try {
    assert.equal(f.calendar.events[0]?.startEditable, false);
    assert.match(f.calendar.events[0]?.extendedProps?.readOnlyReason as string, /full dates/);
    f.properties.startProperty = 'formula.scheduled';
    f.setData({ scheduled: '2026-11-23' }); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events[0]?.startEditable, false);
    assert.match(f.calendar.events[0]?.extendedProps?.readOnlyReason as string, /Formula\/file/);
  } finally { f.view.unload(); }
});
test('week spans render once, keep note-opening/filter behavior and cannot write on a drop attempt', async () => {
  for (const fm of [
    { scheduled: '2026W48' }, { scheduled: '2026-W48' },
    { scheduled: '2026-W48', until: '2026-W49' }, { scheduled: '2026-11-23', until: '2026-W49' }
  ]) {
    const f = fixture(fm);
    let writes = 0;
    f.setProcessor(async () => { writes++; });
    try {
      assert.equal(f.calendar.events.length, 1);
      assert.equal(f.calendar.events[0]?.start, '2026-11-23');
      assert.equal(f.calendar.events[0]?.end, fm.until ? '2026-12-07' : '2026-11-30');
      assert.equal(f.calendar.events[0]?.allDay, true);
      assert.equal(f.calendar.events[0]?.startEditable, false);
      assert.match(f.calendar.events[0]?.extendedProps?.readOnlyReason as string, /Body dragging.*week/);
      f.click(); assert.equal(f.opened(), 1);
      f.dragStart(); f.drop(); await tick(); f.flush();
      assert.equal(writes, 0);
      assert.deepEqual(f.frontmatter, fm);
      f.setData(null); f.view.onDataUpdated(); f.flush();
      assert.equal(f.calendar.events.length, 0);
      f.setData(fm); f.view.onDataUpdated(); f.flush();
      assert.equal(f.calendar.events.length, 1);
      assert.deepEqual(f.frontmatter, fm);
    } finally { f.view.unload(); }
  }
});
test('calendar rejects cross-kind explicit ranges with one explanation per drag', () => {
  const f = fixture({ scheduled: '2026-11-23', until: '2026-11-25' });
  try {
    f.dragStart();
    assert.equal(f.fire('eventAllow', { allDay: false }), false);
    assert.equal(f.fire('eventAllow', { allDay: false }), false);
    assert.equal(noticeMessages.length, 1);
    assert.match(noticeMessages[0]!, /must stay/);
    assert.equal(f.calendar.events[0]?.durationEditable, true);
    assert.equal(f.calendar.options.selectable, false);
  } finally { f.view.unload(); }
});

test('removing both time parts refreshes to all-day and dragging back into a time slot saves both mappings', async () => {
  const f = fixture({ scheduled: '2026-11-22T09:00', until: '2026-11-22T10:00', other: 'keep' });
  try {
    Object.assign(f.frontmatter, { scheduled: '2026-11-22', until: '2026-11-22' });
    f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events[0]?.allDay, true); assert.equal(f.calendar.events[0]?.startEditable, true);
    f.dragStart(); assert.equal(f.fire('eventAllow', { allDay: false }), true);
    f.drop(new Date(2026, 10, 23, 10), false); await tick(); f.flush();
    assert.equal(f.frontmatter.scheduled, '2026-11-23T10:00'); assert.equal(f.frontmatter.until, '2026-11-23T10:30');
    assert.equal(f.frontmatter.other, 'keep'); assert.equal(f.reverted(), 0);
    f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush(); assert.equal(f.calendar.events[0]?.allDay, false);
  } finally { f.view.unload(); }
});

test('resize callbacks persist each timed endpoint independently with the fixed spelling unchanged', async () => {
  for (const edge of ['start', 'end'] as const) {
    const f = fixture({ scheduled: '2026-11-23 09:00:00', until: '2026-11-23 10:00:00' });
    try {
      assert.equal(f.calendar.options.eventResizableFromStart, true);
      assert.equal(f.calendar.options.eventDisplay, 'block');
      assert.equal(f.calendar.events[0]?.durationEditable, true);
      f.resizeStart(); f.resize(edge, new Date(2026, 10, 23, 8, 30), new Date(2026, 10, 23, 11), false);
      await tick(); f.flush();
      assert.equal(f.frontmatter.scheduled, edge === 'start' ? '2026-11-23T08:30:00' : '2026-11-23 09:00:00');
      assert.equal(f.frontmatter.until, edge === 'end' ? '2026-11-23T11:00:00' : '2026-11-23 10:00:00');
      assert.equal(f.reverted(), 0);
    } finally { f.view.unload(); }
  }
});
test('partial resize creates exact dates and an End, then enables ordinary body dragging', async () => {
  const f = fixture({ scheduled: '2026W48', other: 'keep' });
  try {
    assert.equal(f.calendar.events[0]?.startEditable, false);
    assert.equal(f.calendar.events[0]?.durationEditable, true);
    assert.equal(f.calendar.events[0]?.extendedProps?.resizeReason, undefined);
    f.resizeStart(); f.resize('end', new Date(2026, 10, 23), new Date(2026, 11, 1));
    await tick(); f.flush();
    assert.deepEqual(f.frontmatter, { scheduled: '2026-11-23', until: '2026-11-30', other: 'keep' });
    f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events[0]?.startEditable, true);
    f.dragStart(); f.drop(new Date(2026, 10, 24)); await tick(); f.flush();
    assert.deepEqual(f.frontmatter, { scheduled: '2026-11-24', until: '2026-12-01', other: 'keep' });
  } finally { f.view.unload(); }
});
test('mapped empty timed End is created at the original displayed boundary when start is resized', async () => {
  const f = fixture({ scheduled: '2026-11-23 09:00', until: null });
  try {
    f.resizeStart(); f.resize('start', new Date(2026, 10, 23, 8, 30), new Date(2026, 10, 23, 9, 30), false);
    await tick(); f.flush();
    assert.deepEqual(f.frontmatter, { scheduled: '2026-11-23T08:30', until: '2026-11-23T09:30' });
  } finally { f.view.unload(); }
});
test('unmapped/derived/identical End mappings have no resize capability and explain the requirement', () => {
  for (const end of [null, 'formula.until', 'note.scheduled']) {
    const f = fixture();
    try {
      f.properties.endProperty = end; f.view.onDataUpdated(); f.flush();
      if (end === 'note.scheduled') { assert.equal(f.calendar.events.length, 0); continue; }
      assert.equal(f.calendar.events[0]?.durationEditable, false);
      assert.ok(f.calendar.events[0]?.extendedProps?.resizeReason);
      if (end === null) {
        assert.equal(f.calendar.events[0]?.startEditable, true);
        assert.match(f.calendar.events[0]?.extendedProps?.resizeReason as string, /Select an End/);
      }
    } finally { f.view.unload(); }
  }
});
test('cancelled and no-op resize gestures never write or convert partial dates', async () => {
  for (const kind of ['cancel', 'zero-delta', 'same-boundary']) {
    const f = fixture({ scheduled: '2026W48' }); let writes = 0;
    f.setProcessor(async () => { writes++; });
    try {
      f.resizeStart();
      if (kind === 'cancel') f.fire('eventResizeStop', {});
      else f.resize('end', new Date(2026, 10, 23), new Date(2026, 10, 30), true, kind === 'zero-delta');
      await tick(); f.flush();
      assert.equal(writes, 0); assert.deepEqual(f.frontmatter, { scheduled: '2026W48' });
    } finally { f.view.unload(); }
  }
});
test('failed/invalid resize callbacks revert and suppress opening the note', async () => {
  const now = Date.now; Date.now = () => 1000;
  try {
    for (const failure of ['write', 'invalid']) {
      const f = fixture({ scheduled: '2026-11-23T09:00', until: '2026-11-23T10:00' });
      if (failure === 'write') f.setProcessor(async () => { throw new Error('test write failure'); });
      try {
        f.click(); assert.equal(f.opened(), 1);
        f.resizeStart(); f.resize('end', new Date(2026, 10, 23, 9), new Date(2026, 10, 23, failure === 'invalid' ? 8 : 11), false);
        f.click(); await tick(); f.flush();
        assert.equal(f.reverted(), 1); assert.equal(f.opened(), 1);
        assert.equal(f.frontmatter.until, '2026-11-23T10:00');
        assert.ok(noticeMessages.some(message => message.startsWith('Resize not saved:')));
      } finally { f.view.unload(); }
    }
  } finally { Date.now = now; }
});
test('resize saves guard conflicts, mappings, file identity and teardown at callback time', async () => {
  for (const change of ['field', 'mapping', 'rename', 'delete', 'unload']) {
    const f = fixture(), gate = deferred();
    f.setProcessor(async callback => { await gate.promise; callback(f.frontmatter); });
    try {
      f.resizeStart(); f.resize('start', new Date(2026, 10, 22), new Date(2026, 10, 24)); await tick();
      if (change === 'field') f.frontmatter.until = '2026-12-01';
      if (change === 'mapping') f.properties.endProperty = 'note.other';
      if (change === 'rename') f.file.path = 'renamed.md';
      if (change === 'delete') f.deleteFile();
      if (change === 'unload') f.view.unload();
      f.view.onDataUpdated(); f.flush();
      gate.resolve(); await tick(); f.flush();
      assert.equal(f.frontmatter.scheduled, '2026-11-23', change);
      assert.equal(f.frontmatter.until, change === 'field' ? '2026-12-01' : undefined, change);
      assert.equal(f.reverted(), change === 'unload' ? 0 : 1, change);
    } finally { f.view.unload(); }
  }
});
test('resize refresh races never restore stale rows or filtered-out notes', async () => {
  for (const filtered of [false, true]) {
    const f = fixture(), gate = deferred();
    f.setProcessor(async callback => {
      await gate.promise; callback(f.frontmatter);
      if (filtered) { f.setData(null); f.view.onDataUpdated(); }
    });
    try {
      const replacements = f.calendar.replacements;
      f.resizeStart(); f.resize('end', new Date(2026, 10, 23), new Date(2026, 10, 26)); await tick();
      f.view.onDataUpdated(); f.flush(); assert.equal(f.calendar.replacements, replacements);
      gate.resolve(); await tick(); f.flush(); assert.equal(f.calendar.events.length, 0);
      f.view.onDataUpdated(); f.flush(); assert.equal(f.calendar.events.length, 0);
      if (!filtered) {
        f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush();
        assert.equal(f.calendar.events[0]?.end, '2026-11-26');
      }
    } finally { f.view.unload(); }
  }
});

test('roles migrate independently per Base view and generate separate stable events per note', () => {
  const a = fixture({ scheduled: '2026-11-23', other: '2026-11-25' }), b = fixture();
  try {
    const migrated = a.configValues[ROLES_KEY] as CalendarRole[];
    assert.equal(migrated[0]?.rollPastDates, false);
    const roles: CalendarRole[] = [{ ...migrated[0]!, label: 'First', edgeColor: '#ff0000' },
      { ...migrated[0]!, id: 'second', label: 'Second', startProperty: 'note.other', endProperty: null },
      { ...migrated[0]!, id: 'incomplete', label: 'Incomplete', startProperty: null }];
    a.setRoles(roles);
    assert.equal(a.calendar.events.length, 2);
    assert.equal(a.calendar.events[0]?.title, 'Event · First');
    assert.equal(a.calendar.events[0]?.borderColor, '#ff0000');
    assert.equal(a.calendar.events[0]?.backgroundColor, undefined);
    const identities = a.calendar.events.map(event => event.id);
    a.view.onDataUpdated(); a.flush(); assert.deepEqual(a.calendar.events.map(event => event.id), identities);
    assert.equal(b.calendar.events.length, 1); assert.equal(b.calendar.events[0]?.title, 'Event · Calendar');
  } finally { a.view.unload(); b.view.unload(); }
});
test('a read-only Base keeps displaying its legacy mappings when role migration cannot be saved', () => {
  const f = fixture({ scheduled: '2026-11-23' }, () => new Date(), false);
  try { assert.equal(f.calendar.events.length, 1); assert.equal(f.configValues[ROLES_KEY], undefined); assert.equal(f.frontmatter.scheduled, '2026-11-23'); }
  finally { f.view.unload(); }
});
test('missing/invalid/identical-mapping role instances do not suppress other valid roles', () => {
  const f = fixture({ scheduled: '2026-11-23', bad: 'invalid' });
  try {
    const base = (f.configValues[ROLES_KEY] as CalendarRole[])[0]!;
    f.setRoles([base, { ...base, id: 'missing', startProperty: 'note.absent' },
      { ...base, id: 'invalid', startProperty: 'note.bad' }, { ...base, id: 'same', endProperty: base.startProperty }]);
    assert.equal(f.calendar.events.length, 1); assert.equal(f.calendar.events[0]?.extendedProps?.roleId, base.id);
  } finally { f.view.unload(); }
});
test('selected role edits only its fields while shared properties update all roles after authoritative refresh', async () => {
  const f = fixture({ scheduled: '2026-11-23', other: '2026-11-25', until: null });
  try {
    const base = (f.configValues[ROLES_KEY] as CalendarRole[])[0]!;
    f.setRoles([{ ...base, label: 'A' }, { ...base, id: 'other', label: 'B', startProperty: 'note.other', endProperty: null }]);
    f.selectRole('other'); f.dragStart(); f.drop(new Date(2026, 10, 26)); await tick(); f.flush();
    assert.equal(f.frontmatter.other, '2026-11-26'); assert.equal(f.frontmatter.scheduled, '2026-11-23'); assert.equal(f.frontmatter.until, null);
    f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush();
    f.setRoles([{ ...base, label: 'A' }, { ...base, id: 'shared', label: 'Shared', endProperty: null }]);
    f.selectRole('shared'); f.dragStart(); f.drop(new Date(2026, 10, 24)); await tick(); f.flush();
    f.setData(f.frontmatter); f.view.onDataUpdated(); f.flush();
    assert.equal(f.calendar.events.length, 2);
    assert.ok(f.calendar.events.every(event => event.start === '2026-11-24'));
  } finally { f.view.unload(); }
});
test('role removal and role property changes during pending saves cannot overwrite the note', async () => {
  for (const remove of [false, true]) {
    const f = fixture(), gate = deferred();
    f.setProcessor(async callback => { await gate.promise; callback(f.frontmatter); });
    try {
      f.dragStart(); f.drop(); await tick();
      const roles = f.configValues[ROLES_KEY] as CalendarRole[];
      f.setRoles(remove ? [] : [{ ...roles[0]!, startProperty: 'note.other' }]);
      gate.resolve(); await tick(); f.flush();
      assert.equal(f.frontmatter.scheduled, '2026-11-23'); assert.equal(f.reverted(), 1);
    } finally { f.view.unload(); }
  }
});

test('per-role rolling leaves source dates untouched and recomputes on focus/midnight without replacing the calendar', () => {
  let current = new Date(2026, 10, 23, 12);
  const f = fixture({ scheduled: '2025-11-20' }, () => current);
  try {
    const base = (f.configValues[ROLES_KEY] as CalendarRole[])[0]!;
    f.setRoles([{ ...base, id: 'original', label: 'Original', endProperty: null }, { ...base, id: 'rolled', label: 'Reminder', rollPastDates: true, endProperty: null }]);
    assert.equal(f.calendar.events.find(event => event.extendedProps?.roleId === 'original')?.start, '2025-11-20');
    assert.equal(f.calendar.events.find(event => event.extendedProps?.roleId === 'rolled')?.start, '2026-11-23');
    assert.equal(f.calendar.events.find(event => event.extendedProps?.roleId === 'rolled')?.extendedProps?.originalDatesText, '2025-11-20');
    current = new Date(2026, 10, 24, 0, 0);
    const calendar = f.calendar; f.triggerClock(); f.flush();
    assert.equal(f.calendar, calendar);
    assert.equal(f.calendar.events.find(event => event.extendedProps?.roleId === 'rolled')?.start, '2026-11-24');
    assert.equal(f.frontmatter.scheduled, '2025-11-20'); assert.equal(f.timerCount(), 1);
  } finally { f.view.unload(); assert.equal(f.timerCount(), 0); }
});
test('rolled move/resize callbacks save the displayed dates including the projected fixed endpoint', async () => {
  for (const kind of ['move', 'resize']) {
    const f = fixture({ scheduled: '2025-11-20', until: '2025-11-22' }, () => new Date(2026, 10, 23, 12));
    try {
      const base = (f.configValues[ROLES_KEY] as CalendarRole[])[0]!; f.setRoles([{ ...base, rollPastDates: true }]);
      if (kind === 'move') { f.dragStart(); f.drop(new Date(2026, 10, 24)); }
      else { f.resizeStart(); f.resize('end', new Date(2026, 10, 23), new Date(2026, 10, 28)); }
      await tick(); f.flush();
      assert.equal(f.frontmatter.scheduled, kind === 'move' ? '2026-11-24' : '2026-11-23');
      assert.equal(f.frontmatter.until, kind === 'move' ? '2026-11-26' : '2026-11-27');
    } finally { f.view.unload(); }
  }
});
test('rolled no-op and cancelled gestures do not write source dates or create Ends', async () => {
  for (const kind of ['move', 'resize', 'cancel']) {
    const f = fixture({ scheduled: '2025-11-20' }, () => new Date(2026, 10, 23, 12)); let writes = 0;
    f.setProcessor(async () => { writes++; });
    try {
      const base = (f.configValues[ROLES_KEY] as CalendarRole[])[0]!; f.setRoles([{ ...base, rollPastDates: true }]);
      if (kind === 'move') { f.dragStart(); f.drop(new Date(2026, 10, 23)); }
      else { f.resizeStart(); if (kind === 'resize') f.resize('end', new Date(2026, 10, 23), new Date(2026, 10, 24)); else f.fire('eventResizeStop', {}); }
      await tick(); f.flush(); assert.equal(writes, 0); assert.deepEqual(f.frontmatter, { scheduled: '2025-11-20' });
    } finally { f.view.unload(); }
  }
});
test('clock changes during a gesture keep its projected anchors frozen until the edit finishes', async () => {
  let current = new Date(2026, 10, 23, 23, 59);
  const f = fixture({ scheduled: '2025-11-20', until: '2025-11-22' }, () => current);
  try {
    const base = (f.configValues[ROLES_KEY] as CalendarRole[])[0]!; f.setRoles([{ ...base, rollPastDates: true }]);
    const replacements = f.calendar.replacements;
    f.resizeStart(); current = new Date(2026, 10, 24, 0, 1); f.triggerClock(); f.flush();
    assert.equal(f.calendar.replacements, replacements);
    f.resize('end', new Date(2026, 10, 23), new Date(2026, 10, 27)); await tick(); f.flush();
    assert.equal(f.frontmatter.scheduled, '2026-11-23'); assert.equal(f.frontmatter.until, '2026-11-26');
  } finally { f.view.unload(); }
});
test('changing a role rolling toggle during a pending gesture aborts its stale write', async () => {
  const f = fixture({ scheduled: '2025-11-20' }, () => new Date(2026, 10, 23, 12)), gate = deferred();
  f.setProcessor(async callback => { await gate.promise; callback(f.frontmatter); });
  try {
    const base = (f.configValues[ROLES_KEY] as CalendarRole[])[0]!; f.setRoles([{ ...base, rollPastDates: true }]);
    f.dragStart(); f.drop(new Date(2026, 10, 24)); await tick();
    f.setRoles([{ ...base, rollPastDates: false }]); gate.resolve(); await tick(); f.flush();
    assert.equal(f.frontmatter.scheduled, '2025-11-20'); assert.equal(f.reverted(), 1);
  } finally { f.view.unload(); }
});
