import type { FacesSpec, Modifier, ModifierOp } from './ir';
import type { Rng } from './rng';
import { rollInt } from './rng';
import { toNumber } from '@openvtt/formula';
import type { Scope } from '@openvtt/formula';
import type { WorkingDie } from './result';
import type { ComparisonOp } from './ir';

export interface ResolvedFaces {
  readonly sides: number;
  readonly max: number;
  roll(): number;
}

export interface ResolvedModifier {
  readonly op: ModifierOp;
  readonly count: number;
  readonly value: number;
  readonly target: number;
  readonly cap: number;
  readonly compare?: { readonly op: ComparisonOp; readonly value: number };
}

export interface ModifierContext {
  readonly scope: Scope;
  readonly rng: Rng;
  readonly evalExpr: (expr: unknown) => number | boolean;
}

const DEFAULT_EXPLODE_CAP = 100;

export function resolveFaces(spec: FacesSpec, ctx: ModifierContext): ResolvedFaces {
  switch (spec.kind) {
    case 'number': {
      const n = Math.max(1, Math.floor(spec.value));
      return { sides: n, max: n, roll: () => rollInt(ctx.rng, n) };
    }
    case 'percentile':
      return { sides: 100, max: 100, roll: () => rollInt(ctx.rng, 100) };
    case 'fate':
      return { sides: 3, max: 1, roll: () => rollInt(ctx.rng, 3) - 2 };
    case 'coin':
      return { sides: 2, max: 2, roll: () => rollInt(ctx.rng, 2) };
    case 'expr': {
      const n = Math.max(1, Math.floor(toNumber(ctx.evalExpr(spec.value))));
      return { sides: n, max: n, roll: () => rollInt(ctx.rng, n) };
    }
  }
}

export function resolveModifier(mod: Modifier, ctx: ModifierContext): ResolvedModifier {
  return {
    op: mod.op,
    count: mod.count ?? 1,
    value: mod.value ?? 0,
    target: mod.target ?? 0,
    cap: mod.cap ?? DEFAULT_EXPLODE_CAP,
    compare: mod.compare
      ? { op: mod.compare.op, value: toNumber(ctx.evalExpr(mod.compare.value)) }
      : undefined,
  };
}

function matches(value: number, compare: { op: ComparisonOp; value: number }): boolean {
  switch (compare.op) {
    case '=':
      return value === compare.value;
    case '>':
      return value > compare.value;
    case '>=':
      return value >= compare.value;
    case '<':
      return value < compare.value;
    case '<=':
      return value <= compare.value;
  }
}

const STRUCTURAL_ORDER: readonly ModifierOp[] = [
  'reroll-once',
  'reroll-recursive',
  'explode',
  'explode-once',
  'explode-compound',
  'explode-penetrating',
  'min',
  'max',
  'keep-highest',
  'keep-lowest',
  'drop-highest',
  'drop-lowest',
  'sort-asc',
  'sort-desc',
];

function isStructural(op: ModifierOp): boolean {
  return (STRUCTURAL_ORDER as readonly string[]).includes(op);
}

export function applyModifiers(
  dice: readonly WorkingDie[],
  modifiers: readonly ResolvedModifier[],
  faces: ResolvedFaces,
  ctx: ModifierContext,
): readonly WorkingDie[] {
  let current: readonly WorkingDie[] = [...dice];
  for (const op of STRUCTURAL_ORDER) {
    for (const mod of modifiers) {
      if (mod.op !== op) continue;
      current = applyStructural(current, mod, faces, ctx);
    }
  }
  return current;
}

function applyStructural(
  dice: readonly WorkingDie[],
  mod: ResolvedModifier,
  faces: ResolvedFaces,
  ctx: ModifierContext,
): readonly WorkingDie[] {
  switch (mod.op) {
    case 'reroll-once':
    case 'reroll-recursive':
      return applyReroll(dice, mod, faces);
    case 'explode':
    case 'explode-once':
    case 'explode-compound':
    case 'explode-penetrating':
      return applyExplode(dice, mod, faces);
    case 'min':
      return dice.map((d) => ({ ...d, value: Math.max(d.value, mod.value) }));
    case 'max':
      return dice.map((d) => ({ ...d, value: Math.min(d.value, mod.value) }));
    case 'keep-highest':
    case 'keep-lowest':
    case 'drop-highest':
    case 'drop-lowest':
      return applyKeepDrop(dice, mod.op, mod.count);
    case 'sort-asc':
      return [...dice].sort((a, b) => a.value - b.value);
    case 'sort-desc':
      return [...dice].sort((a, b) => b.value - a.value);
    default:
      return dice;
  }
}

