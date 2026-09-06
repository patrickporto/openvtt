import * as v from 'valibot';
import { describe, expect, it } from 'bun:test';
import { SoundDataSchema, SoundSourceSchema } from '../src/schemas';

describe('SoundDataSchema', () => {
  it('aplica defaults', () => {
    const doc = v.parse(SoundDataSchema, { x: 10, y: 20, src: 'a.mp3' });
    expect(doc).toMatchObject({
      radius: 4,
      volume: 1,
      channel: 'ambient',
      loop: true,
      playing: true,
      global: false,
    });
  });

  it('rejeita volume e radius inválidos', () => {
    expect(() => v.parse(SoundDataSchema, { x: 0, y: 0, src: 'a.mp3', volume: 2 })).toThrow();
    expect(() => v.parse(SoundDataSchema, { x: 0, y: 0, src: 'a.mp3', radius: -1 })).toThrow();
  });

  it('aceita múltiplas fontes', () => {
    const doc = v.parse(SoundDataSchema, { x: 0, y: 0, src: ['a.ogg', 'a.mp3'] });
    expect(doc.src).toEqual(['a.ogg', 'a.mp3']);
  });
});

describe('SoundSourceSchema', () => {
  it('exige key, x, y e src', () => {
    expect(() => v.parse(SoundSourceSchema, { x: 0, y: 0 })).toThrow();
    const source = v.parse(SoundSourceSchema, { key: 'k', x: 1, y: 2, src: 'a.mp3' });
    expect(source).toMatchObject({ radius: 4, playing: true });
  });
});
