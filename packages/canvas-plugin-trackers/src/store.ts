import * as v from 'valibot';
import { applyMath, parseMathInput } from './math';
import {
  normalizeTracker,
  parseTracker,
  TrackersSnapshotSchema,
  type Tracker,
  type TrackerInput,
  type TrackersSnapshot,
} from './schemas';
import type { SourceValue } from './resolve';

export interface TrackerResolverContext {
  readonly tokenId: string;
  readonly tracker: Tracker;
}

/** Resolver de valor: número, par value/max, ou null/undefined para fallback inline. */
export type TrackerResolver = (ctx: TrackerResolverContext) => SourceValue | number | null | undefined;

export type MathApplyError = 'unknown-tracker' | 'empty' | 'invalid-number' | 'malformed' | 'math-disabled';

export type MathApplyResult =
  | { readonly ok: true; readonly value: number; readonly tracker: Tracker }
  | { readonly ok: false; readonly error: MathApplyError };

export type TrackerStoreEvent =
  | { readonly kind: 'upsert'; readonly tokenId: string; readonly tracker: Tracker }
  | { readonly kind: 'patch'; readonly tokenId: string; readonly tracker: Tracker; readonly before: Tracker }
  | { readonly kind: 'remove'; readonly tokenId: string; readonly trackerId: string }
  | { readonly kind: 'clear'; readonly tokenId: string }
  | { readonly kind: 'reorder'; readonly tokenId: string }
  | { readonly kind: 'value'; readonly tokenId: string; readonly tracker: Tracker; readonly before: number }
  | { readonly kind: 'defaults' }
  | { readonly kind: 'applied'; readonly tokenIds: readonly string[]; readonly count: number }
  | { readonly kind: 'prune'; readonly removed: readonly string[] }
  | { readonly kind: 'reset' };

export type TrackerStoreListener = (event: TrackerStoreEvent) => void;

const SourceValueSchema = v.union([
  v.pipe(v.number(), v.finite()),
  v.object({ value: v.pipe(v.number(), v.finite()), max: v.optional(v.pipe(v.number(), v.finite())) }),
]);

/**
 * Estado dos trackers: por token + defaults de cena, com registry de
 * resolvers de valor e serialização validada. Puro em relação ao bus —
 * quem o consome traduz os eventos.
 */
export class TrackerStore {
  private readonly tokens = new Map<string, Tracker[]>();
  private defaultsValue: Tracker[] = [];
  private readonly resolvers = new Map<string, TrackerResolver>();
  private readonly listeners = new Set<TrackerStoreListener>();

