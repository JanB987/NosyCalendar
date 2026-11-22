import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BooleanValue, LinkValue, ListValue, NumberValue, StringValue, type App, type BasesEntry } from 'obsidian';
import { FuzzySuggestModal } from './obsidian-stub';
import { EventColorsEditor } from '../src/color-editor';
import { type ColorRule, type Literal } from '../src/colors';
import type { PropertyPicker } from '../src/role-editor';

const dom = new JSDOM('<!doctype html><body></body>'); globalThis.document = dom.window.document;
after(() => dom.window.close());
const app = {} as App;
const properties = ['note.Exact CASE.With Spaces', 'formula.score', 'note.done'] as const;
const entries = [{ file: { path: 'a.md' }, getValue: (key: string) => key === 'note.done' ? new BooleanValue(false) : key === 'formula.score' ? new NumberValue(0) : new StringValue('Waiting') }] as unknown as BasesEntry[];
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === text)!;
const lastPicker = () => FuzzySuggestModal.instances[FuzzySuggestModal.instances.length - 1]!;
const select = (root: HTMLElement, label: string, value: string) => {
  const el = root.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!; el.value = value; el.dispatchEvent(new dom.window.Event('change')); return el;
};
const input = (root: HTMLElement, label: string, value: string) => {
  const el = root.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!; el.value = value; el.dispatchEvent(new dom.window.Event('input')); return el;
};
const chooseProperty = (root: HTMLElement, property: typeof properties[number]) => {
  root.querySelector<HTMLButtonElement>('[aria-label="Property"]')!.click();
  const picker = lastPicker() as unknown as PropertyPicker;
  assert.ok(picker.getItems().includes(property)); picker.onChooseItem(property); picker.close();
};