function applyReroll(
  dice: readonly WorkingDie[],
  mod: ResolvedModifier,
  faces: ResolvedFaces,
): readonly WorkingDie[] {
  const compare = mod.compare ?? { op: '<=' as ComparisonOp, value: 1 };
  const recursive = mod.op === 'reroll-recursive';
  const out: WorkingDie[] = [];

  for (const die of dice) {
    if (die.exploded) {
      out.push(die);
      continue;
    }
    if (!matches(die.value, compare)) {
      out.push(die);
      continue;
    }
    const discarded = { ...die, kept: false, rerolled: true };
    out.push(discarded);

    let roll = faces.roll();
    let safety = 0;
    while (matches(roll, compare) && recursive && safety++ < 1000) {
      out.push({ value: roll, kept: false, exploded: false, rerolled: true, penetrated: false, outcome: 'neutral', history: [roll] });
      roll = faces.roll();
    }
    out.push({ value: roll, kept: true, exploded: false, rerolled: true, penetrated: false, outcome: 'neutral', history: [roll] });
  }
  return out;
}

function applyExplode(
  dice: readonly WorkingDie[],
  mod: ResolvedModifier,
  faces: ResolvedFaces,
): readonly WorkingDie[] {
  const compare = mod.compare ?? { op: '=' as ComparisonOp, value: faces.max };
  const compound = mod.op === 'explode-compound';
  const penetrating = mod.op === 'explode-penetrating';
  const recursive = mod.op !== 'explode-once';
  const cap = mod.cap;
  const out: WorkingDie[] = [...dice];
  const initial = out.length;

  for (let i = 0; i < initial; i++) {
    let current = out[i]!;
    let generations = 0;
    while (generations < cap) {
      const trigger = current.history[current.history.length - 1] ?? current.value;
      if (!matches(trigger, compare)) break;
      generations++;
      const roll = faces.roll();
      const adj = penetrating ? roll - 1 : roll;
      if (compound) {
        current.value += adj;
        current.history.push(roll);
        current.exploded = true;
        if (penetrating) current.penetrated = true;
      } else {
        const born: WorkingDie = {
          value: adj,
          kept: true,
          exploded: true,
          rerolled: false,
          penetrated: penetrating,
          outcome: 'neutral',
          history: [roll],
        };
        out.push(born);
        current = born;
      }
      if (!recursive) break;
    }
  }
  return out;
}

function applyKeepDrop(
  dice: readonly WorkingDie[],
  op: ModifierOp,
  count: number,
): readonly WorkingDie[] {
  const out = dice.map((d) => ({ ...d }));
  const len = out.length;
  const n = Math.max(0, Math.min(count, len));
  const order = out
    .map((d, i) => ({ v: d.value, i }))
    .sort((a, b) => a.v - b.v || a.i - b.i);

  const keepSet = new Set<number>();
  if (op === 'keep-highest') {
    order.slice(len - n).forEach((o) => keepSet.add(o.i));
  } else if (op === 'keep-lowest') {
    order.slice(0, n).forEach((o) => keepSet.add(o.i));
  } else if (op === 'drop-highest') {
    order.slice(0, len - n).forEach((o) => keepSet.add(o.i));
  } else if (op === 'drop-lowest') {
    order.slice(n).forEach((o) => keepSet.add(o.i));
  }

  out.forEach((d, i) => {
    if (!keepSet.has(i)) d.kept = false;
  });
  return out;
}

const SUCCESS_FAMILY: readonly ModifierOp[] = [
  'count-success',
  'count-failure',
  'deduct-failure',
  'subtract-failure',
];

export function computeValue(
  dice: readonly WorkingDie[],
  modifiers: readonly ResolvedModifier[],
): number {
  const kept = dice.filter((d) => d.kept);
  const sumKept = kept.reduce((acc, d) => acc + d.value, 0);

  const hasSuccessFamily = modifiers.some((m) =>
    (SUCCESS_FAMILY as readonly string[]).includes(m.op),
  );
  if (hasSuccessFamily) {
    const cs = modifiers.find((m) => m.op === 'count-success');
    const cf = modifiers.find((m) => m.op === 'count-failure');
    const df = modifiers.find(
      (m) => m.op === 'deduct-failure' || m.op === 'subtract-failure',
    );

    const csCompare = cs?.compare ?? { op: '>' as ComparisonOp, value: 0 };
    const cfCompare = cf?.compare ?? df?.compare ?? { op: '<=' as ComparisonOp, value: 0 };

    for (const d of dice) {
      if (!d.kept) continue;
      if (cs && matches(d.value, csCompare)) d.outcome = 'success';
      else if ((cf || df) && matches(d.value, cfCompare)) d.outcome = 'failure';
    }

    const successes = kept.filter((d) => d.outcome === 'success').length;
    const failures = kept.filter((d) => d.outcome === 'failure').length;

    if (cs) return successes;
    if (df) return successes - failures;
    if (cf) return failures;
  }

  const margin = modifiers.find((m) => m.op === 'margin-success');
  if (margin) return sumKept - margin.target;

  if (modifiers.some((m) => m.op === 'count-even')) {
    return kept.filter((d) => d.value % 2 === 0).length;
  }
  if (modifiers.some((m) => m.op === 'count-odd')) {
    return kept.filter((d) => d.value % 2 !== 0).length;
  }

  return sumKept;
}

export function appliedModifierNames(modifiers: readonly ResolvedModifier[]): readonly string[] {
  return modifiers.map((m) => m.op);
}
