import type { FormulaExpr } from './ir';
import { evaluateFormula, type LeafHandler } from './evaluate';
import { extractVariables } from './variables';
import { resolvePath, type Scope } from './scope';

export interface MemoOptions<E> {
  readonly onLeaf?: LeafHandler<E>;
}

export function createMemoizedEvaluator<E = never>(
  options: MemoOptions<E> = {},
): (expr: FormulaExpr<E>, scope?: Scope) => number | boolean {
  const cache = new WeakMap<object, { key: string; value: number | boolean }>();

  return (expr, scope) => {
    if (typeof expr !== 'object' || expr === null) {
      return evaluateFormula<E>(expr, { scope, onLeaf: options.onLeaf });
    }

    const vars = extractVariables(expr);
    const key = vars
      .map((p) => `${p}=${JSON.stringify(resolvePath(scope, p))}`)
      .join('|');

    const entry = cache.get(expr);
    if (entry !== undefined && entry.key === key) {
      return entry.value;
    }

    const value = evaluateFormula<E>(expr, { scope, onLeaf: options.onLeaf });
    cache.set(expr, { key, value });
    return value;
  };
}
