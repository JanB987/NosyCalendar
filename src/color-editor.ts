import { detachedEl } from './dom';
import { FuzzySuggestModal, Modal, type App, type BasesEntry, type BasesPropertyId } from 'obsidian';
import { PropertyPicker } from './role-editor';
import { comparisonError, literalTypes, newColorRule, ruleFeedback, supportsContains, validateColorRules, valueSuggestions, validLiteral,
  type ColorRule, type Literal } from './colors';

function jsonLiteral(value: unknown): Literal {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'text', value };
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'number', value };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (Array.isArray(value)) return { type: 'list', value: value.map(jsonLiteral) };
  if (validLiteral(value)) return value;
  throw new Error('Unsupported list member.');
}
function literalJson(literal: Literal): unknown {
  if (literal.type === 'null') return null;
  if (literal.type === 'list') return literal.value.map(literalJson);
  return literal.type === 'date' || literal.type === 'link' ? literal : literal.value;
}

class LiteralPicker extends FuzzySuggestModal<Literal> {
  constructor(app: App, private items: Literal[], private selected: (value: Literal) => void) {
    super(app); this.setPlaceholder('Find a typed source value…');
  }
  getItems(): Literal[] { return this.items; }
  getItemText(item: Literal): string { return `${item.type}: ${item.type === 'null' ? 'null' : JSON.stringify(item.value)}`; }
  onChooseItem(item: Literal): void { this.selected(item); }
}

