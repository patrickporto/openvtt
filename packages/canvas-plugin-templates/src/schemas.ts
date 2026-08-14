import * as v from 'valibot';

export const TemplateShapeSchema = v.picklist(['circle', 'cone', 'ray']);

export const TemplateDataSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  shape: TemplateShapeSchema,
  x: v.number(),
  y: v.number(),
  direction: v.optional(v.number(), 0),
  distance: v.pipe(v.number(), v.minValue(0.5)),
  width: v.optional(v.pipe(v.number(), v.minValue(0.5)), 1),
  color: v.optional(v.union([v.number(), v.string()])),
  fillAlpha: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.25),
});

export type TemplateShape = v.InferOutput<typeof TemplateShapeSchema>;
export type TemplateData = v.InferOutput<typeof TemplateDataSchema>;
export type TemplateDataInput = v.InferInput<typeof TemplateDataSchema>;
