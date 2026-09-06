import { describe, expect, it } from 'bun:test';
import { defineMeasureMetrics } from '../src/schemas';
import { CELLS_PRESET, DND5E_METRIC_PRESET, DND5E_PRESET, MEASURE_METRIC_PRESETS, METRIC_PRESET } from '../src/presets';

describe('defineMeasureMetrics', () => {
  it('normalizes defaults and freezes the result', () => {
    const metrics = defineMeasureMetrics([{ perCell: 2 }]);
    expect(metrics).toEqual([{ perCell: 2, suffix: ' u', precision: 1 }]);
    expect(Object.isFrozen(metrics)).toBe(true);
    expect(Object.isFrozen(metrics[0])).toBe(true);
  });

  it('rejects an empty metric list', () => {
    expect(() => defineMeasureMetrics([])).toThrow();
  });

  it('rejects invalid factors and precision', () => {
    expect(() => defineMeasureMetrics([{ perCell: 0 }])).toThrow();
    expect(() => defineMeasureMetrics([{ perCell: -5 }])).toThrow();
    expect(() => defineMeasureMetrics([{ perCell: 1, precision: 1.5 }])).toThrow();
    expect(() => defineMeasureMetrics([{ perCell: 1, precision: 7 }])).toThrow();
  });
});

describe('MEASURE_METRIC_PRESETS', () => {
  it('exposes the built-in metric sets', () => {
    const keys = Object.keys(MEASURE_METRIC_PRESETS);
    expect(keys).toHaveLength(4);
    expect(keys).toEqual(expect.arrayContaining(['cells', 'dnd5e', 'metric', 'dnd5e-metric']));
    expect(CELLS_PRESET.metrics).toEqual([{ perCell: 1, suffix: ' u', precision: 1 }]);
    expect(DND5E_PRESET.metrics[0].perCell).toBe(5);
    expect(METRIC_PRESET.metrics[0].perCell).toBe(1.5);
  });

  it('pairs feet and meters in the dual preset', () => {
    expect(DND5E_METRIC_PRESET.metrics).toEqual([
      { perCell: 5, suffix: ' ft', precision: 1 },
      { perCell: 1.5, suffix: ' m', precision: 1 },
    ]);
  });
});
