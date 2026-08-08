import { describe, expect, it } from 'bun:test';
import { evaluateRoll } from '@openvtt/dice-core';
import { fromFormula, Roll20NotationError, toFormula } from '../src';

function makeRng(...values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.999;
}

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

  it('parses percentile d%', () => {
    expect(fromFormula('1d%')).toEqual({
      type: 'die',
      count: 1,
      faces: { kind: 'percentile' },
    });
  });

  it('parses fate dF (uppercase)', () => {
    expect(fromFormula('4dF')).toEqual({
      type: 'die',
      count: 4,
      faces: { kind: 'fate' },
    });
  });

  it('parses dynamic count and faces', () => {
    expect(fromFormula('(1+1)d(8)')).toEqual({
      type: 'die',
      count: { '+': [1, 1] },
      faces: { kind: 'expr', value: 8 },
    });
  });
});

describe('fromFormula — keep/drop sigils', () => {
  it('maps kh → keep-highest', () => {
    expect(fromFormula('4d6kh3').modifiers).toEqual([{ op: 'keep-highest', count: 3 }]);
  });

  it('maps k → keep-highest (bare)', () => {
    expect(fromFormula('4d6k').modifiers).toEqual([{ op: 'keep-highest' }]);
  });

  it('maps kl → keep-lowest', () => {
    expect(fromFormula('4d6kl1').modifiers).toEqual([{ op: 'keep-lowest', count: 1 }]);
  });

  it('maps dh → drop-highest', () => {
    expect(fromFormula('4d6dh1').modifiers).toEqual([{ op: 'drop-highest', count: 1 }]);
  });

  it('maps dl → drop-lowest', () => {
    expect(fromFormula('4d6dl').modifiers).toEqual([{ op: 'drop-lowest' }]);
  });

  it('maps d → drop-lowest (bare)', () => {
    expect(fromFormula('4d6d1').modifiers).toEqual([{ op: 'drop-lowest', count: 1 }]);
  });
});

describe('fromFormula — CRITICAL: r vs ro reroll semantics', () => {
  it('maps r → reroll-RECURSIVE (NOT reroll-once)', () => {
    expect(fromFormula('2d6r<=2').modifiers).toEqual([
      { op: 'reroll-recursive', compare: { op: '<=', value: 2 } },
    ]);
  });

  it('maps ro → reroll-ONCE (NOT reroll-recursive)', () => {
    expect(fromFormula('2d6ro<=2').modifiers).toEqual([
      { op: 'reroll-once', compare: { op: '<=', value: 2 } },
    ]);
  });

  it('maps bare r (no comparison) → reroll-recursive', () => {
    expect(fromFormula('2d6r').modifiers).toEqual([{ op: 'reroll-recursive' }]);
  });

  it('maps bare ro (no comparison) → reroll-once', () => {
    expect(fromFormula('2d6ro').modifiers).toEqual([{ op: 'reroll-once' }]);
  });
});

describe('fromFormula — explode sigils', () => {
  it('maps ! → explode', () => {
    expect(fromFormula('1d6!').modifiers).toEqual([{ op: 'explode' }]);
  });

  it('maps !! → explode-compound', () => {
    expect(fromFormula('1d6!!').modifiers).toEqual([{ op: 'explode-compound' }]);
  });

  it('maps !p → explode-penetrating', () => {
    expect(fromFormula('1d6!p').modifiers).toEqual([{ op: 'explode-penetrating' }]);
  });

  it('parses explode with comparison', () => {
    expect(fromFormula('1d6!>5').modifiers).toEqual([
      { op: 'explode', compare: { op: '>', value: 5 } },
    ]);
  });

  it('parses explode with cap then comparison', () => {
    expect(fromFormula('2d6!3>5').modifiers).toEqual([
      { op: 'explode', cap: 3, compare: { op: '>', value: 5 } },
    ]);
  });

  it('parses compound explode with comparison', () => {
    expect(fromFormula('1d6!!>5').modifiers).toEqual([
      { op: 'explode-compound', compare: { op: '>', value: 5 } },
    ]);
  });
});

