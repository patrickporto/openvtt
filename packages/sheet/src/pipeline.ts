import type { FormulaExpr } from '@openvtt/formula';
import { evaluateFormula, extractVariables, isTruthy, toNumber } from '@openvtt/formula';
import type {
  ActiveRollTransform,
  AuditEntry,
  Change,
  ComputedSheet,
  SuppressedEffect,
  SystemPack,
  ValueChange,
} from './types';
import type { ResolvedEffect } from './internal-types';
import { EffectCycleError, SheetError, UnknownOrdinalError } from './errors';
import { getPath, setPath } from './paths';

export type ParseFn = (source: string) => FormulaExpr;

export interface StackingResult {
  readonly kept: ResolvedEffect[];
  readonly suppressed: SuppressedEffect[];
}

export function applyStacking(entries: readonly ResolvedEffect[]): StackingResult {
  const groups = new Map<string, ResolvedEffect[]>();
  for (const entry of entries) {
    const rule = entry.definition.stacking;
    if (!rule || (rule.mode ?? 'stack') === 'stack') {
      groups.set(`__solo__${entry.instance.id}`, [entry]);
      continue;
    }
    const key = rule.group ?? entry.definition.id;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const kept: ResolvedEffect[] = [];
  const suppressed: SuppressedEffect[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      kept.push(list[0]!);
      continue;
    }
    const mode = list[0]!.definition.stacking?.mode ?? 'stack';
    let winner: ResolvedEffect | undefined;
    if (mode === 'newest') {
      winner = list.reduce((a, b) => (a.instance.id > b.instance.id ? a : b));
    } else if (mode === 'highest-priority') {
      winner = list.reduce((a, b) => {
        const pa = a.definition.priority ?? 0;
        const pb = b.definition.priority ?? 0;
        if (pa !== pb) return pa > pb ? a : b;
        return a.instance.id > b.instance.id ? a : b;
      });
    }
    if (winner) {
      kept.push(winner);
      for (const loser of list) {
        if (loser !== winner) suppressed.push({ instance: loser.instance, reason: 'stacking' });
      }
    } else {
      kept.push(...list);
    }
  }
  return { kept, suppressed };
}

export function sortEffects(entries: readonly ResolvedEffect[]): ResolvedEffect[] {
  return [...entries].sort((a, b) => {
    const pa = a.definition.priority ?? 0;
    const pb = b.definition.priority ?? 0;
    if (pa !== pb) return pa - pb;
    return a.instance.id < b.instance.id ? -1 : a.instance.id > b.instance.id ? 1 : 0;
  });
}

export interface ConditionNode {
  readonly id: string;
  readonly conditionVars: readonly string[];
  readonly affected: readonly string[];
}

export interface ConditionNodeInput {
  readonly id: string;
  readonly condition?: string;
  readonly changes: readonly Change[];
}

export function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

export function buildConditionNodes(
  items: readonly ConditionNodeInput[],
  pack: SystemPack,
  parse: ParseFn,
): ConditionNode[] {
  const derivedIndex = buildDerivedIndex(pack.derived ?? {}, parse);
  return items.map((item) => ({
    id: item.id,
    conditionVars: item.condition ? extractVariables(parse(item.condition)) : [],
    affected: [...affectedPaths(producedPaths(item.changes), derivedIndex)],
  }));
}

export function buildConditionEdges(
  nodes: readonly ConditionNode[],
  deterministicOrder: readonly string[],
): Map<string, Set<string>> {
  const rank = new Map(deterministicOrder.map((id, index) => [id, index]));
  const edges = new Map<string, Set<string>>();
  for (const a of nodes) {
    const deps = new Set<string>();
    for (const b of nodes) {
      if (a.id === b.id) continue;
      const depends = a.conditionVars.some((v) =>
        b.affected.some((p) => pathsOverlap(v, p)),
      );
      if (depends) deps.add(b.id);
    }
    edges.set(
      a.id,
      new Set([...deps].sort((x, y) => (rank.get(x) ?? 0) - (rank.get(y) ?? 0))),
    );
  }
  return edges;
}

