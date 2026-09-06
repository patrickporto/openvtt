import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { MapDataSchema } from '../src/schemas';

describe('MapDataSchema', () => {
  it('normalizes a string source to the image variant and defaults alpha', () => {
    const map = v.parse(MapDataSchema, { x: 0, y: 0, source: 'maps/castle.webp' });
    expect(map.source).toEqual({ type: 'image', src: 'maps/castle.webp' });
    expect(map.alpha).toBe(1);
    expect(map.id).toBeUndefined();
  });

  it('accepts a tiled source with tile/min-level defaults', () => {
    const map = v.parse(MapDataSchema, {
      x: 10,
      y: 20,
      source: { type: 'tiled', url: 'https://tiles.example/{z}/{x}/{y}.png', maxLevel: 5, width: 16384, height: 9216 },
    });
    expect(map.source).toMatchObject({ tileSize: 256, minLevel: 0, maxLevel: 5 });
  });

  it('rejects invalid alpha, sizes and sources', () => {
    expect(() => v.parse(MapDataSchema, { x: 0, y: 0, alpha: 2, source: 'a.png' })).toThrow();
    expect(() => v.parse(MapDataSchema, { x: 0, y: 0, width: 0, source: 'a.png' })).toThrow();
    expect(() => v.parse(MapDataSchema, { x: 0, y: 0, source: { type: 'tiled', url: 'u' } })).toThrow();
  });
});