describe('fromFormula — count-success (implicit bare comparison)', () => {
  it('parses 5d10>6 as count-success with bare comparison', () => {
    expect(fromFormula('5d10>6')).toEqual({
      type: 'die',
      count: 5,
      faces: { kind: 'number', value: 10 },
      modifiers: [{ op: 'count-success', compare: { op: '>', value: 6 } }],
    });
  });

  it('parses bare >= comparison', () => {
    expect(fromFormula('4d10>=8').modifiers).toEqual([
      { op: 'count-success', compare: { op: '>=', value: 8 } },
    ]);
  });

  it('parses bare = comparison', () => {
    expect(fromFormula('1d20=20').modifiers).toEqual([
      { op: 'count-success', compare: { op: '=', value: 20 } },
    ]);
  });

  it('parses cs keyword + comparison', () => {
    expect(fromFormula('4d10cs>=8').modifiers).toEqual([
      { op: 'count-success', compare: { op: '>=', value: 8 } },
    ]);
  });

  it('combines count-success and count-failure', () => {
    expect(fromFormula('5d10>7f<1').modifiers).toEqual([
      { op: 'count-success', compare: { op: '>', value: 7 } },
      { op: 'count-failure', compare: { op: '<', value: 1 } },
    ]);
  });
});

describe('fromFormula — count-failure sigil', () => {
  it('maps f<cmp → count-failure', () => {
    expect(fromFormula('5d10f<3').modifiers).toEqual([
      { op: 'count-failure', compare: { op: '<', value: 3 } },
    ]);
  });

  it('maps cf → count-failure', () => {
    expect(fromFormula('5d10cf<=2').modifiers).toEqual([
      { op: 'count-failure', compare: { op: '<=', value: 2 } },
    ]);
  });
});

describe('fromFormula — sort sigils', () => {
  it('maps s → sort-asc', () => {
    expect(fromFormula('3d6s').modifiers).toEqual([{ op: 'sort-asc' }]);
  });

  it('maps sa → sort-asc', () => {
    expect(fromFormula('3d6sa').modifiers).toEqual([{ op: 'sort-asc' }]);
  });

  it('maps sd → sort-desc', () => {
    expect(fromFormula('3d6sd').modifiers).toEqual([{ op: 'sort-desc' }]);
  });
});

describe('fromFormula — attributes @{...}', () => {
  it('parses @{strength}', () => {
    expect(fromFormula('@{strength}')).toEqual({ var: 'strength' });
  });

  it('parses @{sheet|attr} → dotted var', () => {
    expect(fromFormula('@{character|level}')).toEqual({ var: 'character.level' });
  });

  it('parses @{a.b.c} dotted inside braces', () => {
    expect(fromFormula('@{abilities.str.mod}')).toEqual({ var: 'abilities.str.mod' });
  });

  it('parses @{selected|repeating_bonus} with underscore', () => {
    expect(fromFormula('@{selected|repeating_bonus}')).toEqual({ var: 'selected.repeating_bonus' });
  });

  it('parses attribute in comparison value', () => {
    expect(fromFormula('5d10>@{threshold}').modifiers).toEqual([
      { op: 'count-success', compare: { op: '>', value: { var: 'threshold' } } },
    ]);
  });
});

