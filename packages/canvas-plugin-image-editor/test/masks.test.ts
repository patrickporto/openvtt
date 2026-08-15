import { describe, expect, it } from 'bun:test';
import {
  MaskRegistry,
  hexHorizontalVertices,
  hexVerticalVertices,
  maskFrom,
  pathMask,
  polygonMask,
  imageMasks,
} from '../src/masks';

describe('MaskRegistry', () => {
  it('ships the builtins', () => {
    const ids = imageMasks.list().map((m) => m.id);
    expect(ids).toEqual(['circle', 'square', 'rounded', 'hex-vertical', 'hex-horizontal']);
  });

  it('registers custom masks and rejects empty ids', () => {
    const registry = new MaskRegistry([]);
    const star = polygonMask('star', 'Star', [[0.5, 0], [1, 1], [0, 1]]);
    registry.register(star);
    expect(registry.get('star')).toBe(star);
    expect(registry.list().map((m) => m.id)).toEqual(['star']);
    expect(() => registry.register({ id: '', label: 'x' })).toThrow();
  });

  it('resolve falls back to circle for unknown ids', () => {
    expect(imageMasks.resolve('does-not-exist').id).toBe('circle');
    const custom = polygonMask('c', 'C', [[0, 0], [1, 1]]);
    expect(imageMasks.resolve(custom)).toBe(custom);
  });
});

describe('hex vertices', () => {
  it('hex-vertical is pointy-top (top vertex at x=0.5)', () => {
    const vertices = hexVerticalVertices();
    expect(vertices).toHaveLength(6);
    expect(vertices[0][0]).toBe(0.5);
    expect(vertices[0][1]).toBe(0);
  });

  it('hex-horizontal is flat-top (left/right vertices at y=0.5)', () => {
    const vertices = hexHorizontalVertices();
    expect(vertices).toHaveLength(6);
    expect(vertices[2][1]).toBeCloseTo(0.5);
    expect(vertices[5][1]).toBeCloseTo(0.5);
    expect(vertices[2][0]).toBeCloseTo(1);
    expect(vertices[5][0]).toBeCloseTo(0);
  });

  it('all vertices stay inside the 0..1 box', () => {
    for (const [x, y] of [...hexVerticalVertices(), ...hexHorizontalVertices()]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});

describe('mask factories', () => {
  it('polygonMask exposes polygon + path builder', () => {
    const shape = polygonMask('tri', 'Tri', [[0.5, 0], [1, 1], [0, 1]]);
    expect(shape.polygon).toHaveLength(3);
    expect(typeof shape.path).toBe('function');
  });

  it('pathMask wraps a custom factory', () => {
    const factory = (size: number) => ({ size });
    const shape = pathMask('custom', 'Custom', factory as never);
    expect(shape.path?.(10)).toEqual({ size: 10 });
  });

  it('maskFrom helper builds path from polygon when omitted', () => {
    const shape = maskFrom('poly', 'Poly', [[0, 0], [1, 0], [1, 1]]);
    expect(typeof shape.path).toBe('function');
  });
});
