import { describe, expect, it, mock } from 'bun:test';
import {
  compileFormula,
  createMemoizedEvaluator,
  evaluateFormula,
  parseFormula,
} from '../src';
import type { FormulaExpr } from '../src';

describe('compileFormula — parity with evaluateFormula', () => {
  const cases = [
    ['1 + 2 * 3', {}],
    ['(1 + 2) * 3', {}],
    ['10 % 3', {}],
    ['-5 + a', { a: 4 }],
    ['floor(7 / 2)', {}],
    ['min(3, 1, 2)', {}],
    ['max(a, b, c)', { a: 3, b: 7, c: 2 }],
    ['clamp(x, 1, 9)', { x: 20 }],
    ['abs(-4)', {}],
    ['a > 2', { a: 5 }],
    ['a >= 10 ? 5 : 0', { a: 12 }],
    ['a && b', { a: true, b: false }],
    ['a or b', { a: 0, b: 1 }],
    ['not a', { a: 0 }],
    ['floor((str - 10) / 2)', { str: 16 }],
    ['abilities.str.mod', { abilities: { str: { mod: 4 } } }],
  ] as const;

  for (const [src, scope] of cases) {
    it(`codegen matches interpreter for "${src}"`, () => {
      const ir = parseFormula(src);
      const compiled = compileFormula(ir);
      expect(compiled(scope)).toEqual(evaluateFormula(ir, { scope }));
    });
  }
});

describe('compileFormula — speed (sanity)', () => {
  it('runs many iterations without error', () => {
    const compiled = compileFormula(parseFormula('floor((str - 10) / 2) + a * b'));
    let acc = 0;
    for (let i = 0; i < 100000; i++) acc += compiled({ str: 16, a: 2, b: 3 }) as number;
    expect(acc).toBe(900000);
  });
});

describe('createMemoizedEvaluator — dirty propagation', () => {
  it('returns correct values and re-evaluates only when a variable changes', () => {
    type Leaf = { load: [] };
    const calls = mock((l: Leaf) => (l as unknown as { load: [number] }).load[0]!);
    const evalMemo = createMemoizedEvaluator<Leaf>({ onLeaf: calls });

    const expr = {
      '+': [{ load: [10] } as unknown as Leaf, { var: 'x' }],
    } as unknown as FormulaExpr<Leaf>;

    expect(evalMemo(expr, { x: 5 })).toBe(15);
    expect(calls).toHaveBeenCalledTimes(1);

    expect(evalMemo(expr, { x: 5 })).toBe(15);
    expect(calls).toHaveBeenCalledTimes(1);

    expect(evalMemo(expr, { x: 2 })).toBe(12);
    expect(calls).toHaveBeenCalledTimes(2);

    expect(evalMemo(expr, { x: 2 })).toBe(12);
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('caches pure formulas by scope', () => {
    const evalMemo = createMemoizedEvaluator<never>();
    const ir = parseFormula('floor((str - 10) / 2)');
    expect(evalMemo(ir, { str: 16 })).toBe(3);
    expect(evalMemo(ir, { str: 16 })).toBe(3);
    expect(evalMemo(ir, { str: 8 })).toBe(-1);
  });
});
