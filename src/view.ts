import { detachedEl } from './dom';
import { BasesView, DateValue, Keymap, Notice, TFile, type BasesEntry, type BasesPropertyId, type QueryController } from 'obsidian';
import { Calendar, type EventDropArg, type EventInput, type EventSourceApi } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import multiMonthPlugin from '@fullcalendar/multimonth';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import { convertDates, type DateInput } from './dates';
import { dateInput } from './values';
import { dropRestriction, persistMove, prepareMove, prepareResize, SerialSaves, type MoveAccess } from './writeback';
import { resultReady, type AwaitingResult } from './results';
import { eventClasses, eventContents, resizeRendering } from './handles';
import { eventId, readRoles, ROLES_KEY, roleMappings, roleStamp, sharedProperties, validateRoles, type CalendarRole } from './roles';
import { CalendarRolesEditor, propertyCatalog } from './role-editor';
import { planDisplayedMove, planDisplayedResize, projectDates, type DateProjection } from './rolling';
import { watchLocalClock } from './local-clock';
import { COLORS_KEY, comparisonError, compileColors, contrastingText, readColorRules, validateColorRules } from './colors';
import { EventColorsEditor } from './color-editor';
import { StyleLayout } from './style-layout';
import { isoPeriod } from './iso-weeks';

export const VIEW_TYPE = 'nosy-calendar';
interface RenderedNote { access: MoveAccess; resizeAccess: MoveAccess; file: TFile; role: CalendarRole; projection: DateProjection }
interface DragContext extends RenderedNote { mappingVersion: number; dataRevision: number; kind: 'move' | 'resize' }

export class NosyCalendarView extends BasesView {
  readonly type = VIEW_TYPE;
  private root: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private calendar: Calendar | null = null;
  private source: EventSourceApi | null = null;
  private refreshFrame: number | null = null;
  private resizeFrame: number | null = null;
  private disposed = false;
  private eventKeys = new Map<HTMLElement, (event: KeyboardEvent) => void>();
  private rendered = new Map<string, RenderedNote>();
  private dragContext: DragContext | null = null;
  private dragging = false;
  private saving = false;
  private suppressClickUntil = 0;
  private dragWarnings = new Set<string>();
  private mappingStamp = '';
  private mappingVersion = 0;
  private dataRevision = 0;
  private awaiting = new Map<string, AwaitingResult & { file: TFile; sourceChanged: boolean; roleId: string }>();
  private editor: CalendarRolesEditor | null = null;
  private colorEditor: EventColorsEditor | null = null;
  private migrationAttempted = false;
  private configError = '';
  private migrationError = '';
  private styleLayout: StyleLayout | null = null;

  constructor(controller: QueryController, private parent: HTMLElement, private onDisposed: () => void, private saves: SerialSaves, private now = () => new Date()) {
    super(controller);
  }

