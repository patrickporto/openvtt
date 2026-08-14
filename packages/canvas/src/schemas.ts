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

/**
 * Cena do core: dimensões, fundo e grid. `looseObject` preserva chaves
 * desconhecidas — plugins leem os seus documentos via `sceneKey` legada
 * (ex.: `tokens`) ou via `documents: { [type]: [...] }`.
 */
export const SceneDataSchema = v.looseObject({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  name: v.optional(v.string()),
  width: v.pipe(v.number(), v.minValue(1)),
  height: v.pipe(v.number(), v.minValue(1)),
  background: v.optional(v.string()),
  backgroundColor: v.optional(v.union([v.number(), v.string()])),
  grid: v.optional(GridSchema),
  padding: v.optional(v.number(), 0),
  /** Documentos por tipo registrado (ex.: { token: [...], light: [...] }). */
  documents: v.optional(v.record(v.string(), v.array(v.unknown()))),
});

export type SceneData = v.InferOutput<typeof SceneDataSchema>;
export type GridData = v.InferOutput<typeof GridSchema>;

export type SceneDataInput = v.InferInput<typeof SceneDataSchema>;

export function parseScene(data: unknown): SceneData {
  return v.parse(SceneDataSchema, data);
}
