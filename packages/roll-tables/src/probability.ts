import { effectiveWeight, eligibleEntries, totalWeight, type TableEntry, type EntryConditionContext } from './entry';

export interface EntryProbability {
  readonly entryId: string;
  readonly weight: number;
  readonly probability: number;
  readonly range: readonly [number, number];
}

export function tableProbability(
  entries: readonly TableEntry[],
  ctx?: Partial<EntryConditionContext>,
  drawn?: ReadonlySet<string>,
): EntryProbability[] {
  const context: EntryConditionContext = {
    depth: 0,
    chain: [],
    previous: [],
    scope: ctx?.scope,
    ...ctx,
  };
  const pool = eligibleEntries(entries, context, drawn);
  const total = totalWeight(pool);
  if (total <= 0) return [];

  const allRanged = pool.every((e) => e.range != null);
  let cursor = 0;
  return pool.map((entry) => {
    const weight = effectiveWeight(entry);
    const range: readonly [number, number] =
      allRanged && entry.range ? entry.range : [cursor, cursor + weight];
    cursor += weight;
    return { entryId: entry.id, weight, probability: weight / total, range };
  });
}
