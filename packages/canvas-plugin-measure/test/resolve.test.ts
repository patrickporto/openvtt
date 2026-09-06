import { describe, expect, it } from 'bun:test';
import { buildMeasurePayload, formatMetricValue, formatMetrics, metricValues, pathLength, resolveMeasureOptions } from '../src/resolve';
import { MEASURE_TOOL_DEFAULTS } from '../src/options';
import { DND5E_METRIC_PRESET } from '../src/presets';
import type { Point } from '@openvtt/canvas';

describe('formatMetricValue', () => {
  it('drops trailing zero decimals within precision', () => {
    expect(formatMetricValue({ perCell: 5, suffix: ' ft', precision: 1 }, 6)).toBe('30 ft');
    expect(formatMetricValue({ perCell: 5, suffix: ' ft', precision: 1 }, 1.5)).toBe('7.5 ft');
    expect(formatMetricValue({ perCell: 1, suffix: ' u', precision: 1 }, 0.04)).toBe('0 u');
  });

  it('keeps integers intact when precision is zero', () => {
    expect(formatMetricValue({ perCell: 5, suffix: ' ft', precision: 0 }, 1.24)).toBe('6 ft');
    expect(formatMetricValue({ perCell: 100, suffix: ' km', precision: 0 }, 1)).toBe('100 km');
  });

  it('converts cells with the per-cell factor', () => {
    expect(formatMetricValue({ perCell: 1.5, suffix: ' m', precision: 1 }, 6)).toBe('9 m');
    expect(formatMetricValue({ perCell: 0.01, suffix: ' h', precision: 2 }, 100)).toBe('1 h');
  });
});

describe('formatMetrics', () => {
  it('formats fractional cells to one decimal, like the legacy single-unit label', () => {
    expect(formatMetrics(MEASURE_TOOL_DEFAULTS, 12.34)).toBe('12.3 u');
  });

  it('drops the .0 on whole cells, unlike the legacy label', () => {
    expect(formatMetrics(MEASURE_TOOL_DEFAULTS, 12)).toBe('12 u');
  });

  it('joins multiple metrics with the configured separator', () => {
    const options = resolveMeasureOptions({
      metrics: [
        { perCell: 5, suffix: ' ft' },
        { perCell: 1.5, suffix: ' m' },
      ],
    });
    expect(formatMetrics(options, 6)).toBe('30 ft · 9 m');
    expect(formatMetrics({ ...options, separator: ' / ' }, 6)).toBe('30 ft / 9 m');
  });
});

describe('pathLength', () => {
  it('sums segment lengths across waypoints', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ];
    expect(pathLength(points)).toBe(100);
    expect(pathLength([{ x: 10, y: 10 }])).toBe(0);
  });
});

describe('metricValues', () => {
  it('computes raw values with formatting metadata for every metric', () => {
    const values = metricValues(DND5E_METRIC_PRESET, 3);
    expect(values).toEqual([
      { perCell: 5, suffix: ' ft', precision: 1, value: 15 },
      { perCell: 1.5, suffix: ' m', precision: 1, value: 4.5 },
    ]);
  });
});

describe('buildMeasurePayload', () => {
  const gridSize = 50;

  it('builds the event payload with metrics and the exact ruler label', () => {
    const options = resolveMeasureOptions({ metrics: DND5E_METRIC_PRESET.metrics.map((metric) => ({ ...metric })) });
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 150 },
    ];
    const payload = buildMeasurePayload(options, points, gridSize);
    expect(payload).toMatchObject({
      pixels: 300,
      units: 6,
      x1: 0,
      y1: 0,
      x2: 150,
      y2: 150,
      segments: 2,
      label: '30 ft · 9 m',
    });
    expect(payload.metrics).toEqual([
      { perCell: 5, suffix: ' ft', precision: 1, value: 30 },
      { perCell: 1.5, suffix: ' m', precision: 1, value: 9 },
    ]);
  });

  it('defaults to the legacy single-unit payload shape', () => {
    const payload = buildMeasurePayload(MEASURE_TOOL_DEFAULTS, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ], gridSize);
    expect(payload.units).toBe(2);
    expect(payload.segments).toBe(1);
    expect(payload.label).toBe('2 u');
    expect(payload.metrics).toEqual([{ perCell: 1, suffix: ' u', precision: 1, value: 2 }]);
  });
});

describe('resolveMeasureOptions', () => {
  it('falls back to defaults on invalid input', () => {
    for (const raw of [undefined, null, {}, { metrics: [] }, { metrics: 'ft' }, 42]) {
      expect(resolveMeasureOptions(raw)).toEqual(MEASURE_TOOL_DEFAULTS);
    }
  });

  it('applies schema defaults to partial metrics', () => {
    const options = resolveMeasureOptions({ metrics: [{ perCell: 5 }] });
    expect(options.metrics).toEqual([{ perCell: 5, suffix: ' u', precision: 1 }]);
    expect(options.separator).toBe(' · ');
  });

  it('keeps valid custom options', () => {
    const options = resolveMeasureOptions({
      metrics: [
        { perCell: 5, suffix: ' ft' },
        { perCell: 1.5, suffix: ' m', precision: 2 },
      ],
      separator: ' | ',
    });
    expect(options.metrics).toHaveLength(2);
    expect(options.metrics[1].precision).toBe(2);
    expect(options.separator).toBe(' | ');
  });
});
