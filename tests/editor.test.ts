import { installDomHelpers } from './dom-helpers.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { App, BasesPropertyId } from 'obsidian';
import { FuzzySuggestModal } from './obsidian-stub';
import { CalendarRolesEditor, propertyCatalog, PropertyPicker } from '../src/role-editor';
import { newRole, type CalendarRole } from '../src/roles';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
installDomHelpers(dom.window.document);
globalThis.document = dom.window.document;
after(() => dom.window.close());

test('role editor in a second document uses its window for new IDs while another window is focused', () => {
  const popout = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  installDomHelpers(popout.window.document);
  Object.defineProperty(popout.window.crypto, 'randomUUID', { configurable: true, value: () => 'popout-role-id' });
  const original = { ...newRole('Saved'), id: 'keep-saved-role', startProperty: 'note.end' as const };
  const editor = new CalendarRolesEditor({} as App, [original], [], () => null, () => {});
  popout.window.document.adoptNode(editor.modalEl);
  editor.open();
  try {
    assert.equal(editor.contentEl.ownerDocument, popout.window.document);
    for (const node of editor.contentEl.querySelectorAll('*')) assert.equal(node.ownerDocument, popout.window.document);
    button(editor.contentEl, '+ Add role').click();
    assert.deepEqual(editor.draft.map(role => role.id), ['keep-saved-role', 'popout-role-id']);
    assert.deepEqual(original, { ...original, label: 'Saved' });
    assert.deepEqual([...editor.contentEl.querySelectorAll('thead th')].map(el => el.textContent), ['Label', 'Start property', 'End property', 'Edge color', 'Roll past dates to today', 'Remove']);
    button(editor.contentEl, 'Cancel').click();
  } finally { editor.close(); popout.window.close(); }
});
const app = { vault: { getMarkdownFiles: () => [{ path: 'a.md' }, { path: 'b.md' }] }, metadataCache: {
  getFileCache: (file: { path: string }) => ({ frontmatter: file.path === 'a.md' ? { 'Exact CASE.With Spaces': '2026-11-23' } : { elsewhere: '2026-11-24' } })
} } as unknown as App;
const properties: BasesPropertyId[] = ['note.Exact CASE.With Spaces', 'note.end', 'formula.When', 'file.ctime'];
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!;
const change = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };

test('property catalog includes notes outside the Base and retains exact IDs and derived sources', () => {
  const catalog = propertyCatalog(app, ['formula.When', 'file.ctime'], []);
  assert.ok(catalog.includes('note.elsewhere'));
  assert.ok(catalog.includes('note.Exact CASE.With Spaces'));
  assert.ok(catalog.includes('formula.When')); assert.ok(catalog.includes('file.ctime'));
});
test('real role form input, color, toggle, native-picker callback and Save persist the draft', () => {
  let saved: CalendarRole[] = [];
  const editor = new CalendarRolesEditor(app, [newRole()], properties, roles => { saved = roles; return null; }, () => {});
  editor.open();
  try {
    const root = editor.contentEl;
    assert.equal(button(root, 'Save').disabled, true);
    change(root.querySelector<HTMLInputElement>('[aria-label="Role label"]')!, 'My arbitrary role');
    change(root.querySelector<HTMLInputElement>('input[type=color]')!, '#123456');
    const roll = root.querySelector<HTMLInputElement>('input[type=checkbox]')!; roll.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Start property"]')!.click();
    const picker = FuzzySuggestModal.instances[FuzzySuggestModal.instances.length - 1] as unknown as PropertyPicker;
    assert.ok(picker instanceof FuzzySuggestModal);
    assert.deepEqual(picker.getItems(), properties);
    picker.onChooseItem('note.Exact CASE.With Spaces'); picker.close();
    assert.equal(button(root, 'Save').disabled, false);
    button(root, 'Save').click();
    assert.equal(saved[0]?.label, 'My arbitrary role'); assert.equal(saved[0]?.edgeColor, '#123456');
    assert.equal(saved[0]?.startProperty, 'note.Exact CASE.With Spaces'); assert.equal(saved[0]?.rollPastDates, true);
  } finally { editor.close(); }
});
test('Add/Remove controls preserve remaining role identity; incomplete rows do not block a valid row', () => {
  const role = { ...newRole('First'), startProperty: 'note.end' as const };
  const editor = new CalendarRolesEditor(app, [role], properties, () => null, () => {}); editor.open();
  try {
    button(editor.contentEl, '+ Add role').click();
    assert.equal(editor.draft.length, 2); assert.equal(editor.draft[1]?.rollPastDates, false);
    assert.equal(button(editor.contentEl, 'Save').disabled, false);
    const secondId = editor.draft[1]!.id;
    button(editor.contentEl.querySelector<HTMLElement>('.nosy-role-row')!, 'Remove').click();
    assert.equal(editor.draft[0]?.id, secondId);
    assert.equal(button(editor.contentEl, 'Save').disabled, true);
  } finally { editor.close(); }
});
test('shared-field explanation and identical-mapping validation update through picker interactions', () => {
  const a = { ...newRole('A'), startProperty: 'note.end' as const }, b = { ...newRole('B'), startProperty: 'note.end' as const };
  const editor = new CalendarRolesEditor(app, [a, b], properties, () => null, () => {}); editor.open();
  try {
    assert.match(editor.contentEl.querySelector('.nosy-role-shared')!.textContent!, /note.end.*every role/);
    editor.contentEl.querySelector<HTMLButtonElement>('[aria-label="End property (optional)"]')!.click();
    const picker = FuzzySuggestModal.instances[FuzzySuggestModal.instances.length - 1] as unknown as PropertyPicker;
    picker.onChooseItem('note.end'); picker.close();
    assert.equal(button(editor.contentEl, 'Save').disabled, true);
    assert.match(editor.contentEl.querySelector('[role=status]')!.textContent!, /different properties/);
  } finally { editor.close(); }
});
test('color inheritance and Cancel never commit an editor draft', () => {
  const original = { ...newRole('Original'), startProperty: 'note.end' as const, edgeColor: '#ff0000' };
  let writes = 0;
  const editor = new CalendarRolesEditor(app, [original], properties, () => { writes++; return null; }, () => {}); editor.open();
  button(editor.contentEl, 'Use inherited color').click(); assert.equal(editor.draft[0]?.edgeColor, null);
  change(editor.contentEl.querySelector<HTMLInputElement>('[aria-label="Role label"]')!, 'Changed');
  button(editor.contentEl, 'Cancel').click();
  assert.equal(writes, 0); assert.equal(original.label, 'Original'); assert.equal(original.edgeColor, '#ff0000');
});
test('conflicting or failed configuration saves keep the editor open and explain the error', () => {
  const editor = new CalendarRolesEditor(app, [{ ...newRole(), startProperty: 'note.end' }], properties, () => 'Role settings changed; reopen the editor.', () => {});
  editor.open();
  try { button(editor.contentEl, 'Save').click(); assert.match(editor.contentEl.querySelector('[role=status]')!.textContent!, /settings changed/); assert.ok(editor.contentEl.isConnected); }
  finally { editor.close(); }
});
