import { BooleanValue, DateValue, LinkValue, ListValue, NullValue, NumberValue, StringValue, Value,
  type App, type BasesEntry, type BasesPropertyId } from 'obsidian';
import { isPropertyId } from './roles';
import { isRecord, isUnknownArray } from './unknown';

export const COLORS_KEY = 'eventColorRules';
export type Literal = { type: 'text' | 'date'; value: string } | { type: 'link'; value: string; sourcePath?: string }
  | { type: 'number'; value: number } | { type: 'boolean'; value: boolean } | { type: 'null' }
  | { type: 'list'; value: Literal[] };
export interface ColorRule { id: string; property: BasesPropertyId | null; operator: '=' | 'contains'; operand: Literal | null; color: string }
export const literalTypes = ['text', 'number', 'boolean', 'date', 'link', 'null', 'list'] as const;
export function newColorRule(win: Window = activeWindow): ColorRule {
  return { id: win.crypto?.randomUUID?.() ?? `color-${Date.now()}-${Math.random()}`, property: null, operator: '=', operand: null, color: '#3788d8' };
}

export function validLiteral(input: unknown, depth = 0): input is Literal {
  if (!isRecord(input) || depth > 8) return false;
  const row = input;
  switch (row.type) {
    case 'null': return true;
    case 'text': case 'date': return typeof row.value === 'string';
    case 'link': return typeof row.value === 'string' && (row.sourcePath === undefined || typeof row.sourcePath === 'string');
    case 'number': return typeof row.value === 'number' && Number.isFinite(row.value);
    case 'boolean': return typeof row.value === 'boolean';
    case 'list': {
      if (!isUnknownArray(row.value)) return false;
      for (const item of row.value) if (!validLiteral(item, depth + 1)) return false;
      return true;
    }
    default: return false;
  }
}

/** Literal construction and comparisons use only the public Bases Value API. */
export function nativeLiteral(app: App, literal: Literal): Value {
  switch (literal.type) {
    case 'text': return new StringValue(literal.value);
    case 'number': return new NumberValue(literal.value);
    case 'boolean': return new BooleanValue(literal.value);
    case 'null': return NullValue.value;
    case 'list': return new ListValue(literal.value.map(item => nativeLiteral(app, item)));
    case 'date': {
      const date = DateValue.parseFromString(literal.value);
      if (!date) throw new Error('Enter a valid ISO date or timestamp.');
      return date;
    }
    case 'link': {
      const link = LinkValue.parseFromString(app, literal.value, literal.sourcePath ?? '');
      if (!link) throw new Error('Enter an internal link in [[note]] syntax.');
      return link;
    }
  }
}

export function validateColorRules(rules: readonly unknown[], app: App): string | null {
  const ids = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const prefix = `Rule ${index + 1}: `;
    if (!isRecord(rule) || typeof rule.id !== 'string' || !rule.id || ids.has(rule.id)) return prefix + 'rule IDs must be unique.';
    ids.add(rule.id);
    if (!isPropertyId(rule.property)) return prefix + 'choose a property.';
    if (rule.operator !== '=' && rule.operator !== 'contains') return prefix + 'choose = or contains.';
    if (!validLiteral(rule.operand)) return prefix + 'complete the typed value (empty text and null can be chosen explicitly).';
    if (typeof rule.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(rule.color)) return prefix + 'choose a valid fill color.';
    try { nativeLiteral(app, rule.operand); } catch (error) { return prefix + (error instanceof Error ? error.message : String(error)); }
  }
  return null;
}

/** Malformed rows are isolated: they never suppress events or other valid rules. */
export function readColorRules(raw: unknown, app: App): { rules: ColorRule[]; errors: string[] } {
  if (raw == null) return { rules: [], errors: [] };
  if (!isUnknownArray(raw)) return { rules: [], errors: ['Event colors must be a list. Open Event colors to repair it.'] };
  const rules: ColorRule[] = [], errors: string[] = [], ids = new Set<string>();
  for (const [index, row] of raw.entries()) {
    const error = validateColorRules([row], app);
    if (error) { errors.push(`Event color rule ${index + 1} ignored: ${error}`); continue; }
    // Re-establish the validated shape here: validation returning null is not a type predicate.
    if (!isRecord(row) || typeof row.id !== 'string' || !isPropertyId(row.property)
      || (row.operator !== '=' && row.operator !== 'contains') || !validLiteral(row.operand) || typeof row.color !== 'string') continue;
    if (ids.has(row.id)) { errors.push(`Event color rule ${index + 1} ignored: duplicate ID`); continue; }
    ids.add(row.id);
    rules.push({ id: row.id, property: row.property, operator: row.operator, operand: cloneLiteral(row.operand), color: row.color });
  }
  return { rules, errors };
}

export function cloneLiteral(literal: Literal): Literal {
  if (literal.type === 'list') return { type: 'list', value: literal.value.map(cloneLiteral) };
  return { ...literal };
}

export function matchesColor(value: Value | null, operand: Value, operator: ColorRule['operator']): boolean {
  value ??= NullValue.value;
  if (operator === '=') return Value.equals(value, operand);
  // Do not use ListValue.includes: its documented loose equality can coerce native types.
  if (value instanceof ListValue) {
    for (let i = 0; i < value.length(); i++) if (Value.equals(value.get(i), operand)) return true;
    return false;
  }
  return value instanceof StringValue && !(value instanceof LinkValue) && operand instanceof StringValue
    && !(operand instanceof LinkValue) && value.toString().includes(operand.toString());
}

