import { evaluateRoll, createRng, type Rng, type RollExpr, type RollResult } from '@openvtt/dice-core';
import { v7 as uuidv7 } from 'uuid';
import * as v from 'valibot';
import type { Scope } from '@openvtt/formula';
import {
  rollTableSchema,
  type ReshufflePolicy,
  type RollTableInput,
  type TableEntryInput,
} from './schema';
import {
  effectiveWeight,
  matchesCondition,
  totalWeight,
  type EntryCondition,
  type TableEntry,
} from './entry';
import {
  parseFormula,
  resolveEntry,
  type DrawResult,
  type DrawnEntry,
  type InternalDrawOptions,
  type NestedTable,
  type TableResolver,
} from './resolve';
import { tableProbability, type EntryProbability } from './probability';
import { TableError } from './errors';
import { createRollTablesBus, type RollTablesBus } from './bus';

export type TableDef = Omit<RollTableInput, 'entries'> & {
  entries: readonly (TableEntryInput & { condition?: EntryCondition })[];
};

export interface TableOptions {
  readonly bus?: RollTablesBus;
  readonly resolver?: TableResolver;
  readonly rng?: Rng;
  readonly seed?: string;
  readonly maxDepth?: number;
}

export interface DrawOptions {
  readonly count?: number;
  readonly seed?: string;
  readonly rng?: Rng;
  readonly scope?: Scope;
}

const DEFAULT_MAX_DEPTH = 10;

export class RandomTable implements NestedTable {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly img?: string;
  readonly formula: string;
  readonly replacement: boolean;
  readonly reshuffle: ReshufflePolicy;
  readonly displayRoll: boolean;
  readonly bus: RollTablesBus;

  private readonly entries: TableEntry[];
  private readonly conditions: ReadonlyMap<string, EntryCondition>;
  private readonly resolver?: TableResolver;
  private readonly maxDepth: number;
  private readonly countExpr: RollExpr;
  private readonly baseRng: Rng;
  private readonly drawn = new Set<string>();

  constructor(def: TableDef, options: TableOptions = {}) {
    const data = v.parse(rollTableSchema, def);
    this.id = data.id ?? uuidv7();
    this.name = data.name;
    this.description = data.description;
    this.img = data.img;
    this.formula = data.formula;
    this.replacement = data.replacement;
    this.reshuffle = data.reshuffle;
    this.displayRoll = data.displayRoll;
    this.bus = options.bus ?? createRollTablesBus();
    this.resolver = options.resolver;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.countExpr = parseFormula(this.formula, this.id);
    this.baseRng = options.rng ?? createRng(options.seed);

    const conditions = new Map<string, EntryCondition>();
    this.entries = data.entries.map((entry, i) => {
      const id = entry.id ?? uuidv7();
      const condition = def.entries[i]?.condition;
      if (condition) conditions.set(id, condition);
      return { ...entry, id };
    });
    this.conditions = conditions;
  }

  get tableEntries(): readonly TableEntry[] {
    return this.entries.map((e) => this.withCondition(e));
  }

  get drawnCount(): number {
    return this.drawn.size;
  }

  get remainingCount(): number {
    return this.replacement ? this.entries.length : this.entries.length - this.drawn.size;
  }

  reset(): void {
    this.drawn.clear();
  }

  normalize(target = 100): void {
    const total = totalWeight(this.entries);
    if (total <= 0) return;
    const factor = target / total;
    for (const entry of this.entries) {
      entry.weight = effectiveWeight(entry) * factor;
      delete entry.range;
    }
  }

  lookup(rollValue: number): TableEntry | undefined {
    const entries = this.tableEntries;
    if (entries.length === 0 || !Number.isFinite(rollValue)) return undefined;

    const allRanged = entries.every((e) => e.range != null);
    if (allRanged) {
      const max = Math.max(...entries.map((e) => e.range![1]));
      if (rollValue < 1 || rollValue > max) {
        throw new TableError(
          'invalid-range',
          `Roll ${rollValue} out of range [1, ${max}] for table "${this.name}"`,
          this.id,
        );
      }
      return entries.find((e) => e.range![0] <= rollValue && rollValue <= e.range![1]);
    }

    const total = totalWeight(entries);
    if (total <= 0) return undefined;
    if (rollValue < 1 || rollValue > total) {
      throw new TableError(
        'invalid-range',
        `Roll ${rollValue} out of range [1, ${total}] for table "${this.name}"`,
        this.id,
      );
    }
    let cursor = 0;
    for (const entry of entries) {
      cursor += effectiveWeight(entry);
      if (rollValue <= cursor) return entry;
    }
    return undefined;
  }

  probability(scope?: Scope): EntryProbability[] {
    return tableProbability(this.tableEntries, { scope }, this.replacement ? undefined : this.drawn);
  }

