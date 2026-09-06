import { describe, expect, it } from 'bun:test';
import {
  colorToNumber,
  hsvToRgb,
  interpolateColor,
  isHexColor,
  normalizeTrackerColor,
  parseHexColor,
  rgbToHsv,
  rgbToHex,
} from '../src/color';

describe('parseHexColor', () => {
  it('accepts #rrggbb, rrggbb and #rgb forms', () => {
    expect(parseHexColor('#30a46c')).toEqual({ r: 0x30, g: 0xa4, b: 0x6c });
    expect(parseHexColor('30a46c')).toEqual({ r: 0x30, g: 0xa4, b: 0x6c });
    expect(parseHexColor('#f0c')).toEqual({ r: 0xff, g: 0x00, b: 0xcc });
  });

  it('rejects invalid colors', () => {
    expect(parseHexColor('red')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('')).toBeNull();
  });

  it('round-trips through rgbToHex', () => {
    expect(rgbToHex(parseHexColor('#e5484d')!)).toBe('#e5484d');
  });
});

describe('rgbToHsv / hsvToRgb', () => {
  it('pure hues are stable', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    const green = rgbToHsv({ r: 0, g: 255, b: 0 });
    expect(green.h).toBeCloseTo(120);
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 });
  });
});

describe('interpolateColor', () => {
  it('returns endpoints exactly at t=0 and t=1', () => {
    expect(interpolateColor('#e5484d', '#30a46c', 0)).toBe('#e5484d');
    expect(interpolateColor('#e5484d', '#30a46c', 1)).toBe('#30a46c');
  });

  it('green → red midpoint passes through yellow (HSV hue path)', () => {
    const mid = interpolateColor('#30a46c', '#e5484d', 0.5);
    const hsv = rgbToHsv(parseHexColor(mid)!);
    expect(hsv.h).toBeGreaterThan(30);
    expect(hsv.h).toBeLessThan(90);
  });

  it('clamps t outside [0, 1]', () => {
    expect(interpolateColor('#e5484d', '#30a46c', -2)).toBe('#e5484d');
    expect(interpolateColor('#e5484d', '#30a46c', 5)).toBe('#30a46c');
  });
});

describe('colorToNumber', () => {
  it('converts to 0xRRGGBB', () => {
    expect(colorToNumber('#30a46c')).toBe(0x30a46c);
    expect(colorToNumber('nope')).toBe(0xffffff);
  });
});

describe('normalizeTrackerColor', () => {
  it('expands single color to min/max pair', () => {
    expect(normalizeTrackerColor('#7cc4ff', 'counter')).toEqual({ min: '#7cc4ff', max: '#7cc4ff' });
    expect(normalizeTrackerColor('#7cc4ff', 'bar')).toEqual({ min: '#7cc4ff', max: '#7cc4ff' });
  });

  it('keeps explicit min/max pairs', () => {
    expect(normalizeTrackerColor({ min: '#e5484d', max: '#30a46c' }, 'bar')).toEqual({
      min: '#e5484d',
      max: '#30a46c',
    });
  });

  it('falls back to defaults per kind', () => {
    const bar = normalizeTrackerColor(undefined, 'bar');
    const counter = normalizeTrackerColor(undefined, 'counter');
    expect(bar.min).not.toBe(bar.max);
    expect(counter.min).toBe(counter.max);
    expect(isHexColor(bar.min) && isHexColor(counter.max)).toBe(true);
  });

  it('falls back when colors are invalid', () => {
    expect(normalizeTrackerColor('not-a-color', 'bar').min).toBe('#e5484d');
    expect(normalizeTrackerColor({ min: 'xx', max: '#30a46c' }, 'bar')).toEqual({
      min: '#e5484d',
      max: '#30a46c',
    });
  });
});