export function compileColors(rules: ColorRule[], app: App): (entry: BasesEntry) => string | undefined {
  const compiled = rules.map(rule => ({ ...rule, value: nativeLiteral(app, rule.operand!) }));
  return entry => {
    for (const rule of compiled) {
      try { if (matchesColor(entry.getValue(rule.property!), rule.value, rule.operator)) return rule.color; }
      catch { /* An unavailable/error-valued property cannot match; keep evaluating other rules. */ }
    }
    return undefined;
  };
}

export function contrastingText(hex: string): string {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

export function valueLiteral(value: Value, sourcePath = ''): Literal | null {
  if (value instanceof NullValue) return { type: 'null' };
  if (value instanceof LinkValue) return { type: 'link', value: value.toString(), sourcePath };
  if (value instanceof StringValue) return { type: 'text', value: value.toString() };
  if (value instanceof NumberValue) return { type: 'number', value: Number(value.toString()) };
  if (value instanceof BooleanValue) return { type: 'boolean', value: value.isTruthy() };
  if (value instanceof DateValue) return { type: 'date', value: value.toString() };
  // Lists are edited using explicit literal arrays; suggestions offer their members.
  return null;
}

export function valueSuggestions(app: App, entries: BasesEntry[], property: BasesPropertyId): Literal[] {
  const seen = new Set<string>(), suggestions: Literal[] = [];
  const add = (value: Value, path: string) => {
    const literal = valueLiteral(value, path);
    if (!literal || !validLiteral(literal)) return;
    try { if (!Value.equals(value, nativeLiteral(app, literal))) return; } catch { return; }
    const key = JSON.stringify(literal);
    if (!seen.has(key)) { seen.add(key); suggestions.push(literal); }
  };
  for (const entry of entries) {
    try {
      const value = entry.getValue(property) ?? NullValue.value;
      if (value instanceof ListValue) for (let i = 0; i < value.length(); i++) add(value.get(i), entry.file.path);
      else add(value, entry.file.path);
    } catch { /* Formula errors have no literal suggestion. */ }
  }
  return suggestions;
}

export function supportsContains(entries: BasesEntry[], property: BasesPropertyId): boolean {
  let known = false;
  for (const entry of entries) {
    try {
      const value = entry.getValue(property) ?? NullValue.value;
      if (value instanceof ListValue || value instanceof StringValue && !(value instanceof LinkValue)) return true;
      if (!(value instanceof NullValue)) known = true;
    } catch { /* Unknown property. */ }
  }
  return !known; // Empty results cannot establish a type; runtime still checks it.
}

export function comparisonError(rules: ColorRule[], entries: BasesEntry[]): string | null {
  for (const [index, rule] of rules.entries()) {
    if (rule.operator !== 'contains' || !rule.property) continue;
    if (!supportsContains(entries, rule.property)) return `Rule ${index + 1}: contains requires a text or list property.`;
    let hasList = false, hasText = false;
    for (const entry of entries) {
      try {
        const value = entry.getValue(rule.property);
        hasList ||= value instanceof ListValue;
        hasText ||= value instanceof StringValue && !(value instanceof LinkValue);
      } catch { /* Unavailable values are ignored. */ }
    }
    if (hasText && !hasList && rule.operand && rule.operand.type !== 'text') return `Rule ${index + 1}: text contains requires a text operand.`;
  }
  return null;
}

/** Explain the source's native types without converting links or list members to text. */
export function ruleFeedback(app: App, entries: BasesEntry[], rule: ColorRule): string {
  if (!rule.property) return 'Choose a property to see source types and matching notes.';
  const kinds = new Set<string>(), members = new Set<string>();
  let matches = 0;
  let operand: Value | null = null;
  try { if (rule.operand && validLiteral(rule.operand)) operand = nativeLiteral(app, rule.operand); } catch { /* Validation explains invalid literals. */ }
  const kind = (value: Value) => value instanceof ListValue ? 'list' : valueLiteral(value)?.type ?? 'unsupported';
  for (const entry of entries) {
    try {
      const value = entry.getValue(rule.property) ?? NullValue.value;
      if (!(value instanceof NullValue)) kinds.add(kind(value));
      if (value instanceof ListValue) for (let i = 0; i < value.length(); i++) members.add(kind(value.get(i)));
      if (operand && matchesColor(value, operand, rule.operator)) matches++;
    } catch { /* Unavailable values do not match. */ }
  }
  const count = operand ? `${matches} of ${entries.length} source notes match this rule before rule ordering. ` : '';
  let details = kinds.size ? `Source types: ${[...kinds].join(', ')}. ` : 'No populated source values in current results. ';
  if (members.size) details += `List member types: ${[...members].join(', ')}. `;
  if (kinds.has('list') && rule.operator === '=' && rule.operand?.type !== 'list') details += 'Equality compares the entire list. Choose contains to match one member. ';
  if (kinds.has('list') && rule.operator === 'contains') {
    details += 'List contains matches a whole typed member, not part of its text. ';
    if (members.has('link')) details += 'For project links, choose the complete link from Source values…; text such as a project name does not match a link. ';
  }
  return count + details;
}
