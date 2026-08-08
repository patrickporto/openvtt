export type {
  Comparison,
  ComparisonOp,
  DiceExpr,
  DieTerm,
  FacesSpec,
  FormulaExpr,
  Modifier,
  ModifierOp,
  Pool,
  RollExpr,
} from './ir';
export { MODIFIER_OPS, isDiceExpr } from './ir';

export type {
  DieOutcome,
  DieRoll,
  RollResult,
  TermResult,
  WorkingDie,
} from './result';
export { freeze, makeDieRoll, toDieRoll } from './result';

export { createRng, rollInt } from './rng';
export type { Rng } from './rng';

export {
  applyModifiers,
  appliedModifierNames,
  computeValue,
  resolveFaces,
  resolveModifier,
} from './modifiers';
export type {
  ModifierContext,
  ResolvedFaces,
  ResolvedModifier,
} from './modifiers';

export { evaluateRoll } from './evaluate';
export type { EvaluateOptions } from './evaluate';

export { rollSchema, buildRollSchema } from './schema';

export { DiceError } from './errors';
export type { DiceErrorOptions } from './errors';