describe('fromFormula — arithmetic, functions, pools', () => {
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

  it('parses unary minus', () => {
    expect(fromFormula('-2d6')).toEqual({
      '-': [{ type: 'die', count: 2, faces: { kind: 'number', value: 6 } }],
    });
  });

  it('parses function calls with @{attr}', () => {
    expect(fromFormula('floor((@{str} - 10) / 2)')).toEqual({
      floor: [{ '/': [{ '-': [{ var: 'str' }, 10] }, 2] }],
    });
  });

  it('parses abs function', () => {
    expect(fromFormula('abs(1d6 - 10)')).toEqual({
      abs: [{ '-': [{ type: 'die', count: 1, faces: { kind: 'number', value: 6 } }, 10] }],
    });
  });

  it('parses a pool with modifiers', () => {
    expect(fromFormula('{2d6, 1d8}kh1')).toEqual({
      type: 'pool',
      entries: [
        { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
        { type: 'die', count: 1, faces: { kind: 'number', value: 8 } },
      ],
      modifiers: [{ op: 'keep-highest', count: 1 }],
    });
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
  it('reports unexpected tokens after expression', () => {
    try {
      fromFormula('2d6 + @');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as Roll20NotationError;
      expect(e).toBeInstanceOf(Roll20NotationError);
      expect(typeof e.position).toBe('number');
      expect(e.input).toBe('2d6 + @');
    }
  });

  it('reports missing faces', () => {
    expect(() => fromFormula('2d')).toThrow(/faces/i);
  });

  it('reports unexpected token at start', () => {
    expect(() => fromFormula(')')).toThrow(Roll20NotationError);
  });

  it('reports missing closing brace in attribute', () => {
    expect(() => fromFormula('@{strength')).toThrow(Roll20NotationError);
  });

  it('reports missing rbrace in pool', () => {
    expect(() => fromFormula('{2d6, 1d8')).toThrow(Roll20NotationError);
  });

  it('includes position in error for missing faces', () => {
    try {
      fromFormula('2d');
      throw new Error('should have thrown');
    } catch (err) {
      const e = err as Roll20NotationError;
      expect(e).toBeInstanceOf(Roll20NotationError);
      expect(e.position).toBe(2);
    }
  });
});

describe('toFormula — serialization', () => {
  it('serializes basic dice', () => {
    expect(toFormula(fromFormula('2d6'))).toBe('2d6');
  });

  it('serializes keep/drop sigils', () => {
    expect(toFormula(fromFormula('4d6kh3'))).toBe('4d6kh3');
    expect(toFormula(fromFormula('4d6kl'))).toBe('4d6kl');
    expect(toFormula(fromFormula('4d6dl1'))).toBe('4d6dl1');
  });

  it('serializes reroll sigils (r and ro)', () => {
    expect(toFormula(fromFormula('2d6r<=2'))).toBe('2d6r<=2');
    expect(toFormula(fromFormula('2d6ro<=2'))).toBe('2d6ro<=2');
  });

  it('serializes explode sigils', () => {
    expect(toFormula(fromFormula('1d6!'))).toBe('1d6!');
    expect(toFormula(fromFormula('1d6!!'))).toBe('1d6!!');
    expect(toFormula(fromFormula('1d6!p'))).toBe('1d6!p');
  });

  it('serializes count-success as bare comparison', () => {
    expect(toFormula(fromFormula('4d10cs>=8'))).toBe('4d10>=8');
    expect(toFormula(fromFormula('5d10>6'))).toBe('5d10>6');
  });

  it('serializes count-failure with f sigil', () => {
    expect(toFormula(fromFormula('5d10f<3'))).toBe('5d10f<3');
  });

  it('serializes faces', () => {
    expect(toFormula(fromFormula('1d%'))).toBe('1d%');
    expect(toFormula(fromFormula('4dF'))).toBe('4dF');
  });

  it('serializes sort sigils', () => {
    expect(toFormula(fromFormula('3d6sa'))).toBe('3d6sa');
    expect(toFormula(fromFormula('3d6sd'))).toBe('3d6sd');
  });

  it('serializes attributes @{...}', () => {
    expect(toFormula(fromFormula('@{strength}'))).toBe('@{strength}');
    expect(toFormula(fromFormula('@{character|level}'))).toBe('@{character.level}');
  });

  it('serializes pools', () => {
    expect(toFormula(fromFormula('{2d6, 1d8}kh1'))).toBe('{2d6, 1d8}kh1');
  });

  it('serializes arithmetic and functions', () => {
    expect(toFormula(fromFormula('2d6 + 3 * 4'))).toBe('2d6 + 3 * 4');
    expect(toFormula(fromFormula('floor((@{str} - 10) / 2)'))).toBe('floor((@{str} - 10) / 2)');
  });
});

describe('round-trip fromFormula <-> toFormula', () => {
  const cases = [
    '2d6',
    '4d6kh3',
    '4d6kl1',
    '4d6dl',
    '1d6!',
    '1d6!!',
    '1d6!p',
    '2d6r<=2',
    '2d6ro<=2',
    '5d10>6',
    '5d10f<3',
    '1d%',
    '4dF',
    '3d6sa',
    '3d6sd',
    '{2d6, 1d8}kh1',
    '1d20 + @{str}',
    'floor((@{str} - 10) / 2)',
    '2d6>7f<1',
    '1d6!>5',
    '-2d6',
  ];

  for (const src of cases) {
    it(`round-trips "${src}"`, () => {
      const ir = fromFormula(src);
      const printed = toFormula(ir);
      expect(fromFormula(printed)).toEqual(ir);
    });
  }
});

describe('integration with @openvtt/dice-core evaluateRoll', () => {
  it('parses then evaluates keep-highest', () => {
    const ir = fromFormula('4d6kh3');
    const result = evaluateRoll(ir, { rng: makeRng(0.1, 0.5, 0.2, 0.9) });
    expect(result.rolls.filter((d) => d.kept)).toHaveLength(3);
    expect(typeof result.value).toBe('number');
  });

  it('evaluates implicit count-success 5d10>6', () => {
    const ir = fromFormula('5d10>6');
    const result = evaluateRoll(ir, { rng: () => 0.85 });
    expect(result.value).toBe(5);
  });

  it('evaluates count-success cs keyword form identically', () => {
    const ir = fromFormula('4d10cs>6');
    const result = evaluateRoll(ir, { rng: () => 0.85 });
    expect(result.value).toBe(4);
  });

  it('evaluates 4dF fate dice', () => {
    const ir = fromFormula('4dF');
    const result = evaluateRoll(ir, { rng: makeRng(0.0, 0.4, 0.7, 0.0) });
    expect(result.value).toBe(-1);
  });

  it('evaluates 1d% percentile', () => {
    const ir = fromFormula('1d%');
    const result = evaluateRoll(ir, { rng: () => 0.85 });
    expect(result.value).toBe(86);
  });

  it('evaluates r (reroll-recursive) — keeps rerolling until condition fails', () => {
    const ir = fromFormula('2d6r<=2');
    const result = evaluateRoll(ir, { rng: makeRng(0.0, 0.0, 0.0, 0.0) });
    expect(result.value).toBe(12);
  });

  it('evaluates ro (reroll-once) — rerolls each die only once', () => {
    const ir = fromFormula('2d6ro<=2');
    const result = evaluateRoll(ir, { rng: makeRng(0.0, 0.0, 0.0, 0.0) });
    expect(result.value).toBe(2);
  });

  it('r and ro produce different results for the same rng', () => {
    const recursive = evaluateRoll(fromFormula('2d6r<=2'), { rng: makeRng(0.0, 0.0, 0.0, 0.0) });
    const once = evaluateRoll(fromFormula('2d6ro<=2'), { rng: makeRng(0.0, 0.0, 0.0, 0.0) });
    expect(recursive.value).not.toBe(once.value);
  });

  it('evaluates ! explode', () => {
    const ir = fromFormula('1d6!');
    const result = evaluateRoll(ir, { rng: makeRng(0.999, 0.1) });
    expect(result.value).toBe(7);
    expect(result.rolls.filter((d) => d.exploded)).toHaveLength(1);
  });

  it('evaluates !! compound explode', () => {
    const ir = fromFormula('1d6!!');
    const result = evaluateRoll(ir, { rng: makeRng(0.999, 0.1) });
    expect(result.value).toBe(7);
    expect(result.rolls).toHaveLength(1);
  });

  it('evaluates !p penetrating explode', () => {
    const ir = fromFormula('1d6!p');
    const result = evaluateRoll(ir, { rng: makeRng(0.999, 0.1) });
    expect(result.value).toBe(6);
    expect(result.rolls).toHaveLength(2);
    expect(result.rolls[1]!.penetrated).toBe(true);
  });

  it('evaluates pool keep-highest', () => {
    const ir = fromFormula('{2d6,1d8}kh1');
    const result = evaluateRoll(ir, { rng: makeRng(0.1, 0.2, 0.05) });
    expect(result.value).toBe(2);
  });

  it('evaluates a full character formula with @{attr}', () => {
    const ir = fromFormula('1d20 + @{strength}');
    const result = evaluateRoll(ir, { rng: () => 0.95, scope: { strength: 4 } });
    expect(result.value).toBe(24);
  });

  it('evaluates @{sheet|attr} with nested scope', () => {
    const ir = fromFormula('@{character|level}');
    const result = evaluateRoll(ir, { scope: { character: { level: 5 } } });
    expect(result.value).toBe(5);
  });

  it('evaluates count-success + count-failure combination', () => {
    const ir = fromFormula('5d10>7f<1');
    const result = evaluateRoll(ir, { rng: () => 0.85 });
    expect(result.value).toBe(5);
  });
});
