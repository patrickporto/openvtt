import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { fromFormula } from '@openvtt/dice-notation';
import { rollSchema } from '../src';

describe('rollSchema (valibot)', () => {
  it('accepts a valid die term IR', () => {
    const ir = fromFormula('4d6keep-highest3 + floor((@str - 10) / 2)');
    const result = v.parse(rollSchema, ir);
    expect(result).toEqual(ir);
  });

  it('accepts a pool', () => {
    const ir = fromFormula('{2d6, 1d8}keep-highest2');
    expect(v.parse(rollSchema, ir)).toEqual(ir);
  });

  it('accepts a plain number', () => {
    expect(v.parse(rollSchema, 42)).toBe(42);
  });

  it('accepts a bare formula expression', () => {
    const ir = { '+': [1, 2] };
    expect(v.parse(rollSchema, ir)).toEqual(ir);
  });

  it('rejects an unknown modifier op', () => {
    const bad = { type: 'die', count: 2, faces: { kind: 'number', value: 6 }, modifiers: [{ op: 'bogus' }] };
    expect(() => v.parse(rollSchema, bad)).toThrow();
  });

  it('rejects an unknown node key', () => {
    expect(() => v.parse(rollSchema, { bogus: [1, 2] })).toThrow();
  });

  it('rejects extra keys on a die term', () => {
    const bad = { type: 'die', count: 2, faces: { kind: 'number', value: 6 }, sneaky: true };
    expect(() => v.parse(rollSchema, bad)).toThrow();
  });

  it('rejects a string literal (not in the grammar)', () => {
    expect(() => v.parse(rollSchema, 'hello')).toThrow();
  });
});
