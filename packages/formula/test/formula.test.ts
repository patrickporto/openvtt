import { describe, expect, it } from 'bun:test';
import {
  evaluateFormula,
  extractVariables,
  FormulaError,
  parseFormula,
  toFormula,
} from '../src';

describe('parseFormula — literals & arithmetic', () => {
  it('parses a number', () => {
    expect(parseFormula('42')).toBe(42);
    expect(parseFormula('3.5')).toBe(3.5);
  });

  it('parses booleans', () => {
    expect(parseFormula('true')).toBe(true);
    expect(parseFormula('false')).toBe(false);
  });

  it('parses arithmetic with precedence', () => {
    expect(parseFormula('1 + 2 * 3')).toEqual({ '+': [1, { '*': [2, 3] }] });
    expect(parseFormula('(1 + 2) * 3')).toEqual({ '*': [{ '+': [1, 2] }, 3] });
  });

  it('parses unary minus', () => {
    expect(parseFormula('-5')).toEqual({ '-': [5] });
    expect(parseFormula('-(a + b)')).toEqual({ '-': [{ '+': [{ var: 'a' }, { var: 'b' }] }] });
  });

  it('parses modulo', () => {
    expect(parseFormula('10 % 3')).toEqual({ '%': [10, 3] });
  });
});

describe('parseFormula — comparison & logic', () => {
  it('parses comparisons', () => {
    expect(parseFormula('a >= 10')).toEqual({ '>=': [{ var: 'a' }, 10] });
    expect(parseFormula('a == b')).toEqual({ '==': [{ var: 'a' }, { var: 'b' }] });
  });

  it('parses symbolic logical operators', () => {
    expect(parseFormula('a && b')).toEqual({ and: [{ var: 'a' }, { var: 'b' }] });
    expect(parseFormula('a || b')).toEqual({ or: [{ var: 'a' }, { var: 'b' }] });
    expect(parseFormula('!a')).toEqual({ '!': [{ var: 'a' }] });
  });

  it('parses word logical operators as aliases', () => {
    expect(parseFormula('a and b')).toEqual({ and: [{ var: 'a' }, { var: 'b' }] });
    expect(parseFormula('a or b')).toEqual({ or: [{ var: 'a' }, { var: 'b' }] });
    expect(parseFormula('not a')).toEqual({ '!': [{ var: 'a' }] });
  });

  it('does not treat word operators inside identifiers', () => {
    expect(parseFormula('android')).toEqual({ var: 'android' });
    expect(parseFormula('floor')).toEqual({ var: 'floor' });
    expect(parseFormula('color')).toEqual({ var: 'color' });
  });

  it('parses ternary', () => {
    expect(parseFormula('a ? b : c')).toEqual({
      if: [{ var: 'a' }, { var: 'b' }, { var: 'c' }],
    });
  });
});

describe('parseFormula — paths & calls', () => {
  it('parses dotted data paths', () => {
    expect(parseFormula('abilities.str.mod')).toEqual({ var: 'abilities.str.mod' });
  });

  it('parses function calls', () => {
    expect(parseFormula('floor((str - 10) / 2)')).toEqual({
      floor: [{ '/': [{ '-': [{ var: 'str' }, 10] }, 2] }],
    });
  });

  it('parses variadic calls', () => {
    expect(parseFormula('min(a, b, c)')).toEqual({
      min: [{ var: 'a' }, { var: 'b' }, { var: 'c' }],
    });
    expect(parseFormula('clamp(x, 1, 9)')).toEqual({
      clamp: [{ var: 'x' }, 1, 9],
    });
  });
});

describe('parseFormula — rejection', () => {
  it('rejects string literals', () => {
    expect(() => parseFormula('"hello"')).toThrow(FormulaError);
  });

  it('rejects unsupported binary operators', () => {
    expect(() => parseFormula('a | b')).toThrow(FormulaError);
    expect(() => parseFormula('a === b')).toThrow(FormulaError);
  });

  it('rejects unknown functions', () => {
    expect(() => parseFormula('eval(x)')).toThrow(/Unknown function/);
  });

  it('rejects computed member access', () => {
    expect(() => parseFormula('a[b]')).toThrow(FormulaError);
  });

  it('rejects multiple statements', () => {
    expect(() => parseFormula('a; b')).toThrow(/Multiple statements/);
  });
});

describe('parseFormula — positional errors', () => {
  it('reports the position of a parse error', () => {
    try {
      parseFormula('1 + * 2');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as FormulaError;
      expect(e).toBeInstanceOf(FormulaError);
      expect(typeof e.position).toBe('number');
      expect(e.position).toBe(4);
      expect(e.input).toBe('1 + * 2');
    }
  });

  it('translates position across a word-operator alias', () => {
    try {
      parseFormula('a and +');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as FormulaError;
      expect(e).toBeInstanceOf(FormulaError);
      expect(e.input).toBe('a and +');
      expect(e.position).toBe(6);
      expect(e.input![e.position!]).toBe('+');
    }
  });
});

