import * as v from 'valibot';

export const RollTableAnchorSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  tableId: v.pipe(v.string(), v.minLength(1)),
  label: v.optional(v.string()),
  color: v.optional(v.union([v.number(), v.string()])),
  lastResult: v.optional(v.string()),
});

export type RollTableAnchorData = v.InferOutput<typeof RollTableAnchorSchema>;
export type RollTableAnchorInput = v.InferInput<typeof RollTableAnchorSchema>;
