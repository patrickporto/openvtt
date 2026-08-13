import { describe, expect, it } from 'bun:test';
import type { DieTerm, Rng } from '../src';
import { createRng, evaluateRoll } from '../src';

function rngFromRolls(rolls: ReadonlyArray<readonly [number, number]>): Rng {
  const fracs = rolls.map(([value, sides]) => (value - 1) / sides);
  let i = 0;
  return () => {
    const f = fracs[i] ?? 0.999;
    i++;
    return f;
  };
}

function die(count: number, faces: number, modifiers?: DieTerm['modifiers']): DieTerm {
  return { type: 'die', count, faces: { kind: 'number', value: faces }, modifiers };
}

describe('evaluateRoll — basics', () => {
  it('rolls a plain die term', () => {
    const result = evaluateRoll(die(2, 6), { rng: rngFromRolls([[3, 6], [5, 6]]) });
    expect(result.value).toBe(8);
    expect(result.rolls.map((d) => d.value)).toEqual([3, 5]);
    expect(result.terms[0]!.type).toBe('die');
  });

  it('uses a seed deterministically', () => {
    const a = evaluateRoll(die(2, 6), { seed: 'abc' });
    const b = evaluateRoll(die(2, 6), { seed: 'abc' });
    expect(a.rolls.map((d) => d.value)).toEqual(b.rolls.map((d) => d.value));
  });

  it('rolls a percentile die in range 1..100', () => {
    const term: DieTerm = { type: 'die', count: 5, faces: { kind: 'percentile' } };
    const result = evaluateRoll(term, { seed: 'p' });
    for (const d of result.rolls) {
      expect(d.value).toBeGreaterThanOrEqual(1);
      expect(d.value).toBeLessThanOrEqual(100);
    }
  });

  it('rolls fate dice in {-1, 0, 1}', () => {
    const term: DieTerm = { type: 'die', count: 20, faces: { kind: 'fate' } };
    const result = evaluateRoll(term, { seed: 'f' });
    for (const v of result.rolls.map((d) => d.value)) expect([-1, 0, 1]).toContain(v);
  });

  it('rolls a coin in {1, 2}', () => {
    const term: DieTerm = { type: 'die', count: 10, faces: { kind: 'coin' } };
    const result = evaluateRoll(term, { seed: 'c' });
    for (const v of result.rolls.map((d) => d.value)) expect([1, 2]).toContain(v);
  });
});

describe('evaluateRoll — keep/drop', () => {
  it('keeps the highest N', () => {
    const result = evaluateRoll(die(4, 6, [{ op: 'keep-highest', count: 3 }]), {
      rng: rngFromRolls([[2, 6], [5, 6], [1, 6], [6, 6]]),
    });
    expect(result.rolls.map((d) => d.value)).toEqual([2, 5, 1, 6]);
    expect(result.rolls.filter((d) => d.kept).map((d) => d.value)).toEqual([2, 5, 6]);
    expect(result.value).toBe(13);
  });

  it('drops the lowest N', () => {
    const result = evaluateRoll(die(4, 6, [{ op: 'drop-lowest', count: 1 }]), {
      rng: rngFromRolls([[2, 6], [5, 6], [1, 6], [6, 6]]),
    });
    expect(result.value).toBe(13);
  });

  it('keeps the lowest 1 by default', () => {
    const result = evaluateRoll(die(4, 6, [{ op: 'keep-lowest' }]), {
      rng: rngFromRolls([[2, 6], [5, 6], [1, 6], [6, 6]]),
    });
    expect(result.value).toBe(1);
  });
});

describe('evaluateRoll — explode', () => {
  it('explodes recursively on max face', () => {
    const result = evaluateRoll(die(1, 6, [{ op: 'explode' }]), {
      rng: rngFromRolls([[6, 6], [6, 6], [3, 6]]),
    });
    expect(result.rolls.map((d) => d.value)).toEqual([6, 6, 3]);
    expect(result.value).toBe(15);
  });

  it('explode-once stops after one extra', () => {
    const result = evaluateRoll(die(1, 6, [{ op: 'explode-once' }]), {
      rng: rngFromRolls([[6, 6], [6, 6]]),
    });
    expect(result.rolls.map((d) => d.value)).toEqual([6, 6]);
    expect(result.value).toBe(12);
  });

  it('explode-compound sums into one die', () => {
    const result = evaluateRoll(die(1, 6, [{ op: 'explode-compound' }]), {
      rng: rngFromRolls([[6, 6], [6, 6], [2, 6]]),
    });
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]!.value).toBe(14);
    expect(result.rolls[0]!.history).toEqual([6, 6, 2]);
  });

  it('explode-penetrating subtracts 1 from subsequent rolls', () => {
    const result = evaluateRoll(die(1, 6, [{ op: 'explode-penetrating' }]), {
      rng: rngFromRolls([[6, 6], [6, 6], [3, 6]]),
    });
    expect(result.rolls.map((d) => d.value)).toEqual([6, 5, 2]);
    expect(result.value).toBe(13);
  });
});

