import * as v from 'valibot';
import { createFormulaSchema } from '@openvtt/formula';
import { MODIFIER_OPS } from './ir';
import type { ComparisonOp, ModifierOp } from './ir';

export function buildRollSchema(): v.GenericSchema {
  const Roll: v.GenericSchema = v.lazy(() => createFormulaSchema(buildDiceSchema(Roll)));
  return Roll;
}

function buildDiceSchema(roll: v.GenericSchema): v.GenericSchema {
  const comparisonSchema = v.strictObject({
    op: v.picklist(['=', '>', '>=', '<', '<='] as const),
    value: roll,
  });

  const facesSchema = v.union([
    v.strictObject({ kind: v.literal('number'), value: v.number() }),
    v.strictObject({ kind: v.literal('percentile') }),
    v.strictObject({ kind: v.literal('fate') }),
    v.strictObject({ kind: v.literal('coin') }),
    v.strictObject({ kind: v.literal('expr'), value: roll }),
  ]);

  const modifierSchema = v.strictObject({
    op: v.picklist([...MODIFIER_OPS] as [ModifierOp, ...ModifierOp[]]),
    count: v.optional(v.number()),
    value: v.optional(v.number()),
    target: v.optional(v.number()),
    cap: v.optional(v.number()),
    compare: v.optional(comparisonSchema),
  });

  const dieSchema = v.strictObject({
    type: v.literal('die'),
    count: roll,
    faces: facesSchema,
    modifiers: v.optional(v.array(modifierSchema)),
  });

  const poolSchema = v.strictObject({
    type: v.literal('pool'),
    entries: v.array(roll),
    modifiers: v.optional(v.array(modifierSchema)),
  });

  return v.union([dieSchema, poolSchema]);
}

export type ComparisonOpTuple = ComparisonOp;

export const rollSchema = buildRollSchema();
