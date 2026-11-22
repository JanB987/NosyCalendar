import type { DateInput } from './dates';
import { sameDateInput, type Mappings, type MovePlan } from './writeback';

export interface AwaitingResult {
  plan: MovePlan;
  mappings: Mappings;
  dragRevision: number;
  settledRevision: number;
  before: { start: DateInput; end: DateInput };
}

/** Never manufacture a query row after saving: it may have stopped matching the Base. */
export function resultReady(wait: AwaitingResult, mappings: Mappings, revision: number,
  current: { start: DateInput; end: DateInput } | undefined,
  source?: { start: DateInput; end: DateInput; changedSinceSave: boolean }): boolean {
  if (wait.mappings.start !== mappings.start || wait.mappings.end !== mappings.end) return true;
  if (!current) return revision > wait.dragRevision;
  if (sameDateInput(current.start, wait.plan.start) && sameDateInput(current.end, wait.plan.end)) return true;
  if (revision <= wait.settledRevision) return false;
  // An unrelated query update can still contain the old row while metadata is catching up.
  if (!sameDateInput(current.start, wait.before.start) || !sameDateInput(current.end, wait.before.end)) return true;
  // An intentional subsequent edit may restore the original date. Confirm it against a new file-specific cache update.
  return Boolean(source?.changedSinceSave && sameDateInput(current.start, source.start) && sameDateInput(current.end, source.end));
}
