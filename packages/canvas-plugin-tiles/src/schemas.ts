import * as v from 'valibot';

export const TileDataSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  width: v.pipe(v.number(), v.minValue(1)),
  height: v.pipe(v.number(), v.minValue(1)),
  rotation: v.optional(v.number(), 0),
  texture: v.optional(v.string()),
  alpha: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 1),
  zIndex: v.optional(v.number(), 0),
});

export type TileData = v.InferOutput<typeof TileDataSchema>;
export type TileDataInput = v.InferInput<typeof TileDataSchema>;

export function parseTile(data: unknown): TileData {
  return v.parse(TileDataSchema, data);
}
