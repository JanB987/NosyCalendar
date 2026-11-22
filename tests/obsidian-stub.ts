// Public-value contract double only. These tests do not run Obsidian.
import { parseDate } from '../src/dates';
export const noticeMessages: string[] = [];
export class Notice { constructor(message: string) { noticeMessages.push(message); } }
export const Keymap = { isModEvent: () => false };
export class Modal {
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  modalEl: HTMLElement;
  app: any;
  private opened = false;
  constructor(app: unknown) { this.app = app; this.contentEl = document.createElement('div'); this.titleEl = document.createElement('h2'); this.modalEl = document.createElement('div'); this.modalEl.className = 'modal'; this.modalEl.append(this.titleEl, this.contentEl); }
  setTitle(title: string): this { this.titleEl.textContent = title; return this; }
  open(): void { if (!this.opened) { this.opened = true; document.body.append(this.modalEl); this.onOpen(); } }
  close(): void { if (this.opened) { this.opened = false; this.onClose(); this.modalEl.remove(); } }
  onOpen(): void {}
  onClose(): void {}
}
export class FuzzySuggestModal<T> extends Modal {
  static instances: FuzzySuggestModal<any>[] = [];
  placeholder = '';
  constructor(app: unknown) { super(app); FuzzySuggestModal.instances.push(this); }
  setPlaceholder(value: string): void { this.placeholder = value; }
  getItems(): T[] { return []; }
  getItemText(item: T): string { return String(item); }
  onChooseItem(_item: T): void {}
}
export class TFile { path = ''; extension = 'md'; basename = ''; }
export class BasesView {
  app: any;
  data: any;
  config: any;
  private cleanup: Array<() => void> = [];
  constructor(controller: { app: unknown }) { this.app = controller.app; }
  register(callback: () => void): void { this.cleanup.push(callback); }
  unload(): void { for (const callback of this.cleanup.splice(0).reverse()) callback(); }
}
export class Value {
  static equals(a: Value | null, b: Value | null): boolean {
    if (a == null || b == null) return a === b;
    if (a.constructor !== b.constructor) return false;
    if (a instanceof DateValue && b instanceof DateValue) return a.equals(b);
    if (a instanceof ListValue && b instanceof ListValue) return a.length() === b.length() && a.items.every((v, i) => Value.equals(v, b.get(i)));
    return a.toString() === b.toString();
  }
  toString(): string { return ''; }
  isTruthy(): boolean { return Boolean(this.toString()); }
}
export class NullValue extends Value {
  static value = new NullValue();
  toString(): string { return 'null'; }
}
export class StringValue extends Value {
  constructor(private text: string) { super(); }
  toString(): string { return this.text; }
}
export class NumberValue extends Value {
  constructor(private number: number) { super(); }
  toString(): string { return String(this.number); }
}
export class BooleanValue extends Value {
  constructor(private value: boolean) { super(); }
  toString(): string { return String(this.value); }
  isTruthy(): boolean { return this.value; }
}
export class LinkValue extends StringValue {
  static parseFromString(_app: unknown, input: string, _path: string): LinkValue | null {
    return /^\[\[[^\[\]]+\]\]$/.test(input) ? new LinkValue(input.replace(/\|[^\]]*/, '')) : null;
  }
}
export class ListValue extends Value {
  constructor(public items: Value[]) { super(); }
  length(): number { return this.items.length; }
  get(index: number): Value { return this.items[index] ?? NullValue.value; }
}
export class DateValue extends Value {
  constructor(private iso: string) { super(); }
  static parseFromString(iso: string): DateValue | null { return parseDate(iso) ? new DateValue(iso) : null; }
  equals(other: DateValue): boolean {
    const left = parseDate(this.iso), right = parseDate(other.iso);
    if (left?.kind !== right?.kind || !left || !right) return false;
    return left.kind === 'date' ? left.value === right.value : +left.value === +right.value;
  }
  toString(): string {
    const parsed = parseDate(this.iso);
    if (parsed?.kind === 'date') return parsed.value;
    if (!parsed) return this.iso;
    const date = parsed.value;
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
}
