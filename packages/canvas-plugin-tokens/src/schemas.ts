import * as v from 'valibot';
import { LockableSchemaEntries } from '@openvtt/canvas';

export const TokenDataSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  size: v.optional(v.pipe(v.number(), v.minValue(0.1)), 1),
  rotation: v.optional(v.number(), 0),
  texture: v.optional(v.string()),
  label: v.optional(v.string()),
  tint: v.optional(v.union([v.number(), v.string()])),
  elevation: v.optional(v.number(), 0),
  hidden: v.optional(v.boolean(), false),
  /** Raio de visão em células de grid (0 = sem visão). Usado pelo fog of war. */
  visionRadius: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
  /** Emissão de luz (células): bright = clareza total, dim = penumbra (0 = não emite). */
  lightBright: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
  lightDim: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
  /** Barras de recurso sobre o token (ex.: HP). */
  bar1: v.optional(v.object({ value: v.number(), max: v.number() })),
  bar2: v.optional(v.object({ value: v.number(), max: v.number() })),
});

export type TokenData = v.InferOutput<typeof TokenDataSchema>;
export type TokenDataInput = v.InferInput<typeof TokenDataSchema>;

export function parseToken(data: unknown): TokenData {
  return v.parse(TokenDataSchema, data);
}
