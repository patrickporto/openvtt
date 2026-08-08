import { v7 as uuidv7 } from 'uuid';
import { evaluateFormula, toNumber, type Scope } from '@openvtt/formula';
import type { DieTerm, DiceExpr, Modifier, Pool, RollExpr } from './ir';
import { createRng, type Rng } from './rng';
import type { DieRoll, TermResult, RollResult, WorkingDie } from './result';
import { freeze } from './result';
import {
  applyModifiers,
  appliedModifierNames,
  computeValue,
  resolveFaces,
  resolveModifier,
  type ModifierContext,
  type ResolvedFaces,
  type ResolvedModifier,
} from './modifiers';

export interface EvaluateOptions {
  readonly scope?: Scope;
  readonly rng?: Rng;
  readonly seed?: string;
}

interface Ctx extends ModifierContext {
  terms: TermResult[];
}

export function evaluateRoll(expr: RollExpr, options: EvaluateOptions = {}): RollResult {
  const rng: Rng = options.rng ?? (options.seed != null ? createRng(options.seed) : createRng());
  const ctx: Ctx = {
    scope: options.scope,
    rng,
    evalExpr: (e: unknown) => evalNode(e as RollExpr, ctx),
    terms: [],
  };

  const value = evalNode(expr, ctx);

  return {
    id: uuidv7(),
    value,
    terms: ctx.terms,
    rolls: collectRolls(ctx.terms),
  };
}

function evalNode(expr: RollExpr, ctx: Ctx): number | boolean {
  return evaluateFormula<DiceExpr>(expr, {
    scope: ctx.scope,
    onLeaf: (leaf) => evalLeaf(leaf, ctx),
  });
}

function evalLeaf(node: DiceExpr, ctx: Ctx): number {
  return node.type === 'die' ? evalDie(node, ctx).value : evalPool(node, ctx).value;
}

function newWorkingDie(value: number): WorkingDie {
  return {
    value,
    kept: true,
    exploded: false,
    rerolled: false,
    penetrated: false,
    outcome: 'neutral',
    history: [value],
  };
}

function evalDie(term: DieTerm, ctx: Ctx): TermResult {
  const count = Math.max(0, Math.floor(toNumber(ctx.evalExpr(term.count))));
  const faces: ResolvedFaces = resolveFaces(term.faces, ctx);

  const dice: WorkingDie[] = [];
  for (let i = 0; i < count; i++) dice.push(newWorkingDie(faces.roll()));

  const modifiers: readonly Modifier[] = term.modifiers ?? [];
  const resolved: readonly ResolvedModifier[] = modifiers.map((m) => resolveModifier(m, ctx));
  const finalDice = applyModifiers(dice, resolved, faces, ctx);
  const value = computeValue(finalDice, resolved);

  const result: TermResult = {
    id: uuidv7(),
    type: 'die',
    value,
    dice: freeze(finalDice),
    applied: appliedModifierNames(resolved),
  };
  ctx.terms.push(result);
  return result;
}

function evalPool(pool: Pool, ctx: Ctx): TermResult {
  const saved = ctx.terms;
  const childTerms: TermResult[] = [];
  ctx.terms = childTerms;

  const children: TermResult[] = [];
  const dice: WorkingDie[] = [];

  for (const entry of pool.entries) {
    const before = ctx.terms.length;
    evalNode(entry, ctx);
    const produced = ctx.terms.slice(before);
    for (const term of produced) {
      children.push(term);
      for (const d of term.dice) dice.push({ ...d, history: [...d.history] });
    }
  }

  ctx.terms = saved;

  const modifiers: readonly Modifier[] = pool.modifiers ?? [];
  const resolved: readonly ResolvedModifier[] = modifiers.map((m) => resolveModifier(m, ctx));
  const faces = poolFallbackFaces(dice);
  const finalDice = applyModifiers(dice, resolved, faces, ctx);
  const value = computeValue(finalDice, resolved);

  const result: TermResult = {
    id: uuidv7(),
    type: 'pool',
    value,
    dice: freeze(finalDice),
    applied: appliedModifierNames(resolved),
    children,
  };
  ctx.terms.push(result);
  return result;
}

function poolFallbackFaces(dice: readonly WorkingDie[]): ResolvedFaces {
  const max = dice.reduce((acc, d) => Math.max(acc, d.value), 1);
  return {
    sides: max,
    max,
    roll: () => 1,
  };
}

function collectRolls(terms: readonly TermResult[]): readonly DieRoll[] {
  const out: DieRoll[] = [];
  for (const term of terms) {
    for (const d of term.dice) out.push(d);
  }
  return out;
}
