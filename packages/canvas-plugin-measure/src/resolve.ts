import * as v from 'valibot';
import type { Point } from '@openvtt/canvas';
import { MEASURE_TOOL_DEFAULTS } from './options';
import {
  MeasureToolOptionsSchema,
  type MeasureEventData,
  type MeasureMetric,
  type MeasureMetricResult,
  type MeasureToolOptions,
} from './schemas';

export function resolveMeasureOptions(raw: unknown): MeasureToolOptions {
  const result = v.safeParse(MeasureToolOptionsSchema, raw);
  return result.success ? result.output : { ...MEASURE_TOOL_DEFAULTS, metrics: [...MEASURE_TOOL_DEFAULTS.metrics] };
}

export function pathLength(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return sum;
}

export function formatMetricValue(metric: MeasureMetric, cells: number): string {
  const fixed = (cells * metric.perCell).toFixed(metric.precision);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return `${trimmed}${metric.suffix}`;
}

export function formatMetrics(options: MeasureToolOptions, cells: number): string {
  return options.metrics.map((metric) => formatMetricValue(metric, cells)).join(options.separator);
}

export function metricValues(options: MeasureToolOptions, cells: number): MeasureMetricResult[] {
  return options.metrics.map((metric) => ({
    perCell: metric.perCell,
    suffix: metric.suffix,
    precision: metric.precision,
    value: cells * metric.perCell,
  }));
}

export function buildMeasurePayload(options: MeasureToolOptions, points: readonly Point[], gridSize: number): MeasureEventData {
  const pixels = pathLength(points);
  const cells = pixels / gridSize;
  const first = points[0];
  const last = points[points.length - 1];
  return {
    pixels,
    units: cells,
    x1: first.x,
    y1: first.y,
    x2: last.x,
    y2: last.y,
    segments: points.length - 1,
    metrics: metricValues(options, cells),
    label: formatMetrics(options, cells),
  };
}
