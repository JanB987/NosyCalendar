import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BasesViewConfig } from 'obsidian';
import { eventId, newRole, readRoles, ROLES_KEY, sharedProperties, validateRoles, type CalendarRole } from '../src/roles';

test('legacy mappings migrate to one stable generic role with inherited appearance and rolling off', () => {
  const config = { get: () => undefined, getAsPropertyId: (key: string) => key === 'startProperty' ? 'note.My Start' : 'note.Exact.END' } as unknown as BasesViewConfig;
  const result = readRoles(config);
  assert.equal(result.migrate, true);
  assert.deepEqual(result.roles, [{ id: 'legacy-calendar', label: 'Calendar', edgeColor: null, startProperty: 'note.My Start', endProperty: 'note.Exact.END', rollPastDates: false }]);
  assert.deepEqual(readRoles(config), result);
});
test('stored role rows retain exact property IDs, labels and stable IDs', () => {
  const roles: CalendarRole[] = [{ ...newRole('My label'), startProperty: 'note.MiXeD Name.With.Dots', endProperty: 'file.ctime', edgeColor: '#12AbEF' }];
  const config = { get: (key: string) => key === ROLES_KEY ? structuredClone(roles) : null } as unknown as BasesViewConfig;
  assert.deepEqual(readRoles(config), { roles, migrate: false });
});
test('valid roles coexist with incomplete rows; at least one Start is mandatory', () => {
  const a = newRole('a'), b = { ...newRole('b'), startProperty: 'note.start' as const };
  assert.match(validateRoles([a])!, /at least one/);
  assert.equal(validateRoles([a, b]), null);
  assert.equal(validateRoles([{ ...b, endProperty: 'note.start' }])?.includes('different'), true);
});
test('cross-role field reuse is allowed and explicitly identified, including Start/End reuse', () => {
  const a = { ...newRole('a'), startProperty: 'note.shared' as const }, b = { ...newRole('b'), startProperty: 'note.other' as const, endProperty: 'note.shared' as const };
  assert.equal(validateRoles([a, b]), null);
  assert.deepEqual(sharedProperties([a, b]), ['note.shared']);
});
test('role/event identities are stable and collision-free for paths, delimiters and role removal', () => {
  const a = newRole(), b = newRole(); assert.notEqual(a.id, b.id);
  const before = eventId('folder/a.md', b.id);
  assert.equal(eventId('folder/a.md', [a, b].filter(role => role.id !== a.id)[0]!.id), before);
  assert.notEqual(eventId('a|b', 'c'), eventId('a', 'b|c'));
  assert.notEqual(eventId('a.md', a.id), eventId('a.md', b.id));
});
test('malformed persisted roles are reported instead of silently restoring legacy settings', () => {
  for (const raw of ['bad', [{ id: 'a', startProperty: 'no-prefix' }], [{ id: 'a', edgeColor: 'red;display:none' }], [{ id: 'a' }, { id: 'a' }]]) {
    assert.throws(() => readRoles({ get: () => raw } as unknown as BasesViewConfig));
  }
});