describe('toFormula — serialization', () => {
  it('serializes literals', () => {
    expect(toFormula(42)).toBe('42');
    expect(toFormula(true)).toBe('true');
  });

  it('serializes arithmetic with minimal parens', () => {
    expect(toFormula({ '+': [1, { '*': [2, 3] }] })).toBe('1 + 2 * 3');
    expect(toFormula({ '*': [{ '+': [1, 2] }, 3] })).toBe('(1 + 2) * 3');
  });

  it('serializes unary minus', () => {
    expect(toFormula({ '-': [5] })).toBe('-5');
    expect(toFormula({ '-': [{ '+': [1, 2] }] })).toBe('-(1 + 2)');
  });

  it('serializes logic and ternary', () => {
    expect(toFormula({ and: [{ var: 'a' }, { var: 'b' }] })).toBe('a && b');
    expect(toFormula({ if: [{ var: 'a' }, 1, 2] })).toBe('a ? 1 : 2');
  });

  it('serializes paths and calls', () => {
    expect(toFormula({ var: 'a.b.c' })).toBe('a.b.c');
    expect(toFormula({ floor: [{ '/': [{ '-': [{ var: 'str' }, 10] }, 2] }] })).toBe(
      'floor((str - 10) / 2)',
    );
  });
});

describe('round-trip parse <-> toFormula', () => {
  const cases = [
    '1 + 2 * 3',
    '(1 + 2) * 3',
    'floor((str - 10) / 2)',
    'a && b || c',
    'x >= 10 ? 5 : 0',
    'clamp(mod, 1, 9)',
    '-a + b',
  ];

  for (const src of cases) {
    it(`round-trips "${src}"`, () => {
      const ir = parseFormula(src);
      const printed = toFormula(ir);
      expect(parseFormula(printed)).toEqual(ir);
    });
  }
});

describe('extractVariables', () => {
  it('extracts variables at compile time', () => {
    const ir = parseFormula('floor((str - 10) / 2) + abilities.cha.mod');
    expect(extractVariables(ir)).toEqual(['str', 'abilities.cha.mod']);
  });

  it('deduplicates', () => {
    const ir = parseFormula('str + str');
    expect(extractVariables(ir)).toEqual(['str']);
  });

  it('returns empty for literals only', () => {
    expect(extractVariables(parseFormula('1 + 2'))).toEqual([]);
  });
});

describe('evaluateFormula', () => {
  it('evaluates arithmetic', () => {
    expect(evaluateFormula(parseFormula('1 + 2 * 3'))).toBe(7);
    expect(evaluateFormula(parseFormula('(1 + 2) * 3'))).toBe(9);
    expect(evaluateFormula(parseFormula('10 % 3'))).toBe(1);
    expect(evaluateFormula(parseFormula('-5'))).toBe(-5);
  });

  it('evaluates functions', () => {
    expect(evaluateFormula(parseFormula('floor(7 / 2)'))).toBe(3);
    expect(evaluateFormula(parseFormula('min(3, 1, 2)'))).toBe(1);
    expect(evaluateFormula(parseFormula('clamp(20, 1, 9)'))).toBe(9);
    expect(evaluateFormula(parseFormula('abs(-4)'))).toBe(4);
  });

  it('evaluates comparisons and logic', () => {
    expect(evaluateFormula(parseFormula('3 > 2'))).toBe(true);
    expect(evaluateFormula(parseFormula('a && b'), { scope: { a: true, b: false } })).toBe(false);
    expect(evaluateFormula(parseFormula('a or b'), { scope: { a: false, b: 1 } })).toBe(true);
    expect(evaluateFormula(parseFormula('not a'), { scope: { a: 0 } })).toBe(true);
  });

  it('evaluates ternary', () => {
    expect(
      evaluateFormula(parseFormula('a ? 1 : 0'), { scope: { a: true } }),
    ).toBe(1);
  });

  it('resolves dotted paths from scope', () => {
    expect(
      evaluateFormula(parseFormula('floor((str - 10) / 2)'), {
        scope: { str: 16 },
      }),
    ).toBe(3);
    expect(
      evaluateFormula(parseFormula('abilities.str.mod'), {
        scope: { abilities: { str: { mod: 3 } } },
      }),
    ).toBe(3);
  });

  it('short-circuits and/or', () => {
    expect(
      evaluateFormula(parseFormula('a && (1 / 0 > 0)'), { scope: { a: false } }),
    ).toBe(false);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateFormula(parseFormula('1 / 0'))).toThrow(FormulaError);
  });

  it('delegates leaves to onLeaf', () => {
    type Leaf = { custom: [number] };
    const ir = { custom: [7] } as unknown as import('../src').FormulaExpr<Leaf>;
    expect(
      evaluateFormula<Leaf>(ir, { onLeaf: (l) => (l as { custom: [number] }).custom[0]! * 2 }),
    ).toBe(14);
  });
});
