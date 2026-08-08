import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import { fromFormula, NotationError, toFormula } from '../src';

describe('fromFormula — dice terms', () => {
  it('parses a basic die', () => {
    expect(fromFormula('2d6')).toEqual({
      type: 'die',
      count: 2,
      faces: { kind: 'number', value: 6 },
    });
  });

  it('parses implicit count (1d)', () => {
    expect(fromFormula('d20')).toEqual({
      type: 'die',
      count: 1,
      faces: { kind: 'number', value: 20 },
    });
  });

  it('parses percentile, fate, coin', () => {
    expect(fromFormula('1d%').faces).toEqual({ kind: 'percentile' });
    expect(fromFormula('4dF').faces).toEqual({ kind: 'fate' });
    expect(fromFormula('2dcoin').faces).toEqual({ kind: 'coin' });
  });

  it('parses dynamic count and faces', () => {
    expect(fromFormula('(1+1)d(8)')).toEqual({
      type: 'die',
      count: { '+': [1, 1] },
      faces: { kind: 'expr', value: 8 },
    });
  });
});

describe('fromFormula — modifiers (canonical names)', () => {
  it('parses keep/drop with count', () => {
    expect(fromFormula('4d6keep-highest3').modifiers).toEqual([
      { op: 'keep-highest', count: 3 },
    ]);
    expect(fromFormula('4d6drop-lowest').modifiers).toEqual([{ op: 'drop-lowest' }]);
  });

  it('parses reroll with comparison', () => {
    expect(fromFormula('2d6reroll-once<=2').modifiers).toEqual([
      { op: 'reroll-once', compare: { op: '<=', value: 2 } },
    ]);
    expect(fromFormula('2d6reroll-recursive').modifiers).toEqual([{ op: 'reroll-recursive' }]);
  });

  it('parses explode variants', () => {
    expect(fromFormula('1d6explode').modifiers).toEqual([{ op: 'explode' }]);
    expect(fromFormula('1d6explode-once').modifiers).toEqual([{ op: 'explode-once' }]);
    expect(fromFormula('1d6explode-compound').modifiers).toEqual([{ op: 'explode-compound' }]);
  });

  it('parses count-success with comparison', () => {
    expect(fromFormula('4d10count-success>=8').modifiers).toEqual([
      { op: 'count-success', compare: { op: '>=', value: 8 } },
    ]);
  });

  it('parses clamp and sort and margin', () => {
    expect(fromFormula('3d6min2').modifiers).toEqual([{ op: 'min', value: 2 }]);
    expect(fromFormula('3d6max8').modifiers).toEqual([{ op: 'max', value: 8 }]);
    expect(fromFormula('3d6sort-asc').modifiers).toEqual([{ op: 'sort-asc' }]);
    expect(fromFormula('1d20margin-success10').modifiers).toEqual([
      { op: 'margin-success', target: 10 },
    ]);
  });
});

describe('fromFormula — sigil aliases (safe)', () => {
  it('maps sigils to canonical IR names', () => {
    expect(fromFormula('4d6kh3').modifiers).toEqual([{ op: 'keep-highest', count: 3 }]);
    expect(fromFormula('4d6kl').modifiers).toEqual([{ op: 'keep-lowest' }]);
    expect(fromFormula('1d6!').modifiers).toEqual([{ op: 'explode' }]);
    expect(fromFormula('1d6!!').modifiers).toEqual([{ op: 'explode-compound' }]);
    expect(fromFormula('4d10cs>=8').modifiers).toEqual([
      { op: 'count-success', compare: { op: '>=', value: 8 } },
    ]);
  });
});

describe('fromFormula — rejects ambiguous aliases', () => {
  it('rejects r/rr/ro/k/d/s', () => {
    expect(() => fromFormula('2d6r')).toThrow(NotationError);
    expect(() => fromFormula('2d6rr')).toThrow(NotationError);
    expect(() => fromFormula('2d6k1')).toThrow(NotationError);
  });
});

