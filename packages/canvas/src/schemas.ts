import * as v from 'valibot';

export const GridTypeSchema = v.picklist([
  'none',
  'square',
  'hex-vertical',
  'hex-horizontal',
  'isometric',
] as const);

export const GridSchema = v.object({
  type: GridTypeSchema,
  size: v.pipe(v.number(), v.minValue(1)),
  color: v.optional(v.union([v.number(), v.string()])),
  alpha: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  lineWidth: v.optional(v.pipe(v.number(), v.minValue(0.5), v.maxValue(10))),
  offsetX: v.optional(v.number()),
  offsetY: v.optional(v.number()),
});

export const TokenDataSchema = v.object({
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

export const DrawingTypeSchema = v.picklist(['rect', 'ellipse', 'polygon', 'brush', 'text']);

export const DrawingDataSchema = v.object({
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
  /** Porta aberta: não bloqueia visão nem movimento. */
  doorOpen: v.optional(v.boolean(), false),
  /** Porta secreta: estilo visual discreto; alternável via ctrl+right-click. */
  secret: v.optional(v.boolean(), false),
  movement: v.optional(v.boolean(), true),
  sight: v.optional(v.boolean(), true),
  sound: v.optional(v.boolean(), false),
});

export const WallDataSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  segments: v.array(WallSegmentSchema),
});

export const LightDataSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  x: v.number(),
  y: v.number(),
  /** Raios em células de grid: bright = clareza total, dim = penumbra. */
  dim: v.pipe(v.number(), v.minValue(0.5)),
  bright: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
  color: v.optional(v.union([v.number(), v.string()])),
});

export const TemplateShapeSchema = v.picklist(['circle', 'cone', 'ray']);

export const TemplateDataSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  shape: TemplateShapeSchema,
  /** Ponto de origem (centro do círculo, ápice do cone/raio). */
  x: v.number(),
  y: v.number(),
  /** Direção em radianos (cone/ray). */
  direction: v.optional(v.number(), 0),
  /** Alcance em células de grid. */
  distance: v.pipe(v.number(), v.minValue(0.5)),
  /** Largura em células (apenas ray). */
  width: v.optional(v.pipe(v.number(), v.minValue(0.5)), 1),
  color: v.optional(v.union([v.number(), v.string()])),
  fillAlpha: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.25),
});

export const SceneDataSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  name: v.optional(v.string()),
  width: v.pipe(v.number(), v.minValue(1)),
  height: v.pipe(v.number(), v.minValue(1)),
  background: v.optional(v.string()),
  backgroundColor: v.optional(v.union([v.number(), v.string()])),
  grid: v.optional(GridSchema),
  padding: v.optional(v.number(), 0),
  tokens: v.optional(v.array(TokenDataSchema), []),
  tiles: v.optional(v.array(TileDataSchema), []),
  drawings: v.optional(v.array(DrawingDataSchema), []),
  walls: v.optional(v.array(WallDataSchema), []),
  lights: v.optional(v.array(LightDataSchema), []),
  templates: v.optional(v.array(TemplateDataSchema), []),
});

export type TokenData = v.InferOutput<typeof TokenDataSchema>;
export type TileData = v.InferOutput<typeof TileDataSchema>;
export type DrawingData = v.InferOutput<typeof DrawingDataSchema>;
export type DrawingType = v.InferOutput<typeof DrawingTypeSchema>;
export type WallSegmentData = v.InferOutput<typeof WallSegmentSchema>;
export type WallData = v.InferOutput<typeof WallDataSchema>;
export type LightData = v.InferOutput<typeof LightDataSchema>;
export type TemplateData = v.InferOutput<typeof TemplateDataSchema>;
export type TemplateShape = v.InferOutput<typeof TemplateShapeSchema>;
export type SceneData = v.InferOutput<typeof SceneDataSchema>;
export type GridData = v.InferOutput<typeof GridSchema>;

export type TokenDataInput = v.InferInput<typeof TokenDataSchema>;
export type TileDataInput = v.InferInput<typeof TileDataSchema>;
export type DrawingDataInput = v.InferInput<typeof DrawingDataSchema>;
export type WallSegmentDataInput = v.InferInput<typeof WallSegmentSchema>;
export type WallDataInput = v.InferInput<typeof WallDataSchema>;
export type LightDataInput = v.InferInput<typeof LightDataSchema>;
export type TemplateDataInput = v.InferInput<typeof TemplateDataSchema>;
export type SceneDataInput = v.InferInput<typeof SceneDataSchema>;

export function parseScene(data: unknown): SceneData {
  return v.parse(SceneDataSchema, data);
}

export function parseToken(data: unknown): TokenData {
  return v.parse(TokenDataSchema, data);
}
