import * as v from 'valibot';
import { LockableSchemaEntries } from '@openvtt/canvas';

export const DrawingTypeSchema = v.picklist(['rect', 'ellipse', 'polygon', 'brush', 'text']);
export type DrawingType = v.InferOutput<typeof DrawingTypeSchema>;

export const DrawingDataSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.pipe(v.string(), v.uuid())),
  type: DrawingTypeSchema,
  x: v.number(),
  y: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  rotation: v.optional(v.number(), 0),
  points: v.optional(v.array(v.number())),
  strokeColor: v.optional(v.union([v.number(), v.string()])),
  strokeWidth: v.optional(v.pipe(v.number(), v.minValue(0))),
  fillColor: v.optional(v.union([v.number(), v.string()])),
  fillAlpha: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  text: v.optional(v.string()),
  fontSize: v.optional(v.pipe(v.number(), v.minValue(1)), 16),
  zIndex: v.optional(v.number(), 0),
});

export type DrawingData = v.InferOutput<typeof DrawingDataSchema>;
export type DrawingDataInput = v.InferInput<typeof DrawingDataSchema>;

export function parseDrawing(data: unknown): DrawingData {
  return v.parse(DrawingDataSchema, data);
}
