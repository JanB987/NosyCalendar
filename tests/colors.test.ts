import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BooleanValue, DateValue, LinkValue, ListValue, NullValue, NumberValue, StringValue, Value, type App, type BasesEntry } from 'obsidian';
import { comparisonError, compileColors, contrastingText, matchesColor, nativeLiteral, newColorRule, readColorRules, ruleFeedback, supportsContains,
  validateColorRules, valueSuggestions, type ColorRule } from '../src/colors';

const app = {} as App;
const entry = (value: Value | null): BasesEntry => ({ file: { path: 'notes/Test.md' }, getValue: () => value } as unknown as BasesEntry);
const rule = (changes: Partial<ColorRule> = {}): ColorRule => ({ id: 'one', property: 'note.status', operator: '=', operand: { type: 'text', value: 'Waiting' }, color: '#123456', ...changes });

test('native equality keeps scalar types, zero, false, empty text and null distinct', () => {
  for (const operand of [{ type: 'number', value: 0 }, { type: 'boolean', value: false }, { type: 'text', value: '' }, { type: 'null' }] as const) {
    const value = nativeLiteral(app, operand);
    assert.equal(matchesColor(value, nativeLiteral(app, operand), '='), true);
    assert.equal(matchesColor(value, new StringValue('0'), '='), false);
  }
  assert.equal(matchesColor(new NumberValue(5), new StringValue('5'), '='), false);
  assert.equal(matchesColor(null, NullValue.value, '='), true);
});

test('unknown rows and nested literals are isolated before field access; valid later rows and duplicate semantics survive', () => {
  const cyclic: { type: 'list'; value: unknown[] } = { type: 'list', value: [] }; cyclic.value.push(cyclic);
  const malformed: unknown[] = [null, undefined, false, 0, '', [], {}, { id: [] },
    rule({ operand: null }), { ...rule(), operand: [] }, { ...rule(), operand: { type: 'list', value: [null] } },
    { ...rule(), operand: { type: 'list', value: new Array(1) } }, { ...rule(), operand: cyclic },
    { ...rule(), operand: { type: 'link', value: '[[A]]', sourcePath: 5 } },
    { ...rule(), operand: { type: 'number', value: Infinity } }];
  for (const bad of malformed) {
    const result = readColorRules([bad, rule({ id: 'later' })], app);
    assert.deepEqual(result.rules, [rule({ id: 'later' })]);
    assert.equal(result.errors.length, 1);
  }
  const result = readColorRules([{ ...rule(), color: 42 }, rule(), rule(), rule({ id: 'last', operand: { type: 'boolean', value: false } })], app);
  assert.deepEqual(result.rules.map(row => row.id), ['one', 'last']);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[1]!, /duplicate ID/);
  assert.equal(compileColors(result.rules, app)(entry(new BooleanValue(false))), '#123456');
});

