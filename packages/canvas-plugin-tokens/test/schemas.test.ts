import { describe, expect, it } from 'bun:test';
import { parseToken } from '../src/schemas';

describe('parseToken', () => {
  it('applies defaults', () => {
    const token = parseToken({ x: 1, y: 2 });
    expect(token.size).toBe(1);
    expect(token.rotation).toBe(0);
    expect(token.hidden).toBe(false);
    expect(token.visionRadius).toBe(0);
  });

  it('accepts a valid uuid v7 id', () => {
    const id = '01957f3a-9b6c-7e1a-9f3c-2c4e6c8e0a02';
    expect(parseToken({ id, x: 0, y: 0 }).id).toBe(id);
  });

  it('rejects a non-uuid id', () => {
    expect(() => parseToken({ id: 'not-a-uuid', x: 0, y: 0 })).toThrow();
  });

  it('rejects non-positive size', () => {
    expect(() => parseToken({ x: 0, y: 0, size: 0 })).toThrow();
  });
});
