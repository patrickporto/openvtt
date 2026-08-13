import { describe, expect, it } from 'bun:test';
import type { DieTerm, ModifierContext, ResolvedModifier, Rng, WorkingDie } from '../src';
import { applyModifiers, computeValue, evaluateRoll, resolveFaces } from '../src';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function workingDie(value: number): WorkingDie {
  return {
    value,
    kept: true,
    exploded: false,
    rerolled: false,
    penetrated: false,
    outcome: 'neutral',
    history: [value],
  };
}

function rngFromRolls(rolls: ReadonlyArray<readonly [number, number]>): Rng {
  const fracs = rolls.map(([value, sides]) => (value - 1) / sides);
  let i = 0;
  return () => {
    const f = fracs[i] ?? 0.999;
    i++;
    return f;
  };
}

const alwaysMax: Rng = () => 0.999;

const ctx: ModifierContext = {
  scope: undefined,
  rng: alwaysMax,
  evalExpr: (e) => e as number,
};

function mod(partial: Pick<ResolvedModifier, 'op'> & Partial<ResolvedModifier>): ResolvedModifier {
  return { count: 1, value: 0, target: 0, cap: 100, ...partial };
}

const d6 = resolveFaces({ kind: 'number', value: 6 }, ctx);

describe('immutability — applyModifiers', () => {
  it('does not mutate input dice on explode-compound', () => {
    const dice = deepFreeze([workingDie(6)]);
    const result = applyModifiers(dice, [mod({ op: 'explode-compound', cap: 3 })], d6, ctx);

    expect(result).toHaveLength(1);
    expect(result[0]).not.toBe(dice[0]);
    expect(result[0]!.value).toBe(24);
    expect(result[0]!.history).toEqual([6, 6, 6, 6]);
    expect(result[0]!.exploded).toBe(true);
    expect(dice[0]).toEqual(workingDie(6));
  });

  it('does not mutate input dice on explode-once', () => {
    const dice = deepFreeze([workingDie(6), workingDie(2)]);
    const result = applyModifiers(dice, [mod({ op: 'explode-once' })], d6, ctx);

    expect(result.map((d) => d.value)).toEqual([6, 2, 6]);
    expect(dice.map((d) => d.value)).toEqual([6, 2]);
  });

  it('does not mutate input dice on reroll-once', () => {
    const dice = deepFreeze([workingDie(1), workingDie(5)]);
    const result = applyModifiers(
      dice,
      [mod({ op: 'reroll-once', compare: { op: '<=', value: 2 } })],
      d6,
      ctx,
    );

    expect(result.map((d) => d.value)).toEqual([1, 5, 6]);
    expect(result[2]!.kept).toBe(true);
    expect(dice.map((d) => ({ ...d, history: [...d.history] }))).toEqual([
      workingDie(1),
      workingDie(5),
    ]);
  });

  it('does not mutate input dice on keep/drop', () => {
    const dice = deepFreeze([workingDie(2), workingDie(5), workingDie(1)]);
    const result = applyModifiers(dice, [mod({ op: 'keep-highest', count: 2 })], d6, ctx);

    expect(result.map((d) => d.kept)).toEqual([true, true, false]);
    expect(dice.every((d) => d.kept)).toBe(true);
  });

  it('does not mutate the input array on sort', () => {
    const dice = deepFreeze([workingDie(4), workingDie(1), workingDie(6)]);
    const result = applyModifiers(dice, [mod({ op: 'sort-asc' })], d6, ctx);

    expect(result.map((d) => d.value)).toEqual([1, 4, 6]);
    expect(dice.map((d) => d.value)).toEqual([4, 1, 6]);
  });
});

describe('immutability — computeValue', () => {
  it('does not mutate outcomes of input dice', () => {
    const dice = deepFreeze([workingDie(8), workingDie(3), workingDie(9)]);
    const value = computeValue(dice, [
      mod({ op: 'count-success', compare: { op: '>=', value: 8 } }),
    ]);

    expect(value).toBe(2);
    expect(dice.every((d) => d.outcome === 'neutral')).toBe(true);
  });
});

describe('immutability — observable behavior preserved', () => {
  it('evaluateRoll still annotates success outcomes on final rolls', () => {
    const term: DieTerm = {
      type: 'die',
      count: 3,
      faces: { kind: 'number', value: 10 },
      modifiers: [{ op: 'count-success', compare: { op: '>=', value: 8 } }],
    };
    const result = evaluateRoll(term, {
      rng: rngFromRolls([
        [8, 10],
        [3, 10],
        [9, 10],
      ]),
    });

    expect(result.value).toBe(2);
    expect(result.rolls.map((d) => d.outcome)).toEqual(['success', 'neutral', 'success']);
  });

  it('evaluateRoll explode-compound still sums into a single die with full history', () => {
    const term: DieTerm = {
      type: 'die',
      count: 1,
      faces: { kind: 'number', value: 6 },
      modifiers: [{ op: 'explode-compound' }],
    };
    const result = evaluateRoll(term, {
      rng: rngFromRolls([
        [6, 6],
        [6, 6],
        [2, 6],
      ]),
    });

    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]!.value).toBe(14);
    expect(result.rolls[0]!.history).toEqual([6, 6, 2]);
  });
});