  onload(): void {
    this.disposed = false;
    const doc = this.parent.ownerDocument;
    const win = doc.defaultView!;
    const root = this.root = this.parent.createDiv();
    root.className = 'nosy-calendar';
    this.parent.append(root);
    const status = this.status = root.createDiv();
    status.className = 'nosy-calendar-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(status);
    const host = root.createDiv();
    host.className = 'nosy-calendar-host';
    root.append(host);
    this.calendar = new Calendar(host, {
      ...resizeRendering,
      plugins: [timeGridPlugin, dayGridPlugin, multiMonthPlugin, interactionPlugin],
      initialView: 'timeGridWeek',
      firstDay: 1, timeZone: 'local', locale: 'en',
      now: this.now,
      height: '100%',
      headerToolbar: { left: 'prev,next today calendarRoles eventColors', center: 'title', right: 'timeGridWeek,timeGridDay,dayGridMonth,multiMonthYear' },
      customButtons: {
        calendarRoles: { text: 'Calendar roles', hint: 'Configure roles for this Base view', click: () => this.openRolesEditor() },
        eventColors: { text: 'Event colors', hint: 'Configure conditional fills for this Base view', click: () => this.openColorsEditor() }
      },
      buttonText: { today: 'Today', week: 'Week', day: 'Day', month: 'Month', year: 'Year' },
      buttonHints: { prev: 'Previous period', next: 'Next period', today: 'Go to today' },
      views: { dayGridMonth: { weekNumbers: true }, multiMonthYear: { buttonText: 'Year', weekNumbers: true } },
      weekNumberCalculation: 'ISO', weekNumbers: false, weekText: 'W',
      datesSet: info => {
        const heading = host.querySelector('.fc-toolbar-title')?.parentElement;
        if (!heading) return;
        heading.classList.add('nosy-heading');
        let indicator = heading.querySelector<HTMLElement>('.nosy-iso-indicator');
        if (!indicator) { indicator = heading.createSpan(); indicator.className = 'nosy-iso-indicator'; heading.append(indicator); }
        indicator.textContent = isoPeriod(info.view.currentStart, info.view.currentEnd, info.view.type);
        indicator.setAttribute('aria-label', `Displayed ISO weeks: ${indicator.textContent}`);
      },
      dayHeaderContent: info => {
        const weekday = detachedEl(doc, 'span'); weekday.className = 'nosy-weekday';
        weekday.textContent = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(info.date);
        const domNodes = [weekday];
        if (info.view.type === 'timeGridWeek' || info.view.type === 'timeGridDay') {
          const date = detachedEl(doc, 'span'); date.className = 'nosy-header-date';
          date.textContent = new Intl.DateTimeFormat('en', {day:'numeric',month:'short'}).format(info.date); domNodes.push(date);
        }
        return { domNodes };
      },
      eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
      editable: false, eventStartEditable: false, eventDurationEditable: false,
      defaultTimedEventDuration: '00:30:00',
      slotDuration: { minutes: 30 },
      allDayMaintainDuration: false,
      eventDragMinDistance: 6,
      eventDragStart: info => this.beginGesture(info.event.id, 'move'),
      eventDragStop: () => this.stopGesture(),
      eventResizeStart: info => this.beginGesture(info.event.id, 'resize'),
      eventResizeStop: () => this.stopGesture(),
      eventResize: info => { void this.saveGesture(info, 'resize'); },
      eventAllow: drop => {
        const context = this.dragContext;
        const snapshot = context && this.gestureSnapshot(context);
        const reason = this.saving ? 'Wait for the current change to finish saving.'
          : !context || !snapshot ? 'This gesture is unavailable for this event.'
          : !this.isCurrent(context) ? 'The note or property mappings changed; drag again after refresh.'
          : this.saves.isBusy(snapshot.path) ? 'This note is already being saved in another view.'
          : context.kind === 'resize' ? (drop.allDay !== snapshot.dates.allDay ? 'Resizing must keep the all-day or timed kind unchanged.'
            : +drop.end <= +drop.start ? 'The end must follow the start.' : null) : dropRestriction(snapshot, drop.allDay);
        if (reason && !this.dragWarnings.has(reason)) {
          this.dragWarnings.add(reason);
          new Notice(reason);
        }
        return !reason;
      },
      eventDrop: info => { void this.saveGesture(info, 'move'); },
      selectable: false, droppable: false, navLinks: false,
      allDaySlot: true, dayMaxEvents: true, moreLinkClick: 'popover',
      nowIndicator: true, multiMonthMinWidth: 240,
      eventClick: info => {
        info.jsEvent.preventDefault();
        this.openNote(info.event.extendedProps.path, Keymap.isModEvent(info.jsEvent));
      },
      eventClassNames: eventClasses,
      eventContent: info => eventContents(doc, info),
      eventDidMount: info => {
        this.styleLayout?.mount(info.el);
        if (info.event.borderColor) info.el.style.setProperty('--nosy-role-edge', info.event.borderColor);
        if (info.event.backgroundColor) {
          info.el.classList.add('nosy-custom-fill');
          info.el.style.setProperty('--nosy-event-ink', info.event.textColor);
        }
        info.el.setAttribute('tabindex', '0');
        info.el.setAttribute('role', 'button');
        info.el.setAttribute('aria-label', `Open note: ${info.event.title}`);
        const moveReason = info.event.extendedProps.readOnlyReason as string | undefined;
        const resizeReason = info.event.extendedProps.resizeReason as string | undefined;
        const actions = [moveReason ? `Body drag unavailable: ${moveReason}` : 'Drag body to move.',
          resizeReason ? `Resize unavailable: ${resizeReason}` : 'Drag either endpoint handle to resize. Partial periods convert to exact dates.'];
        info.el.title = `${info.event.title}\n${actions.join('\n')}`;
        if (info.event.extendedProps.rolled) info.el.title += `\nRolled to today. Original: ${String(info.event.extendedProps.originalDatesText)}`;
        info.el.setAttribute('aria-label', `Open note: ${info.event.title}. ${actions.join(' ')}${info.event.extendedProps.rolled ? ` Rolled to today. Original: ${String(info.event.extendedProps.originalDatesText)}` : ''}`);
        for (const handle of info.el.querySelectorAll<HTMLElement>('.fc-event-resizer')) {
          handle.title = handle.classList.contains('fc-event-resizer-start') ? 'Resize start' : 'Resize end';
          handle.setAttribute('aria-label', handle.title);
        }
        const key = (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          this.openNote(info.event.extendedProps.path, event.ctrlKey || event.metaKey);
        };
        info.el.addEventListener('keydown', key);
        this.eventKeys.set(info.el, key);
      },
      eventWillUnmount: info => {
        this.styleLayout?.unmount(info.el);
        const key = this.eventKeys.get(info.el);
        if (key) info.el.removeEventListener('keydown', key);
        this.eventKeys.delete(info.el);
      }
    });
    this.register(() => {
      this.disposed = true;
      if (this.refreshFrame !== null) win.cancelAnimationFrame(this.refreshFrame);
      if (this.resizeFrame !== null) win.cancelAnimationFrame(this.resizeFrame);
      this.refreshFrame = this.resizeFrame = null;
      this.styleLayout?.dispose(); this.styleLayout = null;
      this.calendar?.destroy();
      this.calendar = null;
      this.source = null;
      for (const [element, key] of this.eventKeys) element.removeEventListener('keydown', key);
      this.eventKeys.clear();
      this.rendered.clear();
      this.awaiting.clear();
      this.dragContext = null;
      this.dragging = false;
      this.editor?.close(); this.editor = null;
      this.colorEditor?.close(); this.colorEditor = null;
      root.remove();
      this.root = this.status = null;
      this.onDisposed();
    });
    const observer = new ResizeObserver(() => {
      if (this.resizeFrame !== null || this.disposed) return;
      this.resizeFrame = win.requestAnimationFrame(() => {
        this.resizeFrame = null;
        if (root.clientWidth > 0 && root.clientHeight > 0) this.calendar?.updateSize();
      });
    });
    observer.observe(root);
    this.register(() => observer.disconnect());
    const cacheRef = this.app.metadataCache.on('changed', file => {
      for (const wait of this.awaiting.values()) if (wait.file === file) wait.sourceChanged = true;
      this.queueRefresh();
    });
    this.register(() => this.app.metadataCache.offref(cacheRef));
    this.register(watchLocalClock(win, doc, () => this.queueRefresh(), this.now));
    this.calendar.render();
    this.styleLayout = new StyleLayout(root, this.calendar, () => this.dragging || this.saving);
    const styleRef = this.app.workspace.on('css-change', () => this.styleLayout?.request());
    this.register(() => this.app.workspace.offref(styleRef));
    this.queueRefresh();
  }