export class EventColorsEditor extends Modal {
  readonly draft: ColorRule[];
  private rows!: HTMLElement;
  private message!: HTMLElement;
  private saveButton!: HTMLButtonElement;
  private closed = false;
  private picker: Modal | null = null;
  private inputErrors = new Map<string, string>();
  private feedback = new Map<string, HTMLElement>();
  constructor(app: App, rules: ColorRule[], private properties: BasesPropertyId[], private entries: BasesEntry[],
    private saveRules: (rules: ColorRule[]) => string | null, private finished: () => void, private warnings: string[] = []) {
    super(app); this.draft = JSON.parse(JSON.stringify(rules)) as ColorRule[];
  }
  onOpen(): void {
    this.closed = false; this.setTitle('Event colors'); this.modalEl.classList.add('nosy-colors-modal');
    this.contentEl.classList.add('nosy-color-editor'); this.contentEl.replaceChildren();
    const intro = this.contentEl.createEl('p');
    intro.textContent = 'First matching rule wins, across all roles. These rules only change fills. Comparisons use source values and preserve types and case. No match keeps the existing fill.';
    this.contentEl.append(intro);
    if (this.warnings.length) {
      const warning = this.contentEl.createEl('p'); warning.textContent = `${this.warnings.join(' ')} Saving replaces invalid rows with the rules below.`;
      this.contentEl.append(warning);
    }
    const scroll = this.contentEl.createDiv(); scroll.className = 'nosy-role-table-scroll'; scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', 'Event colors table');
    const table = scroll.createEl('table'); table.className = 'nosy-color-table';
    const head = table.createEl('thead'), header = head.createEl('tr');
    for (const title of ['Property', 'Operator', 'Value', 'Fill color', 'Order', 'Remove']) {
      const cell = header.createEl('th'); cell.scope = 'col'; cell.textContent = title; header.append(cell);
    }
    head.append(header); this.rows = table.createEl('tbody'); table.append(head, this.rows); scroll.append(table); this.contentEl.append(scroll);
    this.contentEl.append(this.button('+ Add rule', () => { this.draft.push(newColorRule(this.contentEl.win)); this.renderRows(); }));
    const help = this.contentEl.createEl('p'); help.className = 'nosy-color-help';
    help.textContent = 'Choose a value type or a typed source suggestion. Empty text and null are explicit values. Dates accept ISO dates/timestamps; links use [[note]] syntax (manual links are vault-relative). Lists accept JSON arrays, e.g. ["work", 5, false]. Object/file values are unsupported. Contains is available for text or list properties; other value kinds never match contains.';
    this.contentEl.append(help);
    this.message = this.contentEl.createEl('p'); this.message.setAttribute('role', 'status'); this.contentEl.append(this.message);
    const actions = this.contentEl.createDiv(); actions.className = 'nosy-role-actions';
    this.saveButton = this.button('Save', () => {
      this.validate(); if (this.saveButton.disabled) return;
      try {
        const error = this.saveRules(JSON.parse(JSON.stringify(this.draft)) as ColorRule[]);
        if (error) this.message.textContent = error; else this.close();
      } catch (error) { this.message.textContent = `Colors were not saved: ${error instanceof Error ? error.message : String(error)}`; }
    });
    this.saveButton.className = 'mod-cta'; actions.append(this.saveButton, this.button('Cancel', () => this.close()));
    this.contentEl.append(actions); this.renderRows();
  }
  onClose(): void {
    this.closed = true; this.picker?.close(); this.picker = null; this.entries = [];
    this.feedback.clear();
    this.contentEl.replaceChildren(); this.finished();
  }
  private button(text: string, click: () => void): HTMLButtonElement {
    const button = detachedEl(this.contentEl.ownerDocument, 'button'); button.type = 'button'; button.textContent = text;
    button.addEventListener('click', click); return button;
  }
  private validate(): void {
    const error = [...this.inputErrors.values()][0] ?? validateColorRules(this.draft, this.app) ?? comparisonError(this.draft, this.entries);
    this.message.textContent = error ?? ''; this.saveButton.disabled = Boolean(error);
    for (const rule of this.draft) {
      const hint = this.feedback.get(rule.id);
      if (hint) hint.textContent = ruleFeedback(this.app, this.entries, rule);
    }
  }
  private renderRows(): void {
    const doc = this.contentEl.ownerDocument;
    this.rows.replaceChildren();
    this.feedback.clear();
    for (const [index, rule] of this.draft.entries()) {
      const row = this.rows.createEl('tr'); row.className = 'nosy-color-row'; row.dataset.ruleId = rule.id;
      const field = (...elements: HTMLElement[]) => { const cell = row.createEl('td'); cell.append(...elements); row.append(cell); };
      const property = this.button(rule.property ?? 'Choose property…', () => {
        this.picker?.close(); this.picker = new PropertyPicker(this.app, this.properties, selected => {
          if (this.closed || !this.draft.includes(rule)) return;
          rule.property = selected; rule.operand = null; this.inputErrors.delete(rule.id);
          if (!supportsContains(this.entries, selected)) rule.operator = '=';
          this.renderRows();
        }); this.picker.open();
      }); property.setAttribute('aria-label', 'Property'); field(property);
      const operator = detachedEl(doc, 'select'); operator.setAttribute('aria-label', 'Operator');
      for (const text of ['=', 'contains'] as const) {
        const option = detachedEl(doc, 'option'); option.value = text; option.textContent = text;
        option.disabled = text === 'contains' && Boolean(rule.property) && !supportsContains(this.entries, rule.property!);
        operator.append(option);
      }
      operator.value = rule.operator;
      operator.addEventListener('change', () => { rule.operator = operator.value as ColorRule['operator']; this.validate(); }); field(operator);
      const value = detachedEl(doc, 'div'); value.className = 'nosy-color-value';
      const suggestions = rule.property ? valueSuggestions(this.app, this.entries, rule.property) : [];
      const type = detachedEl(doc, 'select'); type.setAttribute('aria-label', 'Value type');
      for (const name of literalTypes) { const option = detachedEl(doc, 'option'); option.value = name; option.textContent = name; type.append(option); }
      type.value = rule.operand?.type ?? suggestions.find(item => item.type !== 'null')?.type ?? 'text';
      const input = detachedEl(doc, 'input'); input.setAttribute('aria-label', 'Value');
      const setOperand = () => {
        this.inputErrors.delete(rule.id);
        switch (type.value) {
          case 'null': rule.operand = { type: 'null' }; break;
          case 'boolean': rule.operand = boolean.value ? { type: 'boolean', value: boolean.value === 'true' } : null; break;
          case 'number':
            rule.operand = input.value.trim() && Number.isFinite(Number(input.value)) ? { type: 'number', value: Number(input.value) } : null;
            break;
          case 'list':
            try {
              const candidate = jsonLiteral(JSON.parse(input.value));
              if (candidate.type !== 'list' || !validLiteral(candidate)) throw new Error(); rule.operand = candidate;
            } catch { rule.operand = null; this.inputErrors.set(rule.id, 'Enter a JSON array for the list.'); }
            break;
          case 'date': rule.operand = { type: 'date', value: input.value }; break;
          case 'link': rule.operand = { type: 'link', value: input.value }; break;
          default: rule.operand = { type: 'text', value: input.value };
        }
        this.validate();
      };
      const boolean = detachedEl(doc, 'select'); boolean.setAttribute('aria-label', 'Boolean value');
      for (const text of ['', 'false', 'true']) { const option = detachedEl(doc, 'option'); option.value = text; option.textContent = text || 'Choose boolean…'; boolean.append(option); }
      boolean.value = rule.operand?.type === 'boolean' ? String(rule.operand.value) : '';
      boolean.addEventListener('change', setOperand);
      const configureInput = () => {
        input.type = type.value === 'number' ? 'number' : 'text'; input.step = 'any';
        input.hidden = type.value === 'null' || type.value === 'boolean'; boolean.hidden = type.value !== 'boolean';
        input.placeholder = type.value === 'date' ? 'YYYY-MM-DD or ISO timestamp' : type.value === 'link' ? '[[note]]' : type.value === 'list' ? '["work", 5, false]' : 'Enter value';
        input.value = rule.operand && rule.operand.type !== 'null' ? rule.operand.type === 'list' ? JSON.stringify(literalJson(rule.operand)) : String(rule.operand.value) : '';
      };
      configureInput(); input.addEventListener('input', setOperand);
      type.addEventListener('change', () => {
        rule.operand = null; this.inputErrors.delete(rule.id); configureInput();
        if (type.value === 'null') setOperand(); else this.validate();
      });
      const suggest = this.button('Source values…', () => {
        this.picker?.close(); this.picker = new LiteralPicker(this.app, suggestions, selected => {
          if (this.closed || !this.draft.includes(rule)) return;
          rule.operand = JSON.parse(JSON.stringify(selected)) as Literal; this.inputErrors.delete(rule.id); this.renderRows();
        }); this.picker.open();
      }); suggest.disabled = !suggestions.length;
      const empty = this.button('Use empty text', () => { rule.operand = { type: 'text', value: '' }; this.inputErrors.delete(rule.id); this.renderRows(); });
      const hint = detachedEl(doc, 'p'); hint.className = 'nosy-rule-feedback';
      this.feedback.set(rule.id, hint);
      value.append(type, input, boolean, suggest, empty, hint); field(value);
      const color = detachedEl(doc, 'input'); color.type = 'color'; color.value = rule.color; color.setAttribute('aria-label', 'Fill color');
      color.addEventListener('input', () => { rule.color = color.value; this.validate(); }); field(color);
      const up = this.button('↑', () => this.move(index, -1)), down = this.button('↓', () => this.move(index, 1));
      up.setAttribute('aria-label', 'Move rule up'); down.setAttribute('aria-label', 'Move rule down'); up.disabled = index === 0; down.disabled = index === this.draft.length - 1;
      field(up, down); field(this.button('Remove', () => { this.inputErrors.delete(rule.id); this.draft.splice(index, 1); this.renderRows(); })); this.rows.append(row);
    }
    this.validate();
  }
  private move(index: number, direction: number): void {
    const target = index + direction;
    if (target < 0 || target >= this.draft.length) return;
    [this.draft[index], this.draft[target]] = [this.draft[target]!, this.draft[index]!]; this.renderRows();
  }
}
