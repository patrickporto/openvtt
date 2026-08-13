import type { FormulaExpr } from './ir';
import { evaluateFormula, type LeafHandler } from './evaluate';
import { extractLeaves, extractVariables } from './variables';
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
    const leaves = extractLeaves(expr);
    const leafValues = new Map<E, number | boolean>();
    const parts = vars.map((p) => `${p}=${JSON.stringify(resolvePath(scope, p))}`);
    for (const leaf of leaves) {
      if (options.onLeaf) {
        const value = options.onLeaf(leaf, scope);
        leafValues.set(leaf, value);
        parts.push(`leaf=${JSON.stringify(value)}`);
      } else {
        parts.push(`leaf=${JSON.stringify(leaf)}`);
      }
    }
    const key = parts.join('|');

    const entry = cache.get(expr);
    if (entry !== undefined && entry.key === key) {
      return entry.value;
    }

    const baseOnLeaf = options.onLeaf;
    const onLeaf: LeafHandler<E> | undefined = baseOnLeaf
      ? (leaf, leafScope) => leafValues.get(leaf) ?? baseOnLeaf(leaf, leafScope)
      : undefined;
    const value = evaluateFormula<E>(expr, { scope, onLeaf });
    cache.set(expr, { key, value });
    return value;
  };
}
