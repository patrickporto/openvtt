import * as v from 'valibot';

export const RangeShapeSchema = v.picklist(['circle', 'square']);
export type RangeShape = v.InferOutput<typeof RangeShapeSchema>;

export const RangeRingSchema = v.union([
  v.pipe(v.number(), v.minValue(0.1)),
  v.object({
    distance: v.pipe(v.number(), v.minValue(0.1)),
    label: v.optional(v.string()),
    color: v.optional(v.pipe(v.string(), v.minLength(3))),
    emphasis: v.optional(v.boolean(), false),
  }),
]);
export type RangeRingSpec = v.InferOutput<typeof RangeRingSchema>;

export const RangePresetSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  label: v.optional(v.string()),
  unit: v.optional(
    v.object({
      perCell: v.optional(v.pipe(v.number(), v.minValue(0.01)), 1),
      suffix: v.optional(v.string(), ' u'),
    }),
    { perCell: 1, suffix: ' u' },
  ),
  rings: v.pipe(v.array(RangeRingSchema), v.minLength(1)),
});
export type RangePreset = Omit<v.InferOutput<typeof RangePresetSchema>, 'rings'> & {
  readonly rings: readonly RangeRingSpec[];
};
export type RangePresetInput = v.InferInput<typeof RangePresetSchema>;

export const RangeThemeSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  label: v.optional(v.string()),
  colors: v.pipe(v.array(v.pipe(v.string(), v.minLength(3))), v.minLength(1)),
});
export type RangeTheme = v.InferOutput<typeof RangeThemeSchema>;
export type RangeThemeInput = v.InferInput<typeof RangeThemeSchema>;

export const RangePlacedEventSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  x: v.number(),
  y: v.number(),
  preset: v.string(),
  shape: RangeShapeSchema,
  rings: v.number(),
  tokenId: v.optional(v.string()),
});
export type RangePlacedEvent = v.InferOutput<typeof RangePlacedEventSchema>;

export const RangeClearedEventSchema = v.object({ count: v.number() });
export type RangeClearedEvent = v.InferOutput<typeof RangeClearedEventSchema>;

export function parseRangePreset(data: unknown): RangePreset {
  return v.parse(RangePresetSchema, data);
}

export function parseRangeTheme(data: unknown): RangeTheme {
  return v.parse(RangeThemeSchema, data);
}

export function defineRangePreset(def: RangePresetInput | RangePreset): RangePreset {
  const preset = parseRangePreset(def);
  return Object.freeze({ ...preset, rings: Object.freeze([...preset.rings]) });
}

export function defineRangeTheme(def: RangeThemeInput): RangeTheme {
  return Object.freeze(parseRangeTheme(def));
}