export function topoConditionNodes(
  idsInOrder: readonly string[],
  edges: Map<string, Set<string>>,
): { order: string[] } | { cycle: string[] } {
  const state = new Map<string, 'visiting' | 'done'>();
  const order: string[] = [];
  const stack: string[] = [];

  const visit = (id: string): string[] | undefined => {
    const mark = state.get(id);
    if (mark === 'done') return undefined;
    if (mark === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of edges.get(id) ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    order.push(id);
    return undefined;
  };

  for (const id of idsInOrder) {
    const cycle = visit(id);
    if (cycle) return { cycle };
  }
  return { order };
}

function producedPaths(changes: readonly Change[]): string[] {
  const out: string[] = [];
  for (const change of changes) {
    if (change.kind === 'flag') out.push(`flags.${change.path}`);
    else if (change.kind === 'value') out.push(change.path);
  }
  return out;
}

function buildDerivedIndex(
  derived: Record<string, string>,
  parse: ParseFn,
): Map<string, Set<string>> {
  const direct = new Map<string, string[]>();
  for (const [path, formula] of Object.entries(derived)) {
    direct.set(path, [...extractVariables(parse(formula))]);
  }
  const closure = new Map<string, Set<string>>();
  const visit = (path: string, seen: Set<string>): Set<string> => {
    const cached = closure.get(path);
    if (cached) return cached;
    if (seen.has(path)) return new Set();
    seen.add(path);
    const out = new Set<string>();
    for (const v of direct.get(path) ?? []) {
      out.add(v);
      if (direct.has(v)) {
        for (const w of visit(v, seen)) out.add(w);
      }
    }
    closure.set(path, out);
    return out;
  };
  for (const path of direct.keys()) visit(path, new Set());
  return closure;
}

function affectedPaths(
  produced: readonly string[],
  derivedIndex: Map<string, Set<string>>,
): Set<string> {
  const out = new Set<string>(produced);
  for (const [derivedPath, vars] of derivedIndex) {
    for (const v of vars) {
      if (produced.some((p) => pathsOverlap(p, v))) {
        out.add(derivedPath);
        break;
      }
    }
  }
  return out;
}

export interface FilterResult {
  readonly active: ResolvedEffect[];
  readonly suppressed: SuppressedEffect[];
}

export function filterActive(
  entries: readonly ResolvedEffect[],
  base: Record<string, unknown>,
  pack: SystemPack,
  parse: ParseFn,
): FilterResult {
  const unconditional = entries.filter((e) => !e.definition.condition);
  const conditioned = sortEffects(entries.filter((e) => e.definition.condition));

  const order = conditioned.map((e) => e.instance.id);
  const nodes = buildConditionNodes(
    conditioned.map((e) => ({
      id: e.instance.id,
      condition: e.definition.condition,
      changes: e.definition.changes,
    })),
    pack,
    parse,
  );
  const edges = buildConditionEdges(nodes, order);
  const result = topoConditionNodes(order, edges);
  if ('cycle' in result) throw new EffectCycleError(result.cycle);

  const byId = new Map(conditioned.map((e) => [e.instance.id, e]));
  const active = [...unconditional];
  const suppressed: SuppressedEffect[] = [];
  let cached: { sig: string; scope: Record<string, unknown> } | undefined;

  for (const id of result.order) {
    const entry = byId.get(id)!;
    const sig = activeSignature(active);
    if (!cached || cached.sig !== sig) {
      cached = { sig, scope: buildState(base, active, pack, parse).scope };
    }
    const scope = { ...cached.scope, data: entry.instance.data ?? {} };
    if (isTruthy(evaluateFormula(parse(entry.definition.condition!), { scope }))) {
      active.push(entry);
    } else {
      suppressed.push({ instance: entry.instance, reason: 'condition' });
    }
  }
  return { active, suppressed };
}

function activeSignature(active: readonly ResolvedEffect[]): string {
  return active
    .map((e) => e.instance.id)
    .sort()
    .join('|');
}

interface Collected {
  readonly entry: ResolvedEffect;
  readonly change: Change;
}

function compareCollected(a: Collected, b: Collected): number {
  const pa = a.change.priority ?? a.entry.definition.priority ?? 0;
  const pb = b.change.priority ?? b.entry.definition.priority ?? 0;
  if (pa !== pb) return pa - pb;
  const ia = a.entry.instance.id;
  const ib = b.entry.instance.id;
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

interface ApplyResult {
  values: Record<string, unknown>;
  flags: Record<string, unknown>;
  audit: AuditEntry[];
  rollTransforms: ActiveRollTransform[];
}

export function applyChanges(
  base: Record<string, unknown>,
  sorted: readonly ResolvedEffect[],
  pack: SystemPack,
  parse: ParseFn,
): ApplyResult {
  const values = structuredClone(base);
  const flags: Record<string, unknown> = {};
  const audit: AuditEntry[] = [];
  const rollTransforms: ActiveRollTransform[] = [];

  const all: Collected[] = [];
  for (const entry of sorted) {
    for (const change of entry.definition.changes) all.push({ entry, change });
  }

  for (const { entry, change } of all
    .filter((c) => c.change.kind === 'roll')
    .sort(compareCollected)) {
    if (change.kind === 'roll') {
      rollTransforms.push({
        effectId: entry.instance.id,
        ref: entry.definition.id,
        target: change.target,
        transform: change.transform,
      });
    }
  }

  const evalValue = (entry: ResolvedEffect, change: ValueChange): unknown => {
    const scope = { ...values, flags, data: entry.instance.data ?? {} };
    return evaluateFormula(parse(change.value), { scope });
  };

  const applyValue = (entry: ResolvedEffect, change: ValueChange, pass: AuditEntry['pass']) => {
    if (change.op === 'append' || change.op === 'remove') {
      const input = change.value;
      const current = getPath(values, change.path);
      const arr = Array.isArray(current) ? [...current] : [];
      const next =
        change.op === 'append'
          ? arr.includes(input)
            ? arr
            : [...arr, input]
          : arr.filter((x) => x !== input);
      setPath(values, change.path, next);
      audit.push({
        effectId: entry.instance.id,
        ref: entry.definition.id,
        pass,
        path: change.path,
        op: change.op,
        input,
        result: next,
      });
      return;
    }
    if (change.op === 'upgrade' || change.op === 'downgrade') {
      applyOrdinal(entry, change, pass);
      return;
    }
    const input = evalValue(entry, change);
    const current = getPath(values, change.path);
    let next: unknown;
    if (change.op === 'set') next = input;
    else if (change.op === 'add') next = toNumber(current) + toNumber(input);
    else next = toNumber(current) * toNumber(input);
    setPath(values, change.path, next);
    audit.push({
      effectId: entry.instance.id,
      ref: entry.definition.id,
      pass,
      path: change.path,
      op: change.op,
      input,
      result: next,
    });
  };

  const applyOrdinal = (entry: ResolvedEffect, change: ValueChange, pass: AuditEntry['pass']) => {
    const ladder = pack.ordinals?.[change.value];
    if (!ladder) throw new UnknownOrdinalError(change.value);
    const current = getPath(values, change.path);
    const index = ladder.indexOf(String(current));
    const steps = change.steps ?? 1;
    const delta = change.op === 'upgrade' ? steps : -steps;
    const nextIndex = Math.min(Math.max((index < 0 ? 0 : index) + delta, 0), ladder.length - 1);
    const next = ladder[nextIndex]!;
    setPath(values, change.path, next);
    audit.push({
      effectId: entry.instance.id,
      ref: entry.definition.id,
      pass,
      path: change.path,
      op: change.op,
      input: current,
      result: next,
    });
  };

  for (const { entry, change } of all
    .filter((c) => c.change.kind === 'flag')
    .sort(compareCollected)) {
    if (change.kind !== 'flag') continue;
    setPath(flags, change.path, change.value);
    audit.push({
      effectId: entry.instance.id,
      ref: entry.definition.id,
      pass: 'flag',
      path: change.path,
      result: change.value,
    });
  }

  const passes: readonly [AuditEntry['pass'], (op: string) => boolean][] = [
    ['set', (op) => op === 'set'],
    ['add', (op) => op === 'add' || op === 'append' || op === 'remove'],
    ['multiply', (op) => op === 'multiply'],
    ['ordinal', (op) => op === 'upgrade' || op === 'downgrade'],
  ];

  for (const [pass, match] of passes) {
    for (const { entry, change } of all
      .filter((c) => c.change.kind === 'value')
      .sort(compareCollected)) {
      if (change.kind !== 'value' || !match(change.op)) continue;
      applyValue(entry, change, pass);
    }
  }

  return { values, flags, audit, rollTransforms };
}

export function applyDerived(
  values: Record<string, unknown>,
  flags: Record<string, unknown>,
  pack: SystemPack,
  parse: ParseFn,
  audit: AuditEntry[],
): Record<string, unknown> {
  const derived = pack.derived ?? {};
  const order = topoOrder(derived, parse);
  for (const path of order) {
    const scope: Record<string, unknown> = { ...values, flags };
    const result = evaluateFormula(parse(derived[path]!), { scope });
    setPath(values, path, result);
    audit.push({
      effectId: 'system',
      pass: 'derived',
      path,
      input: derived[path],
      result,
    });
  }
  return values;
}

export function topoOrder(
  derived: Record<string, string>,
  parse: ParseFn,
): readonly string[] {
  const paths = Object.keys(derived).sort();
  const deps = new Map<string, string[]>();
  for (const path of paths) {
    const vars = extractVariables(parse(derived[path]!));
    deps.set(path, vars.filter((v) => v in derived && v !== path));
  }

  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (path: string, stack: string[]) => {
    const mark = state.get(path);
    if (mark === 'done') return;
    if (mark === 'visiting') {
      throw new SheetError(
        `Derived formula cycle detected: ${[...stack, path].join(' -> ')}`,
        { code: 'PACK_VALIDATION' },
      );
    }
    state.set(path, 'visiting');
    for (const dep of deps.get(path) ?? []) visit(dep, [...stack, path]);
    state.set(path, 'done');
    order.push(path);
  };

  for (const path of paths) visit(path, []);
  return order;
}

export function buildState(
  base: Record<string, unknown>,
  entries: readonly ResolvedEffect[],
  pack: SystemPack,
  parse: ParseFn,
): { values: Record<string, unknown>; flags: Record<string, unknown>; scope: Record<string, unknown> } {
  const sorted = sortEffects(entries);
  const applied = applyChanges(base, sorted, pack, parse);
  const values = applyDerived(applied.values, applied.flags, pack, parse, applied.audit);
  return { values, flags: applied.flags, scope: { ...values, flags: applied.flags } };
}

export function computeSheet(
  base: Record<string, unknown>,
  entries: readonly ResolvedEffect[],
  pack: SystemPack,
  parse: ParseFn,
): ComputedSheet {
  const suppressed: SuppressedEffect[] = [];
  const enabled: ResolvedEffect[] = [];
  for (const entry of entries) {
    if (entry.instance.enabled) enabled.push(entry);
    else suppressed.push({ instance: entry.instance, reason: 'disabled' });
  }

  const { kept, suppressed: stackingLosers } = applyStacking(enabled);
  suppressed.push(...stackingLosers);

  const { active, suppressed: conditionOff } = filterActive(kept, base, pack, parse);
  suppressed.push(...conditionOff);

  const sorted = sortEffects(active);
  const applied = applyChanges(base, sorted, pack, parse);
  const values = applyDerived(applied.values, applied.flags, pack, parse, applied.audit);
  const flags = applied.flags;
  return {
    values,
    flags,
    scope: { ...values, flags },
    audit: applied.audit,
    effects: sorted.map((e) => e.instance),
    suppressed,
    rollTransforms: applied.rollTransforms,
  };
}
