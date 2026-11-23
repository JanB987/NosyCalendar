import type { BasesPropertyId, BasesViewConfig } from 'obsidian';
import type { Mappings } from './writeback';

export const ROLES_KEY = 'calendarRoles';
export interface CalendarRole {
  id: string;
  label: string;
  edgeColor: string | null;
  startProperty: BasesPropertyId | null;
  endProperty: BasesPropertyId | null;
  rollPastDates: boolean;
}
export const roleMappings = (role: CalendarRole): Mappings => ({ start: role.startProperty, end: role.endProperty });
export const eventId = (path: string, roleId: string): string => JSON.stringify([path, roleId]);
export const roleStamp = (role: CalendarRole): string => JSON.stringify(role);
export const isPropertyId = (value: unknown): value is BasesPropertyId => typeof value === 'string' && /^(note|file|formula)\.[\s\S]+$/.test(value);

export function newRole(label = 'Role', win: Window = activeWindow): CalendarRole {
  const id = win.crypto?.randomUUID?.() ?? `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { id, label, edgeColor: null, startProperty: null, endProperty: null, rollPastDates: false };
}

/** One native per-view configuration value; old mappings are retained until explicit role settings exist. */
export function readRoles(config: Pick<BasesViewConfig, 'get' | 'getAsPropertyId'>): { roles: CalendarRole[]; migrate: boolean } {
  const raw = config.get(ROLES_KEY);
  if (raw == null) return { migrate: true, roles: [{ id: 'legacy-calendar', label: 'Calendar', edgeColor: null,
    startProperty: config.getAsPropertyId('startProperty'), endProperty: config.getAsPropertyId('endProperty'), rollPastDates: false }] };
  if (!Array.isArray(raw)) throw new Error('Calendar roles must be a list. Open Calendar roles to repair the configuration.');
  const ids = new Set<string>();
  const roles = raw.map((value: unknown): CalendarRole => {
    if (!value || typeof value !== 'object') throw new Error('Invalid calendar role. Open Calendar roles to repair it.');
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('Calendar role IDs must be unique. Open Calendar roles to repair them.');
    ids.add(row.id);
    if (row.startProperty != null && !isPropertyId(row.startProperty) || row.endProperty != null && !isPropertyId(row.endProperty)) {
      throw new Error('A calendar role contains an invalid property ID.');
    }
    if (row.edgeColor != null && (typeof row.edgeColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(row.edgeColor))) throw new Error('A role edge color is invalid.');
    return { id: row.id, label: typeof row.label === 'string' && row.label.trim() ? row.label : 'Role',
      edgeColor: row.edgeColor as string | null ?? null, startProperty: row.startProperty as BasesPropertyId | null ?? null,
      endProperty: row.endProperty as BasesPropertyId | null ?? null, rollPastDates: row.rollPastDates === true };
  });
  return { roles, migrate: false };
}

export function validateRoles(roles: CalendarRole[]): string | null {
  if (!roles.some(role => role.startProperty)) return 'Map Start for at least one role. Incomplete additional rows can be saved.';
  const ids = new Set<string>();
  for (const role of roles) {
    if (!role.id || ids.has(role.id)) return 'Role IDs must be unique.';
    ids.add(role.id);
    if (role.startProperty && role.startProperty === role.endProperty) return `${role.label || 'Role'}: Start and End must use different properties.`;
    if (role.startProperty !== null && !isPropertyId(role.startProperty) || role.endProperty !== null && !isPropertyId(role.endProperty)) return 'Choose a property from the suggestions.';
    if (role.edgeColor !== null && !/^#[0-9a-f]{6}$/i.test(role.edgeColor)) return 'Choose a valid edge color.';
  }
  return null;
}

export function sharedProperties(roles: CalendarRole[]): BasesPropertyId[] {
  const usage = new Map<BasesPropertyId, Set<string>>();
  for (const role of roles) for (const property of [role.startProperty, role.endProperty]) {
    if (property) { const ids = usage.get(property) ?? new Set<string>(); ids.add(role.id); usage.set(property, ids); }
  }
  return [...usage].filter(([, ids]) => ids.size > 1).map(([property]) => property);
}
