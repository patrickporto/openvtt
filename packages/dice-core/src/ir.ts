import type { FormulaExpr } from '@openvtt/formula';

export type ComparisonOp = '=' | '>' | '>=' | '<' | '<=';

export interface Comparison {
  readonly op: ComparisonOp;
  readonly value: RollExpr;
}

export type ModifierOp =
  | 'keep-highest'
  | 'keep-lowest'
  | 'drop-highest'
  | 'drop-lowest'
  | 'reroll-once'
  | 'reroll-recursive'
  | 'explode'
  | 'explode-once'
  | 'explode-compound'
  | 'explode-penetrating'
  | 'min'
  | 'max'
  | 'count-success'
  | 'count-failure'
  | 'deduct-failure'
  | 'subtract-failure'
  | 'count-even'
  | 'count-odd'
  | 'margin-success'
  | 'sort-asc'
  | 'sort-desc';

export const MODIFIER_OPS: readonly ModifierOp[] = [
  'keep-highest',
  'keep-lowest',
  'drop-highest',
  'drop-lowest',
  'reroll-once',
  'reroll-recursive',
  'explode',
  'explode-once',
  'explode-compound',
  'explode-penetrating',
  'min',
  'max',
  'count-success',
  'count-failure',
  'deduct-failure',
  'subtract-failure',
  'count-even',
  'count-odd',
  'margin-success',
  'sort-asc',
  'sort-desc',
];

export interface Modifier {
  readonly op: ModifierOp;
  readonly count?: number;
  readonly value?: number;
  readonly target?: number;
  readonly cap?: number;
  readonly compare?: Comparison;
}

export type FacesSpec =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'percentile' }
  | { readonly kind: 'fate' }
  | { readonly kind: 'coin' }
  | { readonly kind: 'expr'; readonly value: RollExpr };

export interface DieTerm {
  readonly type: 'die';
  readonly count: RollExpr;
  readonly faces: FacesSpec;
  readonly modifiers?: readonly Modifier[];
}

export interface Pool {
  readonly type: 'pool';
  readonly entries: readonly RollExpr[];
  readonly modifiers?: readonly Modifier[];
}

export type DiceExpr = DieTerm | Pool;

export type RollExpr = FormulaExpr<DiceExpr>;

export type { FormulaExpr };

export function isDiceExpr(expr: RollExpr): expr is DiceExpr {
  if (typeof expr !== 'object' || expr === null) return false;
  const type = (expr as { type?: string }).type;
  return type === 'die' || type === 'pool';
}
