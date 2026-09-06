import * as v from 'valibot';

export const MeasureMetricSchema = v.object({
  perCell: v.pipe(v.number(), v.minValue(0.01)),
  suffix: v.optional(v.string(), ' u'),
  precision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)), 1),
});
export type MeasureMetric = v.InferOutput<typeof MeasureMetricSchema>;
export type MeasureMetricInput = v.InferInput<typeof MeasureMetricSchema>;

export const MeasureMetricsListSchema = v.pipe(v.array(MeasureMetricSchema), v.minLength(1));

export const MeasureToolOptionsSchema = v.object({
  metrics: MeasureMetricsListSchema,
  separator: v.optional(v.string(), ' · '),
});
export type MeasureToolOptions = Omit<v.InferOutput<typeof MeasureToolOptionsSchema>, 'metrics'> & {
  readonly metrics: readonly MeasureMetric[];
};

export const MeasureMetricResultSchema = v.object({
  perCell: v.number(),
  suffix: v.string(),
  precision: v.number(),
  value: v.number(),
});
export type MeasureMetricResult = v.InferOutput<typeof MeasureMetricResultSchema>;

export const MeasureEventSchema = v.object({
  pixels: v.number(),
  units: v.number(),
  x1: v.number(),
  y1: v.number(),
  x2: v.number(),
  y2: v.number(),
  segments: v.optional(v.number()),
  metrics: v.optional(v.array(MeasureMetricResultSchema)),
  label: v.optional(v.string()),
});
export type MeasureEventData = v.InferOutput<typeof MeasureEventSchema>;

export function defineMeasureMetrics(list: readonly (MeasureMetricInput | MeasureMetric)[]): readonly MeasureMetric[] {
  const parsed = v.parse(MeasureMetricsListSchema, list);
  return Object.freeze(parsed.map((metric) => Object.freeze({ ...metric })));
}