describe('evaluateRoll — reroll', () => {
  it('rerolls once on matching dice', () => {
    const result = evaluateRoll(
      die(2, 6, [{ op: 'reroll-once', compare: { op: '<=', value: 2 } }]),
      { rng: rngFromRolls([[1, 6], [5, 6], [4, 6]]) },
    );
    expect(result.rolls.filter((d) => d.kept).map((d) => d.value)).toEqual([5, 4]);
    expect(result.value).toBe(9);
  });

  it('reroll-recursive keeps rerolling until it stops matching', () => {
    const result = evaluateRoll(
      die(1, 6, [{ op: 'reroll-recursive', compare: { op: '<=', value: 2 } }]),
      { rng: rngFromRolls([[1, 6], [2, 6], [4, 6]]) },
    );
    expect(result.rolls.filter((d) => d.kept).map((d) => d.value)).toEqual([4]);
  });
});

describe('evaluateRoll — clamp, sort, count', () => {
  it('clamps with min', () => {
    const result = evaluateRoll(die(3, 6, [{ op: 'min', value: 3 }]), {
      rng: rngFromRolls([[1, 6], [5, 6], [2, 6]]),
    });
    expect(result.rolls.map((d) => d.value)).toEqual([3, 5, 3]);
    expect(result.value).toBe(11);
  });

  it('clamps with max', () => {
    const result = evaluateRoll(die(3, 6, [{ op: 'max', value: 4 }]), {
      rng: rngFromRolls([[3, 6], [6, 6], [5, 6]]),
    });
    expect(result.rolls.map((d) => d.value)).toEqual([3, 4, 4]);
  });

  it('sorts ascending', () => {
    const result = evaluateRoll(die(3, 6, [{ op: 'sort-asc' }]), {
      rng: rngFromRolls([[4, 6], [1, 6], [6, 6]]),
    });
    expect(result.rolls.map((d) => d.value)).toEqual([1, 4, 6]);
  });

  it('counts successes', () => {
    const result = evaluateRoll(
      die(4, 10, [{ op: 'count-success', compare: { op: '>=', value: 8 } }]),
      { rng: rngFromRolls([[2, 10], [8, 10], [9, 10], [5, 10]]) },
    );
    expect(result.value).toBe(2);
  });

  it('counts even', () => {
    const even = evaluateRoll(die(4, 6, [{ op: 'count-even' }]), {
      rng: rngFromRolls([[2, 6], [3, 6], [4, 6], [5, 6]]),
    });
    expect(even.value).toBe(2);
  });
});

describe('evaluateRoll — combined with formula', () => {
  it('evaluates dice inside an arithmetic expression', () => {
    const expr = {
      '+': [die(2, 6), { '/': [10, 2] }],
    } as const;
    const result = evaluateRoll(expr, { rng: rngFromRolls([[3, 6], [4, 6]]) });
    expect(result.value).toBe(12);
  });

  it('supports dynamic count via expression', () => {
    const expr: DieTerm = {
      type: 'die',
      count: { '+': [1, 1] },
      faces: { kind: 'number', value: 6 },
    };
    const result = evaluateRoll(expr, { rng: rngFromRolls([[3, 6], [4, 6]]) });
    expect(result.rolls).toHaveLength(2);
  });

  it('resolves data paths in comparisons', () => {
    const result = evaluateRoll(
      die(1, 20, [{ op: 'count-success', compare: { op: '>=', value: { var: 'dc' } } }]),
      { rng: rngFromRolls([[14, 20]]), scope: { dc: 10 } },
    );
    expect(result.value).toBe(1);
  });
});

describe('evaluateRoll — pool', () => {
  it('rolls a pool and keeps the highest across entries', () => {
    const pool = {
      type: 'pool',
      entries: [die(2, 6), die(1, 8)],
      modifiers: [{ op: 'keep-highest', count: 2 }],
    } as const;
    const result = evaluateRoll(pool, { rng: rngFromRolls([[2, 6], [5, 6], [7, 8]]) });
    const kept = result.rolls.filter((d) => d.kept).map((d) => d.value).sort((a, b) => a - b);
    expect(kept).toEqual([5, 7]);
    expect(result.value).toBe(12);
    expect(result.terms[0]!.type).toBe('pool');
  });
});

describe('evaluateRoll — result shape', () => {
  it('produces a uuid v7 id', () => {
    const result = evaluateRoll(die(1, 6), { rng: rngFromRolls([[3, 6]]) });
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('records applied modifier names', () => {
    const result = evaluateRoll(die(4, 6, [{ op: 'keep-highest', count: 3 }]), {
      rng: rngFromRolls([[2, 6], [5, 6], [1, 6], [6, 6]]),
    });
    expect(result.terms[0]!.applied).toEqual(['keep-highest']);
  });
});

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    expect(a()).toBe(b());
  });
});
