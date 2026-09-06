import { defineMeasureMetrics, type MeasureToolOptions } from './schemas';

export const MEASURE_TOOL_DEFAULTS: MeasureToolOptions = Object.freeze({
  metrics: defineMeasureMetrics([{ perCell: 1 }]),
  separator: ' · ',
});
