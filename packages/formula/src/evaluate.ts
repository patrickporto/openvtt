import type { FormulaExpr } from './ir';
import { nodeKey } from './ir';
import { FormulaError } from './errors';
import { isTruthy, resolvePath, toNumber, type Scope } from './scope';

export type LeafHandler<E> = (leaf: E, scope: Scope) => number | boolean;

export interface EvaluateOptions<E> {
  readonly scope?: Scope;
  readonly onLeaf?: LeafHandler<E>;
}

export function evaluateFormula<E = never>(
  expr: FormulaExpr<E>,
  options: EvaluateOptions<E> = {},
): number | boolean {
  return evalNode(expr, options.scope, options.onLeaf);
}

function evalNode<E>(
  expr: FormulaExpr<E>,
  scope: Scope,
  onLeaf?: LeafHandler<E>,
): number | boolean {
  if (typeof expr === 'number') return expr;
  if (typeof expr === 'boolean') return expr;

  const key = nodeKey(expr);

  switch (key) {
    case 'var':
      return resolvePath(scope, (expr as { var: string }).var) as number | boolean;
    case 'literal':
      return expr as unknown as number | boolean;
    case 'leaf':
      if (onLeaf) return onLeaf(expr as unknown as E, scope);
      throw new FormulaError(`Cannot evaluate unsupported node: ${JSON.stringify(expr)}`);
    case '!': {
      const [arg] = (expr as { '!': readonly [FormulaExpr<E>] })['!'];
      return !isTruthy(evalNode(arg, scope, onLeaf));
    }
    case 'and': {
      const args = (expr as { and: readonly FormulaExpr<E>[] }).and;
      for (const arg of args) {
        if (!isTruthy(evalNode(arg, scope, onLeaf))) return false;
      }
      return true;
    }
    case 'or': {
      const args = (expr as { or: readonly FormulaExpr<E>[] }).or;
      for (const arg of args) {
        if (isTruthy(evalNode(arg, scope, onLeaf))) return true;
      }
      return false;
    }
    case 'if': {
      const [test, cons, alt] = (
        expr as { if: readonly [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }
      ).if;
      return isTruthy(evalNode(test, scope, onLeaf))
        ? evalNode(cons, scope, onLeaf)
        : evalNode(alt, scope, onLeaf);
    }
    case 'floor':
    case 'ceil':
    case 'round':
    case 'abs': {
      const [arg] = (expr as Record<string, readonly FormulaExpr<E>[]>)[key]!;
      const v = toNumber(evalNode(arg!, scope, onLeaf));
      return key === 'floor' ? Math.floor(v) : key === 'ceil' ? Math.ceil(v) : key === 'round' ? Math.round(v) : Math.abs(v);
    }
    case 'min':
    case 'max': {
      const args = (expr as Record<string, readonly FormulaExpr<E>[]>)[key]!;
      const values = args.map((a) => toNumber(evalNode(a, scope, onLeaf)));
      return key === 'min' ? Math.min(...values) : Math.max(...values);
    }
    case 'clamp': {
      const [x, lo, hi] = (
        expr as { clamp: readonly [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }
      ).clamp;
      const value = toNumber(evalNode(x, scope, onLeaf));
      return Math.min(Math.max(value, toNumber(evalNode(lo, scope, onLeaf))), toNumber(evalNode(hi, scope, onLeaf)));
    }
    case '-': {
      const args = (expr as { '-': readonly FormulaExpr<E>[] })['-'];
      if (args.length === 1) return -toNumber(evalNode(args[0]!, scope, onLeaf));
      return toNumber(evalNode(args[0]!, scope, onLeaf)) - toNumber(evalNode(args[1]!, scope, onLeaf));
    }
    case '+':
    case '*':
    case '/':
    case '%':
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      return evalBinary(key, expr as FormulaExpr<E>, scope, onLeaf);
    default:
      if (onLeaf) return onLeaf(expr as unknown as E, scope);
      throw new FormulaError(`Cannot evaluate node "${String(key)}"`);
  }
}

function evalBinary<E>(
  op: string,
  expr: FormulaExpr<E>,
  scope: Scope,
  onLeaf?: LeafHandler<E>,
): number | boolean {
  const [leftNode, rightNode] = (
    expr as Record<string, readonly [FormulaExpr<E>, FormulaExpr<E>]>
  )[op]!;
  const a = evalNode(leftNode, scope, onLeaf);
  const b = evalNode(rightNode, scope, onLeaf);

  switch (op) {
    case '+':
      return toNumber(a) + toNumber(b);
    case '*':
      return toNumber(a) * toNumber(b);
    case '/': {
      const divisor = toNumber(b);
      if (divisor === 0) throw new FormulaError('Division by zero');
      return toNumber(a) / divisor;
    }
    case '%': {
      const divisor = toNumber(b);
      if (divisor === 0) throw new FormulaError('Modulo by zero');
      return toNumber(a) % divisor;
    }
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return toNumber(a) < toNumber(b);
    case '<=':
      return toNumber(a) <= toNumber(b);
    case '>':
      return toNumber(a) > toNumber(b);
    case '>=':
      return toNumber(a) >= toNumber(b);
    default:
      throw new FormulaError(`Unknown operator "${op}"`);
  }
}