test('accepted nested operands are copied without sharing persisted configuration', () => {
  const original = rule({ operand: { type: 'list', value: [{ type: 'number', value: 0 }, { type: 'null' }, { type: 'text', value: '' }] } });
  const parsed = readColorRules([original], app).rules[0]!;
  assert.deepEqual(parsed, original);
  assert.notEqual(parsed.operand, original.operand);
  if (parsed.operand?.type === 'list') parsed.operand.value.push({ type: 'boolean', value: false });
  if (original.operand?.type === 'list') assert.equal(original.operand.value.length, 3);
});
test('text contains is a case-sensitive substring; list contains is whole typed member equality', () => {
  assert.equal(matchesColor(new StringValue('Waiting'), new StringValue('ait'), 'contains'), true);
  assert.equal(matchesColor(new StringValue('Waiting'), new StringValue('wait'), 'contains'), false);
  const list = new ListValue([new StringValue('workshop'), new NumberValue(5), new BooleanValue(false)]);
  assert.equal(matchesColor(list, new StringValue('work'), 'contains'), false);
  assert.equal(matchesColor(list, new StringValue('workshop'), 'contains'), true);
  assert.equal(matchesColor(list, new StringValue('5'), 'contains'), false);
  assert.equal(matchesColor(list, new NumberValue(5), 'contains'), true);
  assert.equal(matchesColor(list, new BooleanValue(false), 'contains'), true);
  assert.equal(matchesColor(new NumberValue(5), new StringValue('5'), 'contains'), false);
});
test('dates, links, tags and list equality use native typed operands, not display-string equality', () => {
  const date = nativeLiteral(app, { type: 'date', value: '2026-11-23T09:00Z' });
  assert.equal(matchesColor(date, nativeLiteral(app, { type: 'date', value: '2026-11-23T10:00+01:00' }), '='), true);
  assert.equal(matchesColor(date, new StringValue(date.toString()), '='), false);
  const link = LinkValue.parseFromString(app, '[[Project|Label]]', '')!;
  assert.equal(matchesColor(new ListValue([link]), nativeLiteral(app, { type: 'link', value: '[[Project]]' }), 'contains'), true);
  assert.equal(matchesColor(link, new StringValue(link.toString()), '='), false);
  assert.equal(matchesColor(link, new StringValue('Project'), 'contains'), false);
  assert.equal(matchesColor(new ListValue([new StringValue('work')]), new StringValue('#work'), 'contains'), false);
  const list = nativeLiteral(app, { type: 'list', value: [{ type: 'number', value: 0 }, { type: 'boolean', value: false }] });
  assert.equal(matchesColor(list, new ListValue([new NumberValue(0), new BooleanValue(false)]), '='), true);
});
test('comparison delegates to public Value.equals including each list member', () => {
  const original = Value.equals; let calls = 0;
  Value.equals = () => { calls++; return true; };
  try {
    assert.equal(matchesColor(new StringValue('a'), new StringValue('b'), '='), true);
    assert.equal(matchesColor(new ListValue([new NumberValue(4)]), new NumberValue(7), 'contains'), true);
    assert.equal(calls, 2);
  } finally { Value.equals = original; }
});
test('first matching rule wins, reorder changes winner and unmatched values preserve inherited fill', () => {
  const a = rule(), b = rule({ id: 'two', color: '#ffffff' });
  assert.equal(compileColors([a, b], app)(entry(new StringValue('Waiting'))), '#123456');
  assert.equal(compileColors([b, a], app)(entry(new StringValue('Waiting'))), '#ffffff');
  assert.equal(compileColors([a], app)(entry(new StringValue('Other'))), undefined);
  assert.equal(compileColors([], app)(entry(new StringValue('Waiting'))), undefined);
});
test('invalid rows and property errors do not suppress later valid rules or mutate source values', () => {
  const state = readColorRules([null, rule({ color: 'red' }), rule(), rule({ id: 'one' }), rule({ id: 'last' })], app);
  assert.equal(state.errors.length, 3); assert.deepEqual(state.rules.map(r => r.id), ['one', 'last']);
  const data = { file: { path: 'a.md' }, getValue: (property: string) => { if (property === 'formula.Broken') throw new Error(); return new StringValue('Waiting'); } } as unknown as BasesEntry;
  assert.equal(compileColors([rule({ property: 'formula.Broken' }), rule({ id: 'fallback' })], app)(data), '#123456');
  assert.equal(readColorRules('bad', app).rules.length, 0);
});
test('config roundtrip retains exact property IDs, typed operands, stable IDs and order', () => {
  const rules = [rule({ property: 'note.Exact CASE.With Spaces', operand: { type: 'boolean', value: false } }), rule({ id: 'two', property: 'formula.score', operand: { type: 'number', value: 0 } })];
  const raw = JSON.parse(JSON.stringify(rules)); assert.deepEqual(readColorRules(raw, app).rules, rules);
  assert.equal(validateColorRules(rules, app), null);
  assert.match(validateColorRules([newColorRule()], app)!, /choose a property/);
  assert.match(validateColorRules([rule({ operand: null })], app)!, /complete/);
  assert.match(validateColorRules([rule({ operand: { type: 'date', value: 'bad' } })], app)!, /ISO/);
  assert.match(validateColorRules([rule({ operand: { type: 'link', value: 'plain text' } })], app)!, /link/);
});
test('source suggestions retain native types, exact tag spelling and link contexts; unsupported kinds explain contains', () => {
  const values = [new StringValue('5'), new NumberValue(5), new BooleanValue(false), DateValue.parseFromString('2026-11-23')!, LinkValue.parseFromString(app, '[[Project]]', '')!];
  const suggestions = valueSuggestions(app, [entry(new ListValue(values))], 'file.tags');
  assert.deepEqual(suggestions.map(item => item.type), ['text', 'number', 'boolean', 'date', 'link']);
  assert.equal(suggestions[4]?.type === 'link' && suggestions[4].sourcePath, 'notes/Test.md');
  assert.equal(supportsContains([entry(new NumberValue(4))], 'formula.score'), false);
  assert.equal(supportsContains([], 'note.unseen'), true);
  assert.match(comparisonError([rule({ operator: 'contains', operand: { type: 'number', value: 5 } })], [entry(new StringValue('5'))])!, /text operand/);
});
test('contrast chooses accessible black/white ink for light, dark and midtone fills', () => {
  assert.equal(contrastingText('#ffffff'), '#000000'); assert.equal(contrastingText('#000000'), '#ffffff');
  for (const color of ['#3788d8', '#ff0000', '#777777']) assert.match(contrastingText(color), /^#(000000|ffffff)$/);
});

test('saved project-text rule explains zero matches against link lists; choosing typed link matches without changing membership semantics', () => {
  const entries = [entry(new ListValue([LinkValue.parseFromString(app, '[[PRJT - Debeka]]', '')!]))];
  const saved = rule({ property: 'note.project', operator: 'contains', operand: { type: 'text', value: 'Debeka' } });
  assert.match(ruleFeedback(app, entries, saved), /0 of 1 source notes/);
  assert.match(ruleFeedback(app, entries, saved), /List member types: link/);
  assert.match(ruleFeedback(app, entries, saved), /whole typed member/);
  const original = JSON.stringify(saved);
  const source = valueSuggestions(app, entries, 'note.project')[0]!;
  assert.equal(source.type, 'link');
  assert.match(ruleFeedback(app, entries, { ...saved, operand: source }), /1 of 1 source notes/);
  assert.equal(compileColors([saved], app)(entries[0]!), undefined);
  assert.equal(compileColors([{ ...saved, operand: source }], app)(entries[0]!), '#123456');
  assert.equal(JSON.stringify(saved), original);
  assert.match(ruleFeedback(app, entries, { ...saved, operator: '=' }), /Choose contains to match one member/);
});