  onChange(listener: TrackerStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TrackerStoreEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  /* ------------------------------ leitura ------------------------------ */

  list(tokenId: string): readonly Tracker[] {
    return this.tokens.get(tokenId) ?? [];
  }

  get(tokenId: string, trackerId: string): Tracker | undefined {
    return this.list(tokenId).find((tracker) => tracker.id === trackerId);
  }

  defaults(): readonly Tracker[] {
    return this.defaultsValue;
  }

  /* ------------------------------ mutação ------------------------------ */

  /** Adiciona (sem id) ou substitui (id existente) um tracker no token. */
  upsert(tokenId: string, input: TrackerInput): Tracker {
    const list = [...this.list(tokenId)];
    const incoming = normalizeTracker(input);
    const index = list.findIndex((t) => t.id === incoming.id);
    if (index >= 0) {
      const before = list[index];
      list[index] = incoming;
      this.tokens.set(tokenId, list);
      this.emit({ kind: 'patch', tokenId, tracker: incoming, before });
    } else {
      list.push(incoming);
      this.tokens.set(tokenId, list);
      this.emit({ kind: 'upsert', tokenId, tracker: incoming });
    }
    return incoming;
  }

  /** Mescla mudanças parciais num tracker e revalida o resultado. */
  patch(tokenId: string, trackerId: string, changes: Partial<TrackerInput>): Tracker | undefined {
    const current = this.get(tokenId, trackerId);
    if (!current) return undefined;
    const merged: Record<string, unknown> = { ...current, ...changes, id: current.id };
    if (changes.audience) merged.audience = { ...current.audience, ...changes.audience };
    if (
      changes.color &&
      typeof changes.color === 'object' &&
      current.color &&
      typeof current.color === 'object'
    ) {
      merged.color = { ...current.color, ...changes.color };
    }
    const next = parseTracker(merged);
    const list = [...this.list(tokenId)];
    const index = list.findIndex((t) => t.id === trackerId);
    list[index] = next;
    this.tokens.set(tokenId, list);
    this.emit({ kind: 'patch', tokenId, tracker: next, before: current });
    return next;
  }

  /** Move um tracker para a posição `toIndex` (ordem de renderização). */
  reorder(tokenId: string, trackerId: string, toIndex: number): boolean {
    const list = [...this.list(tokenId)];
    const from = list.findIndex((t) => t.id === trackerId);
    if (from < 0) return false;
    const clamped = Math.min(list.length - 1, Math.max(0, Math.trunc(toIndex)));
    if (clamped === from) return false;
    const [moved] = list.splice(from, 1);
    list.splice(clamped, 0, moved);
    this.tokens.set(tokenId, list);
    this.emit({ kind: 'reorder', tokenId });
    return true;
  }

  /** Remove um tracker; sem trackerId, limpa o token inteiro. */
  remove(tokenId: string, trackerId?: string): boolean {
    if (trackerId === undefined) {
      if (!this.tokens.delete(tokenId)) return false;
      this.emit({ kind: 'clear', tokenId });
      return true;
    }
    const list = [...this.list(tokenId)];
    const index = list.findIndex((t) => t.id === trackerId);
    if (index < 0) return false;
    list.splice(index, 1);
    if (list.length === 0) this.tokens.delete(tokenId);
    else this.tokens.set(tokenId, list);
    this.emit({ kind: 'remove', tokenId, trackerId });
    return true;
  }

  /** Define o valor respeitando `clamp` do tracker (min/max). */
  setValue(tokenId: string, trackerId: string, value: number): Tracker | undefined {
    const tracker = this.get(tokenId, trackerId);
    if (!tracker) return undefined;
    if (!Number.isFinite(value)) return tracker;
    const bounded = tracker.clamp
      ? Math.min(tracker.max ?? Number.POSITIVE_INFINITY, Math.max(tracker.min, value))
      : value;
    if (bounded === tracker.value) return tracker;
    const next = { ...tracker, value: bounded };
    const list = [...this.list(tokenId)];
    list[list.findIndex((t) => t.id === trackerId)] = next;
    this.tokens.set(tokenId, list);
    this.emit({ kind: 'value', tokenId, tracker: next, before: tracker.value });
    return next;
  }

  /**
   * Aplica matemática inline (`+7`, `-7`, `=-7`, `7`). Trackers com
   * `math: false` aceitam apenas definição direta (`7` / `=-7`).
   */
  applyMathInput(tokenId: string, trackerId: string, input: string): MathApplyResult {
    const tracker = this.get(tokenId, trackerId);
    if (!tracker) return { ok: false, error: 'unknown-tracker' };
    const parsed = parseMathInput(input);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (!tracker.math && parsed.expression.op !== 'set') {
      return { ok: false, error: 'math-disabled' };
    }
    const target = applyMath(tracker.value, parsed.expression);
    const next = this.setValue(tokenId, trackerId, target);
    if (!next) return { ok: false, error: 'unknown-tracker' };
    return { ok: true, value: next.value, tracker: next };
  }

  /* --------------------------- scene defaults --------------------------- */

  setDefaults(inputs: readonly TrackerInput[]): readonly Tracker[] {
    this.defaultsValue = inputs.map((input) => normalizeTracker(input));
    this.emit({ kind: 'defaults' });
    return this.defaultsValue;
  }

  /** Copia os trackers do token como novos defaults de cena. */
  saveAsDefaults(tokenId: string): boolean {
    const list = this.list(tokenId);
    if (list.length === 0) return false;
    this.defaultsValue = list.map((tracker) => parseTracker(tracker));
    this.emit({ kind: 'defaults' });
    return true;
  }

  /**
   * Aplica os defaults aos tokens, adicionando apenas trackers cujo nome
   * ainda não existe no destino (valores atuais do token são preservados).
   * Cada cópia recebe um id novo (UUID v7).
   */
  applyDefaultsTo(tokenIds: readonly string[]): number {
    const applied: string[] = [];
    for (const tokenId of tokenIds) {
      const existing = new Set(this.list(tokenId).map((t) => t.name));
      const missing = this.defaultsValue.filter((tracker) => !existing.has(tracker.name));
      if (missing.length === 0) continue;
      this.tokens.set(tokenId, [
        ...this.list(tokenId),
        ...missing.map((t) => normalizeTracker({ ...t, id: undefined })),
      ]);
      applied.push(tokenId);
    }
    const count = applied.length;
    if (count > 0) this.emit({ kind: 'applied', tokenIds: applied, count });
    return count;
  }

  /* ------------------------------ resolvers ------------------------------ */

  registerResolver(id: string, resolver: TrackerResolver): () => void {
    this.resolvers.set(id, resolver);
    return () => this.resolvers.delete(id);
  }

  /**
   * Resolve o valor de um tracker: `inline` usa os campos armazenados;
   * `source` customizado consulta o resolver (saída inválida ou erro →
   * fallback inline). Resolvers nunca derrubam a renderização.
   */
  resolveSource(tokenId: string, tracker: Tracker): SourceValue {
    if (tracker.source !== 'inline') {
      const resolver = this.resolvers.get(tracker.source);
      if (resolver) {
        try {
          const outcome = v.safeParse(SourceValueSchema, resolver({ tokenId, tracker }));
          if (outcome.success) {
            if (typeof outcome.output === 'number') return { value: outcome.output, max: tracker.max };
            return { value: outcome.output.value, max: outcome.output.max ?? tracker.max };
          }
        } catch {
          // fallback inline
        }
      }
    }
    return { value: tracker.value, max: tracker.max };
  }

  /* --------------------------- serialização --------------------------- */

  serialize(): TrackersSnapshot {
    const tokens: Record<string, Tracker[]> = {};
    for (const [tokenId, list] of this.tokens) {
      if (list.length > 0) tokens[tokenId] = list.map((t) => parseTracker(t));
    }
    return {
      version: 1,
      defaults: this.defaultsValue.map((t) => parseTracker(t)),
      tokens,
    };
  }

  hydrate(snapshot: unknown): void {
    const parsed = v.parse(TrackersSnapshotSchema, snapshot);
    this.defaultsValue = parsed.defaults.map((t) => ({ ...t }));
    this.tokens.clear();
    for (const [tokenId, list] of Object.entries(parsed.tokens)) {
      this.tokens.set(tokenId, list.map((t) => ({ ...t })));
    }
    this.emit({ kind: 'reset' });
  }

  /**
   * Evicta o estado de tokens que não existem mais na cena (chamar no save
   * da cena com os ids vivos). Undo de delete recria o documento, então o
   * estado permanece até o host confirmar a evicção por aqui. Retorna a
   * quantidade de tokens removidos.
   */
  prune(validTokenIds: Iterable<string>): number {
    const valid = new Set(validTokenIds);
    const removed: string[] = [];
    for (const tokenId of this.tokens.keys()) {
      if (!valid.has(tokenId)) {
        this.tokens.delete(tokenId);
        removed.push(tokenId);
      }
    }
    if (removed.length > 0) this.emit({ kind: 'prune', removed });
    return removed.length;
  }

  reset(): void {
    this.tokens.clear();
    this.defaultsValue = [];
    this.emit({ kind: 'reset' });
  }
}
