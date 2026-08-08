import type { FormulaExpr, NodeKey } from './ir';
import { nodeKey } from './ir';

export function extractVariables<E = never>(expr: FormulaExpr<E>): readonly string[] {
  const found = new Set<string>();
  collect(expr, found);
  return [...found];
}

function collect<E>(expr: FormulaExpr<E>, found: Set<string>): void {
  if (typeof expr !== 'object' || expr === null) return;

  const key = nodeKey(expr);

  if (key === 'var') {
    found.add((expr as { var: string }).var);
    return;
  }
  if (key === 'literal' || key === 'leaf') return;

  const children = childrenOf(expr as FormulaExpr<never>, key);
  for (const child of children) collect(child, found);
}

const ARG_KEYS: readonly NodeKey[] = [
  '+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
  'and', 'or', '!', 'if',
  'floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp',
];

function childrenOf<E>(expr: FormulaExpr<E>, key: NodeKey): readonly FormulaExpr<E>[] {
  if (!(ARG_KEYS as readonly string[]).includes(key)) return [];
  const value = (expr as Record<string, readonly FormulaExpr<E>[]>)[key];
  if (Array.isArray(value)) return value;
  return [];
}
