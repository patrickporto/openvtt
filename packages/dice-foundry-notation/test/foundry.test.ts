import { describe, expect, it } from 'bun:test';
import { evaluateRoll, type Rng } from '@openvtt/dice-core';
import { FoundryNotationError, fromFormula, toFormula } from '../src';

function rngFromRolls(rolls: ReadonlyArray<readonly [number, number]>): Rng {
  const fracs = rolls.map(([value, sides]) => (value - 1) / sides);
  let i = 0;
  return () => {
    const f = fracs[i] ?? 0.999;
    i++;
    return f;
  };
}

describe('fromFormula — foundry dice terms', () => {
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
    expect(fromFormula('4df').faces).toEqual({ kind: 'fate' });
    expect(fromFormula('4dF').faces).toEqual({ kind: 'fate' });
    expect(fromFormula('2dc').faces).toEqual({ kind: 'coin' });
  });
});

describe('fromFormula — the r/rr collision (opposite of Roll20)', () => {
  it('maps r -> reroll-ONCE', () => {
    expect(fromFormula('2d6r1').modifiers).toEqual([
      { op: 'reroll-once', compare: { op: '=', value: 1 } },
    ]);
    expect(fromFormula('2d6r').modifiers).toEqual([{ op: 'reroll-once' }]);
  });

  it('maps rr -> reroll-RECURSIVE', () => {
    expect(fromFormula('2d6rr<=2').modifiers).toEqual([
      { op: 'reroll-recursive', compare: { op: '<=', value: 2 } },
    ]);
  });
});

describe('fromFormula — the df position ambiguity', () => {
  it('treats df in faces position as a FATE die', () => {
    expect(fromFormula('4df')).toEqual({
      type: 'die',
      count: 4,
      faces: { kind: 'fate' },
    });
  });

  it('treats df in modifier position as deduct-failure', () => {
    expect(fromFormula('4d6df').modifiers).toEqual([{ op: 'deduct-failure' }]);
  });
});

describe('fromFormula — keep/drop, explode, clamp, count', () => {
  it('parses keep/drop', () => {
    expect(fromFormula('4d6kh3').modifiers).toEqual([{ op: 'keep-highest', count: 3 }]);
    expect(fromFormula('4d6k').modifiers).toEqual([{ op: 'keep-highest' }]);
    expect(fromFormula('4d6dl').modifiers).toEqual([{ op: 'drop-lowest' }]);
    expect(fromFormula('4d6d').modifiers).toEqual([{ op: 'drop-lowest' }]);
  });

  it('parses explode variants', () => {
    expect(fromFormula('1d6x').modifiers).toEqual([{ op: 'explode' }]);
    expect(fromFormula('1d6xo').modifiers).toEqual([{ op: 'explode-once' }]);
    expect(fromFormula('1d6x>=5').modifiers).toEqual([
      { op: 'explode', compare: { op: '>=', value: 5 } },
    ]);
  });

  it('parses clamp and margin', () => {
    expect(fromFormula('3d6min2').modifiers).toEqual([{ op: 'min', value: 2 }]);
    expect(fromFormula('3d6max8').modifiers).toEqual([{ op: 'max', value: 8 }]);
    expect(fromFormula('1d20ms10').modifiers).toEqual([{ op: 'margin-success', target: 10 }]);
  });

  it('parses count-success / count-failure', () => {
    expect(fromFormula('4d10cs>=8').modifiers).toEqual([
      { op: 'count-success', compare: { op: '>=', value: 8 } },
    ]);
    expect(fromFormula('4d10cf<=3').modifiers).toEqual([
      { op: 'count-failure', compare: { op: '<=', value: 3 } },
    ]);
  });
});

describe('fromFormula — pools, functions, paths, arithmetic', () => {
  it('parses a pool with modifiers', () => {
    expect(fromFormula('{2d6, 1d8}kh2')).toEqual({
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

  it('parses function calls and @data paths', () => {
    expect(fromFormula('floor((@str - 10) / 2)')).toEqual({
      floor: [{ '/': [{ '-': [{ var: 'str' }, 10] }, 2] }],
    });
  });

  it('parses nested @data paths', () => {
    expect(fromFormula('@abilities.str.mod')).toEqual({ var: 'abilities.str.mod' });
  });
});

describe('fromFormula — errors', () => {
  it('reports unexpected tokens with position', () => {
    try {
      fromFormula('2d6 + @');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as FoundryNotationError;
      expect(e).toBeInstanceOf(FoundryNotationError);
      expect(typeof e.position).toBe('number');
      expect(e.input).toBe('2d6 + @');
    }
  });

  it('reports missing faces', () => {
    expect(() => fromFormula('2d')).toThrow(/faces/i);
  });
});

describe('toFormula — serialization (foundry sigils)', () => {
  it('serializes keep/drop and explode', () => {
    expect(toFormula(fromFormula('4d6kh3'))).toBe('4d6kh3');
    expect(toFormula(fromFormula('1d6x'))).toBe('1d6x');
    expect(toFormula(fromFormula('1d6xo'))).toBe('1d6xo');
  });

  it('serializes r/rr with bare-equals for = comparisons', () => {
    expect(toFormula(fromFormula('2d6r1'))).toBe('2d6r1');
    expect(toFormula(fromFormula('2d6rr<=2'))).toBe('2d6rr<=2');
  });

  it('serializes faces', () => {
    expect(toFormula(fromFormula('1d%'))).toBe('1d%');
    expect(toFormula(fromFormula('4df'))).toBe('4df');
    expect(toFormula(fromFormula('2dc'))).toBe('2dc');
  });

  it('serializes @data paths', () => {
    expect(toFormula(fromFormula('floor((@str - 10) / 2)'))).toBe('floor((@str - 10) / 2)');
  });
});

describe('round-trip parse <-> toFormula (IR equality)', () => {
  const cases = [
    '2d6',
    '4d6kh3',
    '1d6x',
    '1d6xo',
    '2d6r1',
    '2d6rr<=2',
    '4d10cs>=8',
    '{2d6, 1d8}kh2',
    '2d6 + floor((@str - 10) / 2)',
    '1d20ms10',
    '3d6min2',
    '4d6df',
  ];

  for (const src of cases) {
    it(`round-trips "${src}"`, () => {
      const ir = fromFormula(src);
      const printed = toFormula(ir);
      expect(fromFormula(printed)).toEqual(ir);
    });
  }
});

describe('foundry → dice-core evaluateRoll', () => {
  it('parses then evaluates a keep-highest roll', () => {
    const ir = fromFormula('4d6kh3');
    const result = evaluateRoll(ir, { rng: rngFromRolls([[2, 6], [5, 6], [1, 6], [6, 6]]) });
    expect(result.rolls.filter((d) => d.kept)).toHaveLength(3);
    expect(result.value).toBe(13);
  });

  it('parses then evaluates count-success', () => {
    const ir = fromFormula('4d10cs>=8');
    const result = evaluateRoll(ir, { rng: rngFromRolls([[2, 10], [8, 10], [9, 10], [5, 10]]) });
    expect(result.value).toBe(2);
  });

  it('parses then evaluates a full character formula', () => {
    const ir = fromFormula('1d20 + @mod');
    const result = evaluateRoll(ir, { rng: rngFromRolls([[14, 20]]), scope: { mod: 3 } });
    expect(result.value).toBe(17);
  });
});