  private beginGesture(id: string, kind: 'move' | 'resize'): void {
    this.dragging = true;
    this.suppressClickUntil = Infinity;
    this.dragWarnings.clear();
    this.styleLayout?.freeze(this.eventKeys.keys());
    this.observeMappings();
    const note = this.rendered.get(id);
    this.dragContext = note ? { ...note, kind, mappingVersion: this.mappingVersion, dataRevision: this.dataRevision } : null;
    if (this.refreshFrame !== null) this.parent.ownerDocument.defaultView!.cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = null;
  }

  private stopGesture(): void {
    this.dragging = false;
    this.suppressClickUntil = Date.now() + 400;
    const context = this.dragContext;
    // Both native stop callbacks precede their change callback; defer cancelled/no-op cleanup.
    queueMicrotask(() => {
      if (!this.saving && this.dragContext === context) {
        this.dragContext = null;
        this.styleLayout?.release();
        this.queueRefresh();
      }
    });
  }

  private gestureSnapshot(context: DragContext) {
    return (context.kind === 'resize' ? context.resizeAccess : context.access).snapshot;
  }

  onDataUpdated(): void {
    this.dataRevision++;
    this.observeMappings();
    this.queueRefresh();
  }

  private roles(): CalendarRole[] {
    if (!this.config) return [];
    try {
      const state = readRoles(this.config);
      if (!state.migrate) this.migrationError = '';
      this.configError = this.migrationError;
      if (state.migrate && !this.migrationAttempted && state.roles.some(role => role.startProperty)) {
        this.migrationAttempted = true;
        try { this.config.set(ROLES_KEY, state.roles.map(role => ({ ...role }))); }
        catch (error) { this.configError = this.migrationError = `Legacy roles could not be saved: ${error instanceof Error ? error.message : String(error)}`; }
      }
      return state.roles;
    } catch (error) { this.configError = error instanceof Error ? error.message : String(error); return []; }
  }

