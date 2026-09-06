import * as v from 'valibot';
import { LockableSchemaEntries } from '@openvtt/canvas';

export const HexColorSchema = v.pipe(v.string(), v.regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/));

export const RingStyleSchema = v.object({
  color: v.optional(HexColorSchema, '#1a6aff'),
  width: v.optional(v.pipe(v.number(), v.minValue(0.5)), 3),
  alpha: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 1),
  shape: v.optional(v.picklist(['circle', 'square']), 'circle'),
  dash: v.optional(v.array(v.pipe(v.number(), v.minValue(0))), []),
  pulse: v.optional(v.boolean(), false),
  glow: v.optional(v.boolean(), false),
});
export type RingStyle = v.InferOutput<typeof RingStyleSchema>;
export type RingStyleInput = v.InferInput<typeof RingStyleSchema>;

export const RingDataSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.pipe(v.string(), v.uuid())),
  tokenId: v.pipe(v.string(), v.minLength(1)),
  preset: v.optional(v.string()),
  label: v.optional(v.string()),
  order: v.optional(v.number(), 0),
  style: v.optional(RingStyleSchema, {}),
});
export type RingData = v.InferOutput<typeof RingDataSchema>;
export type RingDataInput = v.InferInput<typeof RingDataSchema>;

export function parseRing(data: unknown): RingData {
  return v.parse(RingDataSchema, data);
}

export const DEFAULT_RING_STYLE: RingStyle = v.parse(RingStyleSchema, {});
