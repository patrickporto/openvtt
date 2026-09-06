import * as v from 'valibot';
import { LockableSchemaEntries } from '@openvtt/canvas';

export const LightDataSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  dim: v.pipe(v.number(), v.minValue(0.5)),
  bright: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
  color: v.optional(v.union([v.number(), v.string()])),
});

export type LightData = v.InferOutput<typeof LightDataSchema>;
export type LightDataInput = v.InferInput<typeof LightDataSchema>;
