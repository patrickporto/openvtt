import type { FormulaExpr, NodeKey, PureFormula } from './ir';
import { nodeKey } from './ir';
import { resolvePath, toNumber, isTruthy, type Scope } from './scope';
import { FormulaError } from './errors';

export type CompiledFormula = (scope?: Scope) => number | boolean;

export function compileFormula(expr: PureFormula): CompiledFormula {
  const code = gen(expr);
  const fn = new Function(
    '__scope',
    '__resolve',
    '__num',
    '__truthy',
    `return ${code};`,
  ) as (s: Scope, r: typeof resolvePath, n: typeof toNumber, t: typeof isTruthy) => number | boolean;

  return (scope?: Scope) => fn(scope, resolvePath, toNumber, isTruthy);
}

function gen(expr: PureFormula): string {
  if (typeof expr === 'number') return `(${expr})`;
  if (typeof expr === 'boolean') return expr ? 'true' : 'false';

  const key = nodeKey(expr) as NodeKey;
  switch (key) {
    case 'var':
      return `__resolve(__scope, ${JSON.stringify((expr as { var: string }).var)})`;
    case '!':
      return `(!__truthy(${gen((expr as { '!': readonly [PureFormula] })['!'][0])}))`;
    case 'and': {
      const args = (expr as { and: readonly PureFormula[] }).and.map((a) => `__truthy(${gen(a)})`);
      return `(${args.join(' && ')})`;
    }
    case 'or': {
      const args = (expr as { or: readonly PureFormula[] }).or.map((a) => `__truthy(${gen(a)})`);
      return `(${args.join(' || ')})`;
    }
    case 'if': {
      const [t, c, a] = (expr as { if: readonly [PureFormula, PureFormula, PureFormula] }).if;
      return `(__truthy(${gen(t)}) ? ${gen(c)} : ${gen(a)})`;
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
      return genBinary(key, expr as FormulaExpr<never>);
    case '-': {
      const args = (expr as { '-': readonly PureFormula[] })['-'];
      if (args.length === 1) return `(-__num(${gen(args[0]!)}))`;
      return `(__num(${gen(args[0]!)}) - __num(${gen(args[1]!)}))`;
    }
    case 'floor':
    case 'ceil':
    case 'round':
    case 'abs': {
      const [arg] = (expr as Record<string, readonly PureFormula[]>)[key]!;
      const fn = key === 'floor' ? 'Math.floor' : key === 'ceil' ? 'Math.ceil' : key === 'round' ? 'Math.round' : 'Math.abs';
      return `${fn}(__num(${gen(arg!)}))`;
    }
    case 'min':
    case 'max': {
      const args = (expr as Record<string, readonly PureFormula[]>)[key]!;
      const fn = key === 'min' ? 'Math.min' : 'Math.max';
      return `${fn}(${args.map((a) => `__num(${gen(a)})`).join(', ')})`;
    }
    case 'clamp': {
      const [x, lo, hi] = (
        expr as { clamp: readonly [PureFormula, PureFormula, PureFormula] }
      ).clamp;
      return `Math.min(Math.max(__num(${gen(x)}), __num(${gen(lo)})), __num(${gen(hi)}))`;
    }
    default:
      throw new FormulaError(`codegen does not support node: ${JSON.stringify(expr)}`);
  }
}

function genBinary(op: NodeKey, expr: FormulaExpr<never>): string {
  const [left, right] = (
    expr as Record<string, readonly [PureFormula, PureFormula]>
  )[op as string]!;
  const l = gen(left);
  const r = gen(right);
  switch (op) {
    case '+':
      return `(__num(${l}) + __num(${r}))`;
    case '*':
      return `(__num(${l}) * __num(${r}))`;
    case '/':
      return `(__num(${l}) / __num(${r}))`;
    case '%':
      return `(__num(${l}) % __num(${r}))`;
    case '==':
      return `(${l} === ${r})`;
    case '!=':
      return `(${l} !== ${r})`;
    case '<':
      return `(__num(${l}) < __num(${r}))`;
    case '<=':
      return `(__num(${l}) <= __num(${r}))`;
    case '>':
      return `(__num(${l}) > __num(${r}))`;
    case '>=':
      return `(__num(${l}) >= __num(${r}))`;
    default:
      throw new FormulaError(`codegen does not support operator "${String(op)}"`);
  }
}
