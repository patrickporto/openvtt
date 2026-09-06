import { describe, expect, it } from 'bun:test';
import { defineRangePreset, defineRangeTheme, parseRangePreset } from '../src/schemas';
import { BUILTIN_PRESETS, BUILTIN_THEMES } from '../src/index';

describe('defineRangePreset', () => {
  it('accepts shorthand numeric rings', () => {
    const preset = defineRangePreset({ id: 'x', rings: [1, 2, 3] });
    expect(preset.rings).toEqual([1, 2, 3]);
    expect(preset.unit).toEqual({ perCell: 1, suffix: ' u' });
  });

  it('keeps custom ring metadata', () => {
    const preset = defineRangePreset({
      id: 'x',
      unit: { perCell: 5, suffix: ' ft' },
      rings: [30, { distance: 60, label: 'long', color: '#ff0000', emphasis: true }],
    });
    expect(preset.rings).toHaveLength(2);
    expect(preset.rings[1]).toEqual({ distance: 60, label: 'long', color: '#ff0000', emphasis: true });
  });

  it('rejects empty ring lists', () => {
    expect(() => defineRangePreset({ id: 'x', rings: [] })).toThrow();
  });

  it('rejects non-positive distances', () => {
    expect(() => defineRangePreset({ id: 'x', rings: [0] })).toThrow();
    expect(() => defineRangePreset({ id: 'x', rings: [{ distance: 0.01 }] })).toThrow();
  });

  it('rejects invalid theme color overrides', () => {
    expect(() => defineRangePreset({ id: 'x', rings: [{ distance: 1, color: '#f' }] })).toThrow();
  });

  it('freezes the preset and its rings', () => {
    const preset = defineRangePreset({ id: 'x', rings: [1] });
    expect(Object.isFrozen(preset)).toBe(true);
    expect(Object.isFrozen(preset.rings)).toBe(true);
  });
});

describe('parseRangePreset', () => {
  it('applies unit defaults', () => {
    const preset = parseRangePreset({ id: 'x', rings: [2] });
    expect(preset.unit.perCell).toBe(1);
    expect(preset.unit.suffix).toBe(' u');
  });

  it('rejects non-uuid-agnostic bad ids', () => {
    expect(() => parseRangePreset({ id: '', rings: [1] })).toThrow();
  });
});

describe('defineRangeTheme', () => {
  it('requires at least one color', () => {
    expect(() => defineRangeTheme({ id: 't', colors: [] })).toThrow();
  });

  it('accepts valid palettes and freezes them', () => {
    const theme = defineRangeTheme({ id: 't', colors: ['#38bdf8'] });
    expect(Object.isFrozen(theme)).toBe(true);
    expect(theme.colors).toEqual(['#38bdf8']);
  });
});

describe('built-ins', () => {
  it('ships unique preset ids', () => {
    const ids = BUILTIN_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships unique theme ids', () => {
    const ids = BUILTIN_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
