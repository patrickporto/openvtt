import * as v from 'valibot';

type AnySchema = v.GenericSchema;

export function createFormulaSchema(extra?: AnySchema): AnySchema {
  const Formula: AnySchema = v.lazy(() => buildUnion(Formula, extra));
  return Formula;
}

function buildUnion(self: AnySchema, extra: AnySchema | undefined): AnySchema {
  const pair = v.strictTuple([self, self]);
  const triple = v.strictTuple([self, self, self]);
  const list = v.array(self);

  const members: AnySchema[] = [
    v.number(),
    v.boolean(),
    v.strictObject({ '+': pair }),
    v.strictObject({ '-': v.union([v.strictTuple([self]), pair]) }),
    v.strictObject({ '*': pair }),
    v.strictObject({ '/': pair }),
    v.strictObject({ '%': pair }),
    v.strictObject({ '==': pair }),
    v.strictObject({ '!=': pair }),
    v.strictObject({ '<': pair }),
    v.strictObject({ '<=': pair }),
    v.strictObject({ '>': pair }),
    v.strictObject({ '>=': pair }),
    v.strictObject({ and: list }),
    v.strictObject({ or: list }),
    v.strictObject({ '!': v.strictTuple([self]) }),
    v.strictObject({ if: triple }),
    v.strictObject({ var: v.string() }),
    v.strictObject({ floor: v.strictTuple([self]) }),
    v.strictObject({ ceil: v.strictTuple([self]) }),
    v.strictObject({ round: v.strictTuple([self]) }),
    v.strictObject({ abs: v.strictTuple([self]) }),
    v.strictObject({ min: list }),
    v.strictObject({ max: list }),
    v.strictObject({ clamp: triple }),
  ];

  if (extra) members.push(extra);
  return v.union(members);
}

export const formulaSchema = createFormulaSchema();
