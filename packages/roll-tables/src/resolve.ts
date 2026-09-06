import { evaluateRoll, type Rng, type RollResult } from '@openvtt/dice-core';
import { fromFormula } from '@openvtt/dice-notation';
import { v7 as uuidv7 } from 'uuid';
import type { Scope } from '@openvtt/formula';
import type { TableEntry } from './entry';
import type { DocumentRef, EntryType } from './schema';
import { TableError } from './errors';

export interface DrawnEntry {
  readonly id: string;
  readonly entryId: string;
  readonly type: EntryType;
  readonly depth: number;
  readonly text?: string;
  readonly img?: string;
  readonly value?: number;
  readonly roll?: RollResult;
  readonly inlineRolls?: readonly RollResult[];
  readonly documentRef?: DocumentRef;
  readonly nested?: DrawResult;
}

export interface DrawResult {
  readonly id: string;
  readonly tableId: string;
  readonly tableName: string;
  readonly count: number;
  readonly countRoll?: RollResult;
  readonly draws: readonly DrawnEntry[];
}

export interface InternalDrawOptions {
  readonly rng: Rng;
  readonly depth: number;
  readonly chain: readonly string[];
  readonly scope?: Scope;
  readonly resolver?: TableResolver;
  readonly maxDepth?: number;
}

export interface NestedTable {
  readonly id: string;
  readonly name: string;
  drawInternal(options: InternalDrawOptions): DrawResult;
}

export interface TableResolver {
  get(ref: string): NestedTable | undefined;
}

export function createResolver(tables: readonly NestedTable[]): TableResolver {
  const byRef = new Map<string, NestedTable>();
  for (const table of tables) {
    byRef.set(table.id, table);
    if (!byRef.has(table.name)) byRef.set(table.name, table);
  }
  return { get: (ref) => byRef.get(ref) };
}

export interface ResolveContext {
  readonly rng: Rng;
  readonly depth: number;
  readonly chain: readonly string[];
  readonly scope?: Scope;
  readonly tableId: string;
  readonly tableName: string;
  readonly resolver?: TableResolver;
  readonly maxDepth: number;
  readonly onNested?: (parentId: string, tableRef: string, depth: number) => void;
}

const INLINE_ROLL = /\[\[([^\]]+)\]\]/g;

export function parseFormula(source: string, tableId?: string) {
  try {
    return fromFormula(source);
  } catch (err) {
    throw new TableError(
      'invalid-formula',
      `Invalid formula "${source}": ${err instanceof Error ? err.message : String(err)}`,
      tableId,
    );
  }
}

export function evalInlineRolls(
  text: string,
  rng: Rng,
  scope?: Scope,
): { text: string; rolls: RollResult[] } {
  const rolls: RollResult[] = [];
  const out = text.replace(INLINE_ROLL, (_match, src: string) => {
    const result = evaluateRoll(parseFormula(src.trim()), { rng, scope });
    rolls.push(result);
    return String(result.value);
  });
  return { text: out, rolls };
}

export function resolveEntry(entry: TableEntry, ctx: ResolveContext): DrawnEntry {
  const base = {
    id: uuidv7(),
    entryId: entry.id,
    type: entry.type,
    depth: ctx.depth,
    img: entry.img,
    documentRef: entry.documentRef,
  };

  switch (entry.type) {
    case 'formula': {
      const source = entry.formula ?? entry.text ?? '0';
      const roll = evaluateRoll(parseFormula(source, ctx.tableId), { rng: ctx.rng, scope: ctx.scope });
      return { ...base, text: entry.text, value: Number(roll.value), roll };
    }
    case 'table': {
      const ref = entry.tableRef;
      if (!ref) {
        throw new TableError('unknown-table-ref', `Entry ${entry.id} has no tableRef`, ctx.tableId);
      }
      const nested = ctx.resolver?.get(ref);
      if (!nested) {
        throw new TableError('unknown-table-ref', `No table found for ref "${ref}"`, ctx.tableId);
      }
      if (ctx.chain.includes(nested.id)) {
        throw new TableError(
          'cycle-detected',
          `Cycle detected: ${[...ctx.chain, nested.id].join(' -> ')}`,
          ctx.tableId,
        );
      }
      if (ctx.depth + 1 > ctx.maxDepth) {
        throw new TableError('max-depth', `Max nesting depth ${ctx.maxDepth} exceeded`, ctx.tableId);
      }
      ctx.onNested?.(ctx.tableId, ref, ctx.depth + 1);
      const result = nested.drawInternal({
        rng: ctx.rng,
        depth: ctx.depth + 1,
        chain: [...ctx.chain, nested.id],
        scope: ctx.scope,
        resolver: ctx.resolver,
        maxDepth: ctx.maxDepth,
      });
      return { ...base, text: entry.text ?? nested.name, nested: result };
    }
    case 'document': {
      if (!entry.text) return base;
      const { text, rolls } = evalInlineRolls(entry.text, ctx.rng, ctx.scope);
      return rolls.length > 0 ? { ...base, text, inlineRolls: rolls } : { ...base, text };
    }
    case 'text':
    default: {
      if (!entry.text) return base;
      const { text, rolls } = evalInlineRolls(entry.text, ctx.rng, ctx.scope);
      return rolls.length > 0 ? { ...base, text, inlineRolls: rolls } : { ...base, text };
    }
  }
}
