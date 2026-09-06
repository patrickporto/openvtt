import type { Scope } from '@openvtt/formula';
import type { TableEntryData } from './schema';

export interface EntryConditionContext {
  readonly depth: number;
  readonly chain: readonly string[];
  readonly previous: readonly string[];
  readonly scope?: Scope;
}

export type EntryCondition = (ctx: EntryConditionContext) => boolean;

export interface TableEntry extends TableEntryData {
  readonly id: string;
  readonly condition?: EntryCondition;
}

export function effectiveWeight(entry: TableEntry): number {
  if (entry.range) {
    return Math.max(0, entry.range[1] - entry.range[0] + 1);
  }
  return Math.max(0, entry.weight);
}

export function totalWeight(entries: readonly TableEntry[]): number {
  return entries.reduce((acc, e) => acc + effectiveWeight(e), 0);
}

export function matchesCondition(
  entry: TableEntry,
  ctx: EntryConditionContext,
  onError?: (error: unknown) => void,
): boolean {
  if (!entry.condition) return true;
  try {
    return entry.condition(ctx) === true;
  } catch (error) {
    onError?.(error);
    return false;
  }
}

export function eligibleEntries(
  entries: readonly TableEntry[],
  ctx: EntryConditionContext,
  drawn?: ReadonlySet<string>,
  onError?: (error: unknown) => void,
): TableEntry[] {
  return entries.filter(
    (e) => (!drawn || !drawn.has(e.id)) && matchesCondition(e, ctx, onError),
  );
}
