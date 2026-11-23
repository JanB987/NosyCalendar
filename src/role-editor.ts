import { detachedEl } from './dom';
import { FuzzySuggestModal, Modal, type App, type BasesPropertyId } from 'obsidian';
import { isPropertyId, newRole, sharedProperties, validateRoles, type CalendarRole } from './roles';

/** The native fuzzy chooser returns the original property ID, never a normalized display label. */
export class PropertyPicker extends FuzzySuggestModal<BasesPropertyId> {
  constructor(app: App, private properties: BasesPropertyId[], private selected: (property: BasesPropertyId) => void) {
    super(app);
    this.setPlaceholder('Find an existing property…');
  }
  getItems(): BasesPropertyId[] { return this.properties; }
  getItemText(item: BasesPropertyId): string { return item; }
  onChooseItem(item: BasesPropertyId): void { this.selected(item); }
}

export function propertyCatalog(app: App, available: BasesPropertyId[], roles: CalendarRole[]): BasesPropertyId[] {
  const properties = new Set<BasesPropertyId>(available);
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm) for (const key of Object.keys(fm)) properties.add(`note.${key}`);
  }
  for (const role of roles) for (const property of [role.startProperty, role.endProperty]) if (property) properties.add(property);
  return [...properties].filter(isPropertyId).sort((a, b) => a.localeCompare(b));
}

export class CalendarRolesEditor extends Modal {
  readonly draft: CalendarRole[];
  private rows!: HTMLTableSectionElement;
  private message!: HTMLElement;
  private shared!: HTMLElement;
  private saveButton!: HTMLButtonElement;
  private closed = false;
  private picker: PropertyPicker | null = null;

  constructor(app: App, roles: CalendarRole[], private properties: BasesPropertyId[],
    private saveRoles: (roles: CalendarRole[]) => string | null, private finished: () => void) {
    super(app);
    this.draft = roles.map(role => ({ ...role }));
  }

  onOpen(): void {
    this.closed = false;
    this.setTitle('Calendar roles');
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('nosy-role-editor');
    this.modalEl.classList.add('nosy-roles-modal');
    const intro = this.contentEl.createEl('p');
    intro.textContent = 'Roles are saved for this Base view. Shared properties are allowed: editing a field affects every role using that field. Edge colors change event borders independently of backgrounds.';
    this.contentEl.append(intro);
    const scroll = this.contentEl.createDiv(); scroll.className = 'nosy-role-table-scroll';
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Calendar roles table');
    const table = scroll.createEl('table'); table.className = 'nosy-role-table'; table.setAttribute('aria-label', 'Calendar roles');
    const head = table.createEl('thead'), header = head.createEl('tr');
    for (const name of ['Label', 'Start property', 'End property', 'Edge color', 'Roll past dates to today', 'Remove']) {
      const cell = header.createEl('th'); cell.scope = 'col'; cell.textContent = name; header.append(cell);
    }
    head.append(header); this.rows = table.createEl('tbody'); table.append(head, this.rows);
    scroll.append(table); this.contentEl.append(scroll);
    const add = this.button('+ Add role', () => { this.draft.push(newRole(`Role ${this.draft.length + 1}`, this.contentEl.win)); this.renderRows(); });
    add.className = 'nosy-add-role'; this.contentEl.append(add);
    this.shared = this.contentEl.createEl('p'); this.shared.className = 'nosy-role-shared'; this.contentEl.append(this.shared);
    this.message = this.contentEl.createEl('p'); this.message.setAttribute('role', 'status'); this.contentEl.append(this.message);
    const actions = this.contentEl.createDiv(); actions.className = 'nosy-role-actions'; this.contentEl.append(actions);
    this.saveButton = this.button('Save', () => {
      const validation = validateRoles(this.draft);
      if (validation) { this.message.textContent = validation; return; }
      try {
        const result = this.saveRoles(this.draft.map(role => ({ ...role, label: role.label.trim() || 'Role' })));
        if (result) this.message.textContent = result;
        else this.close();
      } catch (error) { this.message.textContent = `Roles were not saved: ${error instanceof Error ? error.message : String(error)}`; }
    });
    this.saveButton.className = 'mod-cta'; actions.append(this.saveButton, this.button('Cancel', () => this.close()));
    this.renderRows();
  }

  onClose(): void {
    this.closed = true;
    this.picker?.close(); this.picker = null;
    this.contentEl.replaceChildren();
    this.finished();
  }

  private button(text: string, click: () => void): HTMLButtonElement {
    const button = detachedEl(this.contentEl.ownerDocument, 'button');
    button.type = 'button'; button.textContent = text; button.addEventListener('click', click);
    return button;
  }

  private updateValidation(): void {
    const error = validateRoles(this.draft);
    this.message.textContent = error ?? '';
    this.saveButton.disabled = Boolean(error);
    const shared = sharedProperties(this.draft);
    this.shared.textContent = shared.length ? `Shared fields: ${shared.join(', ')}. Edits affect every role using these fields.` : '';
  }

  private renderRows(): void {
    const doc = this.contentEl.ownerDocument;
    this.rows.replaceChildren();
    for (const role of this.draft) {
      const row = this.rows.createEl('tr'); row.className = 'nosy-role-row'; row.dataset.roleId = role.id;
      const field = (control: HTMLElement) => {
        const cell = row.createEl('td'); cell.append(control); row.append(cell);
      };
      const label = detachedEl(doc, 'input'); label.type = 'text'; label.value = role.label; label.setAttribute('aria-label', 'Role label');
      label.addEventListener('input', () => { role.label = label.value; this.updateValidation(); }); field(label);
      for (const key of ['startProperty', 'endProperty'] as const) {
        const name = key === 'startProperty' ? 'Start property' : 'End property (optional)';
        const controls = detachedEl(doc, 'div'); controls.className = 'nosy-role-property';
        const pick = this.button(role[key] ?? 'Choose property…', () => {
          this.picker?.close();
          this.picker = new PropertyPicker(this.app, this.properties, property => {
            if (this.closed || !this.draft.includes(role)) return;
            role[key] = property; pick.textContent = property; this.updateValidation();
          });
          this.picker.open();
        });
        pick.setAttribute('aria-label', name);
        controls.append(pick, this.button('Clear', () => { role[key] = null; pick.textContent = 'Choose property…'; this.updateValidation(); }));
        field(controls);
      }
      const colorControls = detachedEl(doc, 'div'); colorControls.className = 'nosy-role-color';
      const color = detachedEl(doc, 'input'); color.type = 'color'; color.value = role.edgeColor ?? '#808080'; color.setAttribute('aria-label', 'Edge color');
      const colorState = detachedEl(doc, 'span'); colorState.textContent = role.edgeColor ?? 'Inherited';
      color.addEventListener('input', () => { role.edgeColor = color.value; colorState.textContent = color.value; this.updateValidation(); });
      colorControls.append(color, colorState, this.button('Use inherited color', () => { role.edgeColor = null; colorState.textContent = 'Inherited'; this.updateValidation(); }));
      field(colorControls);
      const roll = detachedEl(doc, 'input'); roll.type = 'checkbox'; roll.checked = role.rollPastDates;
      roll.setAttribute('aria-label', 'Roll past dates to today');
      roll.addEventListener('change', () => { role.rollPastDates = roll.checked; }); field(roll);
      field(this.button('Remove', () => { this.draft.splice(this.draft.indexOf(role), 1); this.renderRows(); }));
      this.rows.append(row);
    }
    this.updateValidation();
  }
}
