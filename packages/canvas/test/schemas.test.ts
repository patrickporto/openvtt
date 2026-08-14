import { describe, expect, it } from 'bun:test';
import { parseScene } from '../src/schemas';

describe('parseScene', () => {
  it('fills defaults for a minimal scene', () => {
    const scene = parseScene({ width: 1000, height: 800 });
    expect(scene.width).toBe(1000);
    expect(scene.grid).toBeUndefined();
    expect(scene.padding).toBe(0);
    expect(scene.documents).toBeUndefined();
  });

  it('rejects non-positive dimensions', () => {
    expect(() => parseScene({ width: 0, height: 10 })).toThrow();
  });

  it('keeps grid and documents map', () => {
    const scene = parseScene({
      width: 500,
      height: 500,
      grid: { type: 'hex-vertical', size: 40 },
      documents: { token: [{ x: 10, y: 20 }] },
    });
    expect(scene.grid?.type).toBe('hex-vertical');
    expect(scene.documents?.token?.length).toBe(1);
  });

  it('preserves unknown plugin keys (loose scene)', () => {
    const scene = parseScene({
      width: 500,
      height: 500,
      customStuff: [{ id: 'abc' }],
    });
    expect((scene as Record<string, unknown>).customStuff).toEqual([{ id: 'abc' }]);
  });
});