  private openRolesEditor(): void {
    if (this.disposed || !this.config) return;
    if (this.editor) return;
    const roles = this.roles();
    const config = this.config;
    const original = JSON.stringify(config.get(ROLES_KEY));
    this.editor = new CalendarRolesEditor(this.app, roles, propertyCatalog(this.app, this.allProperties ?? [], roles), draft => {
      if (this.disposed) return 'This calendar view was closed. Reopen it before saving roles.';
      if (this.config !== config || JSON.stringify(config.get(ROLES_KEY)) !== original) return 'Role settings changed while this editor was open. Cancel and reopen it to keep those changes.';
      const error = validateRoles(draft); if (error) return error;
      config.set(ROLES_KEY, draft.map(role => ({ ...role })));
      this.observeMappings(); this.queueRefresh();
      return null;
    }, () => { this.editor = null; });
    this.editor.open();
  }

  private observeMappings(): void {
    const stamp = JSON.stringify(this.roles());
    if (stamp !== this.mappingStamp) { this.mappingStamp = stamp; this.mappingVersion++; }
  }

  private openColorsEditor(): void {
    if (this.disposed || !this.config || this.colorEditor) return;
    const config = this.config, original = JSON.stringify(config.get(COLORS_KEY));
    const state = readColorRules(config.get(COLORS_KEY), this.app);
    const properties = new Set(propertyCatalog(this.app, this.allProperties ?? [], this.roles()));
    for (const rule of state.rules) if (rule.property) properties.add(rule.property);
    this.colorEditor = new EventColorsEditor(this.app, state.rules, [...properties].sort(), this.data?.data ?? [], draft => {
      if (this.disposed) return 'This calendar view was closed. Reopen it before saving colors.';
      if (this.config !== config || JSON.stringify(config.get(COLORS_KEY)) !== original) return 'Event color settings changed while this editor was open. Cancel and reopen it to keep those changes.';
      const error = validateColorRules(draft, this.app); if (error) return error;
      config.set(COLORS_KEY, draft); this.queueRefresh(); return null;
    }, () => { this.colorEditor = null; }, state.errors);
    this.colorEditor.open();
  }

  private queueRefresh(): void {
    if (this.disposed || !this.calendar || this.refreshFrame !== null || this.dragging || this.saving) return;
    const win = this.parent.ownerDocument.defaultView!;
    this.refreshFrame = win.requestAnimationFrame(() => {
      this.refreshFrame = null;
      if (!this.disposed && !this.dragging && !this.saving && this.data && this.config) this.refresh();
    });
  }

