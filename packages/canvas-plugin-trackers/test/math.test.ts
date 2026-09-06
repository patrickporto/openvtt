import { describe, expect, it } from 'bun:test';
import { applyMath, formatMath, parseMathInput } from '../src/math';

describe('parseMathInput', () => {
  it('parses subtraction', () => {
    expect(parseMathInput('-7')).toEqual({ ok: true, expression: { op: 'subtract', operand: 7 } });
  });

  it('parses addition', () => {
    expect(parseMathInput('+7')).toEqual({ ok: true, expression: { op: 'add', operand: 7 } });
  });

  it('parses explicit set with negative value', () => {
    expect(parseMathInput('=-7')).toEqual({ ok: true, expression: { op: 'set', operand: -7 } });
  });

  it('parses explicit set with positive value', () => {
    expect(parseMathInput('=7')).toEqual({ ok: true, expression: { op: 'set', operand: 7 } });
  });

  it('parses plain number as set', () => {
    expect(parseMathInput('42')).toEqual({ ok: true, expression: { op: 'set', operand: 42 } });
  });

  it('parses plain negative number as subtraction (Owl semantics)', () => {
    expect(parseMathInput('-3.5')).toEqual({ ok: true, expression: { op: 'subtract', operand: 3.5 } });
  });

  it('trims whitespace', () => {
    expect(parseMathInput('  +5 ')).toEqual({ ok: true, expression: { op: 'add', operand: 5 } });
  });

  it('rejects empty input', () => {
    expect(parseMathInput('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects bare operators', () => {
    expect(parseMathInput('+')).toEqual({ ok: false, error: 'malformed' });
    expect(parseMathInput('-')).toEqual({ ok: false, error: 'malformed' });
    expect(parseMathInput('=')).toEqual({ ok: false, error: 'malformed' });
  });

  it('rejects double signs', () => {
    expect(parseMathInput('+-7')).toEqual({ ok: false, error: 'malformed' });
    expect(parseMathInput('=-+7')).toEqual({ ok: false, error: 'malformed' });
  });

  it('rejects non-numeric input', () => {
    expect(parseMathInput('fireball')).toEqual({ ok: false, error: 'invalid-number' });
    expect(parseMathInput('=abc')).toEqual({ ok: false, error: 'invalid-number' });
  });

  it('rejects trailing garbage', () => {
    expect(parseMathInput('7 dmg')).toEqual({ ok: false, error: 'invalid-number' });
  });
});

describe('applyMath', () => {
  it('adds, subtracts and sets', () => {
    expect(applyMath(10, { op: 'add', operand: 5 })).toBe(15);
    expect(applyMath(10, { op: 'subtract', operand: 3 })).toBe(7);
    expect(applyMath(10, { op: 'set', operand: -4 })).toBe(-4);
  });

  it('supports fractional operands', () => {
    expect(applyMath(10.5, { op: 'subtract', operand: 0.5 })).toBe(10);
  });
});

describe('formatMath', () => {
  it('round-trips through parse', () => {
    for (const input of ['+7', '-7', '=7', '=-7', '3.5']) {
      const parsed = parseMathInput(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parseMathInput(formatMath(parsed.expression))).toEqual(parsed);
    }
  });
});
