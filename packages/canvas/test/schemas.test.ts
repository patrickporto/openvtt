import { describe, expect, it } from 'bun:test';
import { parseScene, parseToken } from '../src/schemas';

describe('parseScene', () => {
  it('fills defaults for a minimal scene', () => {
    const scene = parseScene({ width: 1000, height: 800 });
    expect(scene.width).toBe(1000);
    expect(scene.grid).toBeUndefined();
    expect(scene.tokens).toEqual([]);
    expect(scene.tiles).toEqual([]);
    expect(scene.padding).toBe(0);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => parseScene({ width: 0, height: 10 })).toThrow();
  });

  it('keeps provided tokens and grid', () => {
    const scene = parseScene({
      width: 500,
      height: 500,
      grid: { type: 'hex-vertical', size: 40 },
      tokens: [{ x: 10, y: 20 }],
    });
    expect(scene.grid?.type).toBe('hex-vertical');
    expect(scene.tokens?.length).toBe(1);
    expect(scene.tokens?.[0].size).toBe(1);
  });
});

describe('parseToken', () => {
  it('applies default size of 1', () => {
    const token = parseToken({ x: 1, y: 2 });
    expect(token.size).toBe(1);
    expect(token.rotation).toBe(0);
    expect(token.hidden).toBe(false);
  });

  it('accepts a valid uuid v7 id', () => {
    const token = parseToken({ id: '01957f3a-9b6c-7e1a-9f3c-2c4e6c8e0a02', x: 0, y: 0 });
    expect(token.id).toBe('01957f3a-9b6c-7e1a-9f3c-2c4e6c8e0a02');
  });

  it('rejects a non-uuid id', () => {
    expect(() => parseToken({ id: 'not-a-uuid', x: 0, y: 0 })).toThrow();
  });
});