  private refresh(): void {
    const roles = this.roles();
    const colors = readColorRules(this.config.get(COLORS_KEY), this.app);
    for (const [index, rule] of colors.rules.entries()) {
      const error = comparisonError([rule], this.data.data);
      if (error) colors.errors.push(`Event color rule ${index + 1}: ${error.replace(/^Rule 1: /, '')}`);
    }
    const colorFor = compileColors(colors.rules, this.app);
    const fills = new Map(this.data.data.map(entry => [entry.file.path, colorFor(entry)]));
    const currentEntries = new Map(this.data.data.map(entry => [entry.file.path, entry]));
    for (const [path, wait] of this.awaiting) {
      const role = roles.find(role => role.id === wait.roleId);
      if (!role) { this.awaiting.delete(path); continue; }
      const startProperty = role.startProperty, endProperty = role.endProperty, mappings = roleMappings(role);
      const entry = currentEntries.get(path);
      const current = entry && startProperty ? { start: this.readDate(entry, startProperty), end: endProperty ? this.readDate(entry, endProperty) : null } : undefined;
      const fm = this.app.metadataCache.getFileCache(wait.file)?.frontmatter;
      const raw = (value: unknown): DateInput => typeof value === 'string' || typeof value === 'number' || value == null ? value : '\u0000invalid';
      const source = fm ? { start: raw(fm[wait.mappings.start!.slice(5)]),
        end: wait.mappings.end ? raw(fm[wait.mappings.end.slice(5)]) : null, changedSinceSave: wait.sourceChanged } : undefined;
      if (resultReady(wait, mappings, this.dataRevision, current, source)) this.awaiting.delete(path);
    }
    const events: EventInput[] = [];
    const omissions = new Map<string, number>();
    const readOnly = new Map<string, number>();
    const roleErrors: string[] = [];
    this.rendered.clear();
    for (const role of roles) {
      const startProperty = role.startProperty, endProperty = role.endProperty, mappings = roleMappings(role);
      if (!startProperty) continue;
      if (startProperty === endProperty) { roleErrors.push(`${role.label}: Start and End must use different properties.`); continue; }
      for (const entry of this.data.data) {
        // A saved move waits for query confirmation; a stale row must not restore its old position.
        if (this.awaiting.has(entry.file.path)) continue;
        const start = this.readDate(entry, startProperty), end = endProperty ? this.readDate(entry, endProperty) : null;
        const result = convertDates(start, end);
        if (result.reason) {
          const reason = `${role.label}: ${result.reason}`;
          omissions.set(reason, (omissions.get(reason) ?? 0) + 1);
          continue;
        }
        let projection: DateProjection;
        try { projection = projectDates(start, end, result.dates, role.rollPastDates, this.now()); }
        catch { const reason = `${role.label}: projected date outside supported range`; omissions.set(reason, (omissions.get(reason) ?? 0) + 1); continue; }
        const frontmatter = this.app.metadataCache.getFileCache(entry.file)?.frontmatter;
        const access: MoveAccess = entry.file.extension === 'md'
          ? prepareMove(entry.file.path, mappings, frontmatter, start, end)
          : { reason: 'Only Markdown notes can be rescheduled.' };
        const resizeAccess: MoveAccess = entry.file.extension === 'md'
          ? prepareResize(entry.file.path, mappings, frontmatter, start, end)
          : { reason: 'Only Markdown notes can be resized.' };
        const id = eventId(entry.file.path, role.id);
        this.rendered.set(id, { access, resizeAccess, file: entry.file, role, projection });
        const reason = [access.reason ? `Body drag: ${access.reason}` : '', resizeAccess.reason ? `Resize: ${resizeAccess.reason}` : ''].filter(Boolean).join(' ');
        if (reason) readOnly.set(reason, (readOnly.get(reason) ?? 0) + 1);
        events.push({ id, title: `${entry.file.basename} · ${role.label}`, ...projection.dates,
          ...(fills.get(entry.file.path) ? { backgroundColor: fills.get(entry.file.path), textColor: contrastingText(fills.get(entry.file.path)!) } : {}),
          ...(role.edgeColor ? { borderColor: role.edgeColor } : {}),
          startEditable: Boolean(access.snapshot), durationEditable: Boolean(resizeAccess.snapshot),
          extendedProps: { path: entry.file.path, noteTitle: entry.file.basename, roleId: role.id, roleLabel: role.label, rolled: projection.rolled,
            originalDatesText: projection.originalText, readOnlyReason: access.reason, resizeReason: resizeAccess.reason } });
      }
    }
    this.calendar!.batchRendering(() => {
      this.source?.remove();
      this.source = this.calendar!.addEventSource(events);
    });
    const omitted = [...omissions.values()].reduce((sum, count) => sum + count, 0);
    const messages: string[] = [];
    messages.push(...colors.errors);
    messages.push(...roleErrors);
    if (this.configError) messages.push(this.configError);
    if (!roles.some(role => role.startProperty)) messages.push('Open Calendar roles and map Start for at least one role. End is optional.');
    else if (!events.length && !this.awaiting.size) messages.push('No dated matches in the current Bases results.');
    if (omitted) messages.push(`${omitted} omitted (${[...omissions].map(([reason, count]) => `${count} ${reason}`).join('; ')}).`);
    if (readOnly.size) messages.push([...readOnly].map(([reason, count]) => `${count} — ${reason}`).join(' '));
    const shared = sharedProperties(roles);
    if (shared.length) messages.push(`Shared fields: ${shared.join(', ')}. Edits affect every role using these fields.`);
    if (this.awaiting.size) messages.push('Change saved; waiting for updated Bases results.');
    this.status!.textContent = messages.join(' ');
    this.status!.hidden = messages.length === 0;
  }