test('real color form supports typed source selection, add/reorder/remove and exact property IDs', () => {
  let saved: ColorRule[] = [];
  const editor = new EventColorsEditor(app, [], [...properties], entries, rules => { saved = rules; return null; }, () => {}); editor.open();
  try {
    const root = editor.contentEl; button(root, '+ Add rule').click(); assert.equal(button(root, 'Save').disabled, true);
    chooseProperty(root, properties[0]); button(root, 'Source values…').click();
    const picker = lastPicker() as unknown as { getItems(): Literal[]; onChooseItem(value: Literal): void; close(): void };
    assert.deepEqual(picker.getItems(), [{ type: 'text', value: 'Waiting' }]); picker.onChooseItem(picker.getItems()[0]!); picker.close();
    input(root, 'Fill color', '#ffffff'); const first = editor.draft[0]!.id;
    button(root, '+ Add rule').click(); chooseProperty(root.querySelectorAll<HTMLElement>('.nosy-color-row')[1]!, properties[1]);
    const second = root.querySelectorAll<HTMLElement>('.nosy-color-row')[1]!; input(second, 'Value', '0');
    assert.equal(second.querySelector<HTMLOptionElement>('option[value="contains"]')!.disabled, true);
    second.querySelector<HTMLButtonElement>('[aria-label="Move rule up"]')!.click(); assert.equal(editor.draft[1]!.id, first);
    button(root.querySelectorAll<HTMLElement>('.nosy-color-row')[1]!, 'Remove').click(); button(root, 'Save').click();
    assert.equal(saved.length, 1); assert.equal(saved[0]?.property, 'formula.score'); assert.deepEqual(saved[0]?.operand, { type: 'number', value: 0 });
  } finally { editor.close(); }
});
test('unfinished, empty text, false and null remain distinct; invalid typed input is visibly rejected', () => {
  const editor = new EventColorsEditor(app, [], [...properties], entries, () => null, () => {}); editor.open();
  try {
    const root = editor.contentEl; button(root, '+ Add rule').click(); chooseProperty(root, 'note.done');
    assert.equal(editor.draft[0]?.operand, null); select(root, 'Boolean value', 'false');
    assert.deepEqual(editor.draft[0]?.operand, { type: 'boolean', value: false }); assert.equal(button(root, 'Save').disabled, false);
    select(root, 'Value type', 'null'); assert.deepEqual(editor.draft[0]?.operand, { type: 'null' });
    button(root, 'Use empty text').click(); assert.deepEqual(editor.draft[0]?.operand, { type: 'text', value: '' });
    select(root, 'Value type', 'date'); input(root, 'Value', 'not a date');
    assert.equal(button(root, 'Save').disabled, true); assert.match(root.querySelector('[role=status]')!.textContent!, /ISO/);
    input(root, 'Value', '2026-11-23'); assert.equal(button(root, 'Save').disabled, false);
    select(root, 'Value type', 'list'); input(root, 'Value', 'alert("do not execute")');
    assert.equal(button(root, 'Save').disabled, true); assert.match(root.querySelector('[role=status]')!.textContent!, /JSON/);
    input(root, 'Value', '[{"type":"number","value":0}]'); assert.equal(button(root, 'Save').disabled, false);
  } finally { editor.close(); }
});
test('Cancel discards edits, failed saves stay open, and removed-row picker callbacks cannot resurrect rules', () => {
  const original: ColorRule[] = [{ id: 'a', property: properties[0], operator: '=', operand: { type: 'text', value: 'Waiting' }, color: '#ffffff' }];
  let saves = 0;
  const editor = new EventColorsEditor(app, original, [...properties], entries, () => { saves++; return 'Settings changed elsewhere.'; }, () => {}); editor.open();
  const root = editor.contentEl; input(root, 'Value', 'New'); button(root, 'Save').click(); assert.equal(saves, 1);
  assert.match(root.querySelector('[role=status]')!.textContent!, /changed elsewhere/); assert.ok(root.isConnected);
  root.querySelector<HTMLButtonElement>('[aria-label="Property"]')!.click(); const picker = lastPicker() as unknown as PropertyPicker;
  button(root, 'Remove').click(); picker.onChooseItem(properties[1]); assert.equal(editor.draft.length, 0);
  button(root, 'Cancel').click(); assert.equal(saves, 1); assert.equal(original[0]?.operand?.type === 'text' && original[0].operand.value, 'Waiting');
  assert.equal(root.isConnected, false);
});

test('real editor diagnoses saved text-versus-project-link mismatch and source picker repairs the typed operand', () => {
  const sources = [{ file: { path: 'Start file/Welcome.md' }, getValue: () => new ListValue([LinkValue.parseFromString(app, '[[PRJT - Debeka]]', '')!]) }] as unknown as BasesEntry[];
  const rules: ColorRule[] = [{ id: 'saved', property: 'note.project', operator: 'contains', operand: { type: 'text', value: 'Debeka' }, color: '#3788d8' }];
  let saved: ColorRule[] = [];
  const editor = new EventColorsEditor(app, rules, ['note.project'], sources, draft => { saved = draft; return null; }, () => {}); editor.open();
  try {
    const root = editor.contentEl;
    assert.match(root.querySelector('.nosy-rule-feedback')!.textContent!, /0 of 1 source notes/);
    assert.match(root.querySelector('.nosy-rule-feedback')!.textContent!, /text such as a project name does not match a link/);
    button(root, 'Source values…').click();
    const picker = lastPicker() as unknown as { getItems(): Literal[]; onChooseItem(value: Literal): void; close(): void };
    picker.onChooseItem(picker.getItems()[0]!); picker.close();
    assert.equal(root.querySelector<HTMLSelectElement>('[aria-label="Value type"]')!.value, 'link');
    assert.match(root.querySelector('.nosy-rule-feedback')!.textContent!, /1 of 1 source notes/);
    button(root, 'Save').click(); assert.equal(saved[0]?.operand?.type, 'link');
    assert.deepEqual(rules[0]?.operand, { type: 'text', value: 'Debeka' });
  } finally { editor.close(); }
});
