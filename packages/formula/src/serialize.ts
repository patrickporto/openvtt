import type { BinaryOp, FormulaExpr, NodeKey } from './ir';
import { nodeKey } from './ir';

const BINARY_PREC: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

const UNARY_PREC = 7;
const TERNARY_PREC = 0;
const ATOM_PREC = Infinity;

const BINARY_SYMBOL: Record<string, string> = {
  '==': '==',
  '!=': '!=',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '%': '%',
  and: '&&',
  or: '||',
};

interface Serialized {
  readonly text: string;
  readonly prec: number;
}

function field<E>(expr: FormulaExpr<E>, key: string): readonly FormulaExpr<E>[] {
  return (expr as Record<string, readonly FormulaExpr<E>[]>)[key] ?? [];
}

export function toFormula<E = never>(expr: FormulaExpr<E>): string {
  return serialize(expr).text;
}

function serialize<E>(expr: FormulaExpr<E>): Serialized {
  if (typeof expr === 'number') return { text: formatNumber(expr), prec: ATOM_PREC };
  if (typeof expr === 'boolean') return { text: expr ? 'true' : 'false', prec: ATOM_PREC };

  const key = nodeKey(expr);

  switch (key) {
    case 'literal':
    case 'leaf':
      return { text: String(expr), prec: ATOM_PREC };
    case 'var':
      return { text: (expr as { var: string }).var, prec: ATOM_PREC };
    case '!': {
      const [arg] = (expr as { '!': readonly [FormulaExpr<E>] })['!'];
      const inner = serialize(arg);
      return { text: `!${wrapBelow(inner, UNARY_PREC)}`, prec: UNARY_PREC };
    }
    case 'and':
    case 'or':
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '+':
    case '*':
    case '/':
    case '%':
      return serializeBinary(expr as FormulaExpr<E>, key);
    case '-': {
      const args = (expr as { '-': readonly FormulaExpr<E>[] })['-'];
      if (args.length === 1) {
        const inner = serialize(args[0]!);
        return { text: `-${wrapBelow(inner, UNARY_PREC)}`, prec: UNARY_PREC };
      }
      return serializeBinaryPair(args[0]!, '-', args[1]!);
    }
    case 'if': {
      const [test, cons, alt] = (expr as { if: readonly [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }).if;
      const t = serialize(test);
      const c = serialize(cons);
      const a = serialize(alt);
      return {
        text: `${wrapAtMost(t, TERNARY_PREC)} ? ${wrapBelow(c, TERNARY_PREC)} : ${wrapBelow(a, TERNARY_PREC)}`,
        prec: TERNARY_PREC,
      };
    }
    case 'floor':
    case 'ceil':
    case 'round':
    case 'abs':
      return serializeUnaryCall(key, field(expr, key)[0]!);
    case 'min':
    case 'max':
      return serializeVariadicCall(key, field(expr, key));
    case 'clamp': {
      const args = (expr as { clamp: readonly [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }).clamp;
      return {
        text: `clamp(${args.map((a) => serialize(a).text).join(', ')})`,
        prec: ATOM_PREC,
      };
    }
    default:
      return { text: String(expr), prec: ATOM_PREC };
  }
}

function serializeBinary<E>(expr: FormulaExpr<E>, op: NodeKey): Serialized {
  const args = field(expr, op);
  if (args.length !== 2) return { text: String(expr), prec: ATOM_PREC };
  return serializeBinaryPair(args[0]!, op as BinaryOp, args[1]!);
}

function serializeBinaryPair<E>(
  left: FormulaExpr<E>,
  op: BinaryOp,
  right: FormulaExpr<E>,
): Serialized {
  const prec = BINARY_PREC[op] ?? ATOM_PREC;
  const l = serialize(left);
  const r = serialize(right);
  const symbol = BINARY_SYMBOL[op] ?? op;
  return {
    text: `${wrapBelow(l, prec)} ${symbol} ${wrapAtMost(r, prec)}`,
    prec,
  };
}

function serializeUnaryCall<E>(name: NodeKey, arg: FormulaExpr<E>): Serialized {
  return { text: `${name}(${serialize(arg).text})`, prec: ATOM_PREC };
}

function serializeVariadicCall<E>(name: NodeKey, args: readonly FormulaExpr<E>[]): Serialized {
  return { text: `${name}(${args.map((a) => serialize(a).text).join(', ')})`, prec: ATOM_PREC };
}

function wrapBelow(inner: Serialized, parentPrec: number): string {
  return inner.prec < parentPrec ? `(${inner.text})` : inner.text;
}

function wrapAtMost(inner: Serialized, parentPrec: number): string {
  return inner.prec <= parentPrec ? `(${inner.text})` : inner.text;
}

function formatNumber(n: number): string {
  return Object.is(n, -0) ? '0' : String(n);
}