  draw(options: DrawOptions = {}): DrawResult {
    if (options.count != null && (!Number.isInteger(options.count) || options.count < 0)) {
      throw new TableError(
        'invalid-range',
        `count must be a non-negative integer, got ${options.count}`,
        this.id,
      );
    }
    const rng = options.rng ?? (options.seed != null ? createRng(options.seed) : this.baseRng);
    const countRoll = options.count == null ? this.rollCount(rng, options.scope) : undefined;
    const count = options.count ?? Math.max(0, Math.floor(Number(countRoll?.value ?? 0)));
    return this.runDraw({
      rng,
      count,
      countRoll,
      depth: 0,
      chain: [this.id],
      scope: options.scope,
      resolver: this.resolver,
      maxDepth: this.maxDepth,
    });
  }

  drawInternal(options: InternalDrawOptions): DrawResult {
    const countRoll = this.rollCount(options.rng, options.scope);
    const count = Math.max(0, Math.floor(Number(countRoll.value)));
    return this.runDraw({
      rng: options.rng,
      count,
      countRoll,
      depth: options.depth,
      chain: options.chain,
      scope: options.scope,
      resolver: options.resolver ?? this.resolver,
      maxDepth: options.maxDepth == null ? this.maxDepth : Math.min(this.maxDepth, options.maxDepth),
    });
  }

  private rollCount(rng: Rng, scope?: Scope): RollResult {
    return evaluateRoll(this.countExpr, { rng, scope });
  }

  private runDraw(args: {
    rng: Rng;
    count: number;
    countRoll?: RollResult;
    depth: number;
    chain: readonly string[];
    scope?: Scope;
    resolver?: TableResolver;
    maxDepth: number;
  }): DrawResult {
    const { rng, depth, chain, scope, resolver, maxDepth } = args;

    const hooked = this.bus.call('beforeDraw', {
      tableId: this.id,
      tableName: this.name,
      count: args.count,
      pool: [...this.tableEntries],
      depth,
    });
    const count = Math.max(0, Math.floor(hooked.count));
    const basePool = hooked.pool;

    const onConditionError = (error: unknown) =>
      this.emitError('condition-error', error instanceof Error ? error.message : String(error));

    const previous: string[] = [];
    const draws: DrawnEntry[] = [];

    for (let i = 0; i < count; i++) {
      const pool = basePool.filter(
        (e) =>
          (this.replacement || !this.drawn.has(e.id)) &&
          matchesCondition(e, { depth, chain, previous, scope }, onConditionError),
      );

      if (pool.length === 0) {
        const exhausted =
          !this.replacement && this.entries.length > 0 && this.drawn.size >= this.entries.length;
        if (exhausted) {
          this.bus.emit('deck:empty', { tableId: this.id });
          if (this.reshuffle === 'auto') {
            this.reset();
            this.bus.emit('deck:reshuffle', { tableId: this.id });
            i -= 1;
            continue;
          }
          if (draws.length === 0) {
            const message = `Deck exhausted for table "${this.name}"`;
            this.emitError('deck-exhausted', message);
            throw new TableError('deck-exhausted', message, this.id);
          }
          break;
        }
        if (draws.length === 0) {
          const message = `No eligible entries in table "${this.name}"`;
          this.emitError('empty-table', message);
          throw new TableError('empty-table', message, this.id);
        }
        break;
      }

      try {
        const entry = this.pickWeighted(pool, rng);
        this.bus.emit('entry:selected', { tableId: this.id, entryId: entry.id, depth });

        const resolved = resolveEntry(entry, {
          rng,
          depth,
          chain,
          scope,
          tableId: this.id,
          tableName: this.name,
          resolver,
          maxDepth,
          onNested: (parentId, tableRef, nestedDepth) =>
            this.bus.emit('table:nested', { parentId, tableRef, depth: nestedDepth }),
        });

        const result = this.bus.call('beforeResolve', {
          tableId: this.id,
          entryId: entry.id,
          depth,
          result: resolved,
        }).result;

        if (!this.replacement) this.drawn.add(entry.id);
        draws.push(result);
        previous.push(entry.id);
      } catch (error) {
        const code = error instanceof TableError ? error.code : 'unknown-table-ref';
        this.emitError(code, error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    const result: DrawResult = {
      id: uuidv7(),
      tableId: this.id,
      tableName: this.name,
      count: draws.length,
      countRoll: args.countRoll,
      draws,
    };

    this.bus.emit('draw', {
      drawId: result.id,
      tableId: this.id,
      tableName: this.name,
      count: draws.length,
      results: draws,
    });
    this.bus.call('afterDraw', { tableId: this.id, drawId: result.id, count: draws.length });

    return result;
  }

  private pickWeighted(pool: readonly TableEntry[], rng: Rng): TableEntry {
    const total = totalWeight(pool);
    if (total <= 0) {
      throw new TableError('empty-table', `All entries in "${this.name}" have zero weight`, this.id);
    }
    let roll = rng() * total;
    for (const entry of pool) {
      roll -= effectiveWeight(entry);
      if (roll < 0) return entry;
    }
    return pool[pool.length - 1];
  }

  private withCondition(entry: TableEntry): TableEntry {
    const condition = this.conditions.get(entry.id);
    return condition ? { ...entry, condition } : { ...entry };
  }

  private emitError(code: string, message: string): void {
    this.bus.emit('error', { tableId: this.id, code, message });
  }
}

export function createTable(def: TableDef, options?: TableOptions): RandomTable {
  return new RandomTable(def, options);
}
