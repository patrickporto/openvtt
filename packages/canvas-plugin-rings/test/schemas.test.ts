import { describe, expect, it } from 'bun:test';
import { parseRing } from '../src/schemas';

describe('parseRing', () => {
  it('applies defaults', () => {
    const ring = parseRing({ tokenId: 'token-1' });
    expect(ring.order).toBe(0);
    expect(ring.id).toBeUndefined();
    expect(ring.preset).toBeUndefined();
    expect(ring.label).toBeUndefined();
    expect(ring.style.color).toBe('#1a6aff');
    expect(ring.style.width).toBe(3);
    expect(ring.style.alpha).toBe(1);
    expect(ring.style.shape).toBe('circle');
    expect(ring.style.dash).toEqual([]);
    expect(ring.style.pulse).toBe(false);
    expect(ring.style.glow).toBe(false);
  });

  it('accepts a valid uuid v7 id', () => {
    const id = '0192a7f0-5f8e-7abc-8def-0123456789ab';
    expect(parseRing({ id, tokenId: 'token-1' }).id).toBe(id);
  });

  it('rejects a non-uuid id', () => {
    expect(() => parseRing({ id: 'not-a-uuid', tokenId: 'token-1' })).toThrow();
  });

  it('rejects invalid colors', () => {
    expect(() => parseRing({ tokenId: 'token-1', style: { color: 'red' } })).toThrow();
    expect(() => parseRing({ tokenId: 'token-1', style: { color: '123456' } })).toThrow();
    expect(() => parseRing({ tokenId: 'token-1', style: { color: '#gggggg' } })).toThrow();
    expect(() => parseRing({ tokenId: 'token-1', style: { color: '#abcd' } })).toThrow();
  });

  it('accepts 3-digit hex colors', () => {
    expect(parseRing({ tokenId: 'token-1', style: { color: '#abc' } }).style.color).toBe('#abc');
  });

  it('rejects negative dash lengths and accepts zeros', () => {
    expect(() => parseRing({ tokenId: 'token-1', style: { dash: [4, -1] } })).toThrow();
    expect(parseRing({ tokenId: 'token-1', style: { dash: [0, 4] } }).style.dash).toEqual([0, 4]);
  });

  it('rejects alpha out of range', () => {
    expect(() => parseRing({ tokenId: 'token-1', style: { alpha: 1.5 } })).toThrow();
    expect(() => parseRing({ tokenId: 'token-1', style: { alpha: -0.1 } })).toThrow();
  });

  it('rejects width below minimum', () => {
    expect(() => parseRing({ tokenId: 'token-1', style: { width: 0.1 } })).toThrow();
  });

  it('rejects an empty tokenId', () => {
    expect(() => parseRing({ tokenId: '' })).toThrow();
  });

  it('strips unknown keys', () => {
    const ring = parseRing({ tokenId: 'token-1', extra: 'nope' });
    expect('extra' in ring).toBe(false);
  });

  it('rejects a bad shape', () => {
    expect(() => parseRing({ tokenId: 'token-1', style: { shape: 'triangle' } })).toThrow();
  });

  it('merges partial style overrides with defaults', () => {
    const ring = parseRing({ tokenId: 'token-1', style: { color: '#ff4d4d', width: 5 } });
    expect(ring.style.color).toBe('#ff4d4d');
    expect(ring.style.width).toBe(5);
    expect(ring.style.alpha).toBe(1);
    expect(ring.style.shape).toBe('circle');
    expect(ring.style.dash).toEqual([]);
    expect(ring.style.pulse).toBe(false);
    expect(ring.style.glow).toBe(false);
  });
});
