import * as v from 'valibot';
import { LockableSchemaEntries } from '@openvtt/canvas';

export const ImageMapSourceSchema = v.object({
  type: v.literal('image'),
  src: v.string(),
});

export const TiledMapSourceSchema = v.object({
  type: v.literal('tiled'),
  url: v.string(),
  tileSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(64), v.maxValue(1024)), 256),
  minLevel: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  maxLevel: v.pipe(v.number(), v.integer(), v.minValue(0)),
  width: v.pipe(v.number(), v.minValue(1)),
  height: v.pipe(v.number(), v.minValue(1)),
});

export type ImageMapSource = v.InferOutput<typeof ImageMapSourceSchema>;
export type TiledMapSource = v.InferOutput<typeof TiledMapSourceSchema>;
export type MapSource = ImageMapSource | TiledMapSource;

export const MapSourceSchema = v.pipe(
  v.union([v.string(), ImageMapSourceSchema, TiledMapSourceSchema]),
  v.transform((input): MapSource => (typeof input === 'string' ? { type: 'image', src: input } : input)),
);

export const MapDataSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  width: v.optional(v.pipe(v.number(), v.minValue(1))),
  height: v.optional(v.pipe(v.number(), v.minValue(1))),
  alpha: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 1),
  source: MapSourceSchema,
});

export type MapSourceInput = v.InferInput<typeof MapSourceSchema>;
export type MapData = v.InferOutput<typeof MapDataSchema>;
export type MapDataInput = v.InferInput<typeof MapDataSchema>;
