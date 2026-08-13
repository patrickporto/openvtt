import { describe, expect, it } from 'bun:test';
import { clamp, lerp, rectanglesIntersect, toHex } from '../src/utils';

describe('toHex', () => {
  it('passes numbers through', () => {
    expect(toHex(0xff6600)).toBe(0xff6600);
  });
  it('parses #rrggbb strings', () => {
    expect(toHex('#ff6600')).toBe(0xff6600);
  });
  it('expands #rgb shorthand', () => {
    expect(toHex('#f60')).toBe(0xff6600);
  });
  it('falls back to white for invalid input', () => {
    expect(toHex('not-a-color')).toBe(0xffffff);
  });
});

describe('clamp / lerp', () => {
  it('clamps within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it('interpolates', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('rectanglesIntersect', () => {
  it('detects overlap', () => {
    expect(rectanglesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });
  it('detects non-overlap', () => {
    expect(rectanglesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 5, height: 5 })).toBe(false);
  });
});