describe('fromFormula — pools, functions, paths, arithmetic', () => {
  it('parses a pool with modifiers', () => {
    expect(fromFormula('{2d6, 1d8}keep-highest2')).toEqual({
      type: 'pool',
      entries: [
        { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
        { type: 'die', count: 1, faces: { kind: 'number', value: 8 } },
      ],
      modifiers: [{ op: 'keep-highest', count: 2 }],
    });
  });

  it('parses arithmetic over dice', () => {
    expect(fromFormula('2d6 + 1d4')).toEqual({
      '+': [
        { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
        { type: 'die', count: 1, faces: { kind: 'number', value: 4 } },
      ],
    });
  });

  it('respects precedence', () => {
    expect(fromFormula('2d6 + 3 * 4')).toEqual({
      '+': [
        { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
        { '*': [3, 4] },
      ],
    });
  });

  it('parses function calls and data paths', () => {
    expect(fromFormula('floor((@str - 10) / 2)')).toEqual({
      floor: [{ '/': [{ '-': [{ var: 'str' }, 10] }, 2] }],
    });
  });

  it('parses nested data paths', () => {
    expect(fromFormula('@abilities.str.mod')).toEqual({ var: 'abilities.str.mod' });
  });

  it('strips comments', () => {
    expect(fromFormula('2d6 # attack roll')).toEqual({
      type: 'die',
      count: 2,
      faces: { kind: 'number', value: 6 },
    });
  });
});

describe('fromFormula — errors with position', () => {
  it('reports unexpected tokens', () => {
    try {
      fromFormula('2d6 + @');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as NotationError;
      expect(e).toBeInstanceOf(NotationError);
      expect(typeof e.position).toBe('number');
      expect(e.input).toBe('2d6 + @');
    }
  });

  it('reports missing faces', () => {
    expect(() => fromFormula('2d')).toThrow(/faces/i);
  });
});

describe('toFormula — serialization', () => {
  it('serializes dice with canonical names', () => {
    expect(toFormula(fromFormula('4d6keep-highest3'))).toBe('4d6keep-highest3');
    expect(toFormula(fromFormula('1d6explode'))).toBe('1d6explode');
  });

  it('serializes faces', () => {
    expect(toFormula(fromFormula('1d%'))).toBe('1d%');
    expect(toFormula(fromFormula('4dF'))).toBe('4dF');
  });

  it('serializes pools and arithmetic', () => {
    expect(toFormula(fromFormula('{2d6, 1d8}keep-highest2'))).toBe('{2d6, 1d8}keep-highest2');
    expect(toFormula(fromFormula('2d6 + 3 * 4'))).toBe('2d6 + 3 * 4');
  });

  it('serializes data paths with @', () => {
    expect(toFormula(fromFormula('floor((@str - 10) / 2)'))).toBe('floor((@str - 10) / 2)');
  });
});

describe('round-trip parse <-> toFormula', () => {
  const cases = [
    '2d6',
    '4d6keep-highest3',
    '1d6explode',
    '1d6explode-compound',
    '2d6reroll-once<=2',
    '4d10count-success>=8',
    '{2d6, 1d8}keep-highest2',
    '2d6 + floor((@str - 10) / 2)',
    '1d20margin-success10',
    '3d6min2',
  ];

  for (const src of cases) {
    it(`round-trips "${src}"`, () => {
      const ir = fromFormula(src);
      const printed = toFormula(ir);
      expect(fromFormula(printed)).toEqual(ir);
    });
  }
});

describe('notation → dice-core evaluateRoll', () => {
  it('parses then evaluates a keep-highest roll', () => {
    const ir = fromFormula('4d6keep-highest3');
    let seed = 0;
    const rng = () => {
      seed = (seed + 1) % 4;
      return seed / 4;
    };
    const result = evaluateRoll(ir, { rng });
    expect(result.rolls.filter((d) => d.kept)).toHaveLength(3);
    expect(typeof result.value).toBe('number');
  });

  it('parses then evaluates count-success', () => {
    const ir = fromFormula('4d10count-success>=8');
    const result = evaluateRoll(ir, { rng: () => 0.85 });
    expect(result.value).toBe(4);
  });

  it('evaluates a full character formula', () => {
    const ir = fromFormula('1d20 + @abilities.str.mod');
    const result = evaluateRoll(ir, { rng: () => 0.95, scope: { abilities: { str: { mod: 3 } } } });
    expect(result.value).toBe(23);
  });
});