  private isCurrent(context: DragContext): boolean {
    const snapshot = this.gestureSnapshot(context);
    const role = this.roles().find(role => role.id === context.role.id);
    const mappings = role ? roleMappings(role) : { start: null, end: null };
    return !this.disposed && Boolean(snapshot) && context.mappingVersion === this.mappingVersion &&
      Boolean(role) && roleStamp(context.role) === roleStamp(role!) &&
      mappings.start === snapshot!.mappings.start && mappings.end === snapshot!.mappings.end &&
      context.file.path === snapshot!.path && this.app.vault.getAbstractFileByPath(snapshot!.path) === context.file;
  }

  private async saveGesture(info: EventDropArg | EventResizeDoneArg, kind: 'move' | 'resize'): Promise<void> {
    const context = this.dragContext;
    const snapshot = context && this.gestureSnapshot(context);
    if (this.saving || !context || context.kind !== kind || !snapshot || !info.event.start) {
      info.revert();
      if (!this.disposed) new Notice('This event cannot be edited now. Wait for refreshed results.');
      return;
    }
    this.saving = true;
    if (this.status) { this.status.hidden = false; this.status.textContent = `Saving ${kind}…`; }
    try {
      let plan;
      if (kind === 'resize') {
        if (!('startDelta' in info)) throw new Error('The resize has no endpoint information.');
        const changed = (delta: EventResizeDoneArg['startDelta']) => Boolean(delta.years || delta.months || delta.days || delta.milliseconds);
        const startChanged = changed(info.startDelta), endChanged = changed(info.endDelta);
        if (startChanged && endChanged) throw new Error('Resize only one endpoint at a time.');
        if (!startChanged && !endChanged) { info.revert(); return; }
        if (!info.event.end) throw new Error('The resized event has no displayed end.');
        plan = planDisplayedResize(snapshot, context.projection, startChanged ? 'start' : 'end', { start: info.event.start, end: info.event.end, allDay: info.event.allDay });
      } else plan = planDisplayedMove(snapshot, context.projection, { start: info.event.start, allDay: info.event.allDay });
      if (!plan) { info.revert(); return; }
      info.event.setDates(plan.dates.start, plan.dates.end, { allDay: plan.dates.allDay });
      info.event.setProp('startEditable', false);
      info.event.setProp('durationEditable', false);
      await this.saves.run(snapshot.path, () => persistMove(snapshot, plan, {
        isCurrent: () => this.isCurrent(context),
        processFrontMatter: callback => this.app.fileManager.processFrontMatter(context.file, callback)
      }));
      if (!this.disposed) this.awaiting.set(snapshot.path, {
        plan, mappings: snapshot.mappings, dragRevision: context.dataRevision, settledRevision: this.dataRevision,
        before: { start: snapshot.startInput, end: snapshot.endInput }, file: context.file, sourceChanged: false, roleId: context.role.id
      });
    } catch (error: unknown) {
      if (!this.disposed) {
        info.revert();
        new Notice(`${kind === 'move' ? 'Move' : 'Resize'} not saved: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      this.saving = false;
      this.dragContext = null;
      this.styleLayout?.release();
      this.queueRefresh();
    }
  }

  private readDate(entry: BasesEntry, property: BasesPropertyId): DateInput {
    const value = entry.getValue(property);
    const original = value instanceof DateValue && property.startsWith('note.')
      ? this.app.metadataCache.getFileCache(entry.file)?.frontmatter?.[property.slice(5)] as unknown
      : undefined;
    return dateInput(value, original);
  }

  private openNote(path: unknown, newLeaf: boolean | 'tab' | 'split' | 'window'): void {
    if (this.disposed || this.dragging || Date.now() < this.suppressClickUntil || typeof path !== 'string') return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) { new Notice('This calendar note is no longer available.'); return; }
    void this.app.workspace.getLeaf(newLeaf).openFile(file).catch((error: unknown) => {
      console.error('NosyCalendar: could not open note', error);
      new Notice('NosyCalendar could not open this note. See the console for details.');
    });
  }
}
