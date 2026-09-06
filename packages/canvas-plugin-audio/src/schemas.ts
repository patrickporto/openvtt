import * as v from 'valibot';
import { LockableSchemaEntries } from '@openvtt/canvas';

const SrcSchema = v.union([
  v.pipe(v.string(), v.minLength(1)),
  v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
]);

export const SoundDataSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  src: SrcSchema,
  radius: v.optional(v.pipe(v.number(), v.minValue(0)), 4),
  volume: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 1),
  channel: v.optional(v.string(), 'ambient'),
  loop: v.optional(v.boolean(), true),
  playing: v.optional(v.boolean(), true),
  global: v.optional(v.boolean(), false),
});

export type SoundData = v.InferOutput<typeof SoundDataSchema>;
export type SoundDataInput = v.InferInput<typeof SoundDataSchema>;

export const SoundSourceSchema = v.object({
  key: v.string(),
  x: v.number(),
  y: v.number(),
  radius: v.optional(v.pipe(v.number(), v.minValue(0)), 4),
  src: SrcSchema,
  volume: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 1),
  channel: v.optional(v.string(), 'ambient'),
  loop: v.optional(v.boolean(), true),
  playing: v.optional(v.boolean(), true),
  global: v.optional(v.boolean(), false),
});

export type SoundSource = v.InferOutput<typeof SoundSourceSchema>;
export type SoundSourceInput = v.InferInput<typeof SoundSourceSchema>;
