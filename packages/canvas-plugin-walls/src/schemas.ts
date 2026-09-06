import * as v from 'valibot';
import { LockableSchemaEntries } from '@openvtt/canvas';

export const WallCurveSchema = v.picklist(['linear', 'quadratic', 'cubic']);

export const WallSegmentSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x1: v.number(),
  y1: v.number(),
  x2: v.number(),
  y2: v.number(),
  cp1x: v.optional(v.number()),
  cp1y: v.optional(v.number()),
  cp2x: v.optional(v.number()),
  cp2y: v.optional(v.number()),
  curve: v.optional(WallCurveSchema, 'linear'),
  door: v.optional(v.boolean(), false),
  doorOpen: v.optional(v.boolean(), false),
  secret: v.optional(v.boolean(), false),
  movement: v.optional(v.boolean(), true),
  sight: v.optional(v.boolean(), true),
  sound: v.optional(v.boolean(), false),
});

export const WallDataSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.pipe(v.string(), v.uuid())),
  segments: v.array(WallSegmentSchema),
});

export type WallSegmentData = v.InferOutput<typeof WallSegmentSchema>;
export type WallData = v.InferOutput<typeof WallDataSchema>;
export type WallSegmentDataInput = v.InferInput<typeof WallSegmentSchema>;
export type WallDataInput = v.InferInput<typeof WallDataSchema>;
