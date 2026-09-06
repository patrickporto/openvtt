import { describe, expect, it } from 'bun:test';
import { containingRing, formatDistance, resolveRings, ringCells, trimNumber } from '../src/resolve';
import { DND5E_PRESET, METRIC_PRESET } from '../src/presets';
import { SPECTRUM_THEME } from '../src/themes';
import { defineRangePreset, defineRangeTheme } from '../src/schemas';

describe('trimNumber', () => {
  it('drops trailing zero decimals', () => {
    expect(trimNumber(30)).toBe('30');
    expect(trimNumber(1.5)).toBe('1.5');
    expect(trimNumber(2.999)).toBe('3');
  });
});

describe('ringCells', () => {
  it('converts game units to cells', () => {
    expect(ringCells(DND5E_PRESET, 30)).toBe(6);
    expect(ringCells(METRIC_PRESET, 9)).toBe(6);
  });
});

describe('formatDistance', () => {
  it('formats cell distances back into preset units', () => {
    expect(formatDistance(DND5E_PRESET, 6)).toBe('30 ft');
    expect(formatDistance(DND5E_PRESET, 1.5)).toBe('7.5 ft');
  });
});

describe('resolveRings', () => {
  it('resolves labels, colors and radii from a preset and theme', () => {
    const rings = resolveRings(DND5E_PRESET, SPECTRUM_THEME);
    expect(rings.map((ring) => ring.label)).toEqual(['5 ft', '30 ft', '60 ft', '90 ft', '120 ft']);
    expect(rings.map((ring) => ring.cells)).toEqual([1, 6, 12, 18, 24]);
    expect(rings[0].color).toBe(0x38bdf8);
    expect(rings[1].color).toBe(0x34d399);
  });

  it('cycles theme colors', () => {
    const preset = defineRangePreset({ id: 'x', rings: [1, 2, 3, 4, 5, 6] });
    const theme = defineRangeTheme({ id: 't', colors: ['#0000ff', '#00ff00'] });
    const rings = resolveRings(preset, theme);
    expect(rings[2].color).toBe(0x0000ff);
    expect(rings[5].color).toBe(0x00ff00);
  });

  it('honors custom ring colors, labels and emphasis', () => {
    const preset = defineRangePreset({
      id: 'x',
      unit: { perCell: 1, suffix: ' u' },
      rings: [{ distance: 2, label: 'near', color: '#123456', emphasis: true }],
    });
    const [ring] = resolveRings(preset, SPECTRUM_THEME);
    expect(ring.label).toBe('near');
    expect(ring.color).toBe(0x123456);
    expect(ring.emphasis).toBe(true);
  });

  it('sorts rings ascending and dedupes colliding radii', () => {
    const preset = defineRangePreset({ id: 'x', unit: { perCell: 5, suffix: ' ft' }, rings: [60, 10, 30] });
    const rings = resolveRings(preset, SPECTRUM_THEME);
    expect(rings.map((ring) => ring.cells)).toEqual([2, 6, 12]);
  });
});

describe('containingRing', () => {
  const rings = resolveRings(defineRangePreset({ id: 'x', rings: [1, 2, 3, 5] }), SPECTRUM_THEME);

  it('returns the innermost ring that contains the distance', () => {
    expect(containingRing(rings, 0.2)?.cells).toBe(1);
    expect(containingRing(rings, 2.4)?.cells).toBe(3);
    expect(containingRing(rings, 5)?.cells).toBe(5);
  });

  it('returns undefined beyond the outermost ring', () => {
    expect(containingRing(rings, 5.1)).toBeUndefined();
  });
});
