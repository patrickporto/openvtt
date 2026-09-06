import { defineMeasureMetrics, type MeasureMetric } from './schemas';

export interface MeasureMetricPreset {
  readonly id: string;
  readonly label: string;
  readonly metrics: readonly MeasureMetric[];
}

export const CELLS_PRESET: MeasureMetricPreset = {
  id: 'cells',
  label: 'Cells',
  metrics: defineMeasureMetrics([{ perCell: 1, suffix: ' u' }]),
};

export const DND5E_PRESET: MeasureMetricPreset = {
  id: 'dnd5e',
  label: 'D&D 5e (ft)',
  metrics: defineMeasureMetrics([{ perCell: 5, suffix: ' ft' }]),
};

export const METRIC_PRESET: MeasureMetricPreset = {
  id: 'metric',
  label: 'Metric (m)',
  metrics: defineMeasureMetrics([{ perCell: 1.5, suffix: ' m' }]),
};

export const DND5E_METRIC_PRESET: MeasureMetricPreset = {
  id: 'dnd5e-metric',
  label: 'D&D 5e + Metric',
  metrics: defineMeasureMetrics([
    { perCell: 5, suffix: ' ft' },
    { perCell: 1.5, suffix: ' m' },
  ]),
};

export const MEASURE_METRIC_PRESETS: Readonly<Record<string, MeasureMetricPreset>> = Object.freeze(
  Object.fromEntries(
    [CELLS_PRESET, DND5E_PRESET, METRIC_PRESET, DND5E_METRIC_PRESET].map((preset) => [preset.id, preset]),
  ),
);
