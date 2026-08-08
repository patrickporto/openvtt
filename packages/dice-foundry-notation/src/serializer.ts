import type {
  Comparison,
  DieTerm,
  FacesSpec,
  Modifier,
  Pool,
  RollExpr,
} from '@openvtt/dice-core';
import { CANONICAL_TO_SIGIL } from './keywords';

const PREC: Record<string, number> = {
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
const ATOM = Infinity;

interface Out {
  readonly text: string;
  readonly prec: number;
}

export function toFormula(expr: RollExpr): string {
  return serialize(expr).text;
}

function serialize(expr: RollExpr): Out {
  if (typeof expr === 'number') return { text: formatNumber(expr), prec: ATOM };
  if (typeof expr === 'boolean') return { text: expr ? 'true' : 'false', prec: ATOM };
  if (expr === null) return { text: 'null', prec: ATOM };

  if (isDice(expr)) {
    return { text: expr.type === 'die' ? serializeDie(expr) : serializePool(expr), prec: ATOM };
  }

  const key = singleKey(expr);
  const value = (expr as Record<string, unknown>)[key] as unknown;

  switch (key) {
    case 'var':
      return { text: `@${value as string}`, prec: ATOM };
    case '!': {
      const inner = serialize((value as RollExpr[])[0]!);
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
      return serializeBinaryPair(key, value as RollExpr[]);
    case '-':
      return (value as RollExpr[]).length === 1
        ? { text: `-${wrapBelow(serialize((value as RollExpr[])[0]!), UNARY_PREC)}`, prec: UNARY_PREC }
        : serializeBinaryPair('-', value as RollExpr[]);
    case 'if': {
      const [t, c, a] = value as RollExpr[];
      return {
        text: `${wrapAtMost(serialize(t!), TERNARY_PREC)} ? ${wrapBelow(serialize(c!), TERNARY_PREC)} : ${wrapBelow(serialize(a!), TERNARY_PREC)}`,
        prec: TERNARY_PREC,
      };
    }
    case 'floor':
    case 'ceil':
    case 'round':
    case 'abs':
    case 'min':
    case 'max':
    case 'clamp':
      return { text: `${key}(${(value as RollExpr[]).map((e) => serialize(e).text).join(', ')})`, prec: ATOM };
    default:
      return { text: String(expr), prec: ATOM };
  }
}

function serializeBinaryPair(op: string, args: RollExpr[]): Out {
  const prec = PREC[op] ?? ATOM;
  const left = serialize(args[0]!);
  const right = serialize(args[1]!);
  return {
    text: `${wrapBelow(left, prec)} ${op} ${wrapAtMost(right, prec)}`,
    prec,
  };
}

function serializeDie(term: DieTerm): string {
  const count = serializeCount(term.count);
  const faces = serializeFaces(term.faces);
  const mods = (term.modifiers ?? []).map(serializeModifier).join('');
  return `${count}d${faces}${mods}`;
}

function serializePool(pool: Pool): string {
  const entries = pool.entries.map((e) => serialize(e).text).join(', ');
  const mods = (pool.modifiers ?? []).map(serializeModifier).join('');
  return `{${entries}}${mods}`;
}

function serializeCount(count: RollExpr): string {
  if (typeof count === 'number') return String(count);
  return `(${serialize(count).text})`;
}

function serializeFaces(faces: FacesSpec): string {
  switch (faces.kind) {
    case 'number':
      return String(faces.value);
    case 'percentile':
      return '%';
    case 'fate':
      return 'f';
    case 'coin':
      return 'c';
    case 'expr':
      return `(${serialize(faces.value).text})`;
  }
}

function serializeModifier(mod: Modifier): string {
  const op = mod.op;
  if (op === 'keep-highest' || op === 'keep-lowest' || op === 'drop-highest' || op === 'drop-lowest') {
    const sigil = CANONICAL_TO_SIGIL[op];
    return mod.count != null ? `${sigil}${mod.count}` : sigil;
  }
  if (op === 'min' || op === 'max') {
    return `${CANONICAL_TO_SIGIL[op]}${mod.value}`;
  }
  if (op === 'margin-success') {
    return `${CANONICAL_TO_SIGIL[op]}${mod.target}`;
  }
  if (op === 'reroll-once' || op === 'reroll-recursive') {
    const sigil = CANONICAL_TO_SIGIL[op];
    return mod.compare ? `${sigil}${serializeComparison(mod.compare, true)}` : sigil;
  }
  if (op === 'explode' || op === 'explode-once') {
    const sigil = CANONICAL_TO_SIGIL[op];
    return mod.compare ? `${sigil}${serializeComparison(mod.compare, false)}` : sigil;
  }
  if (op === 'count-success' || op === 'count-failure' || op === 'deduct-failure') {
    const sigil = CANONICAL_TO_SIGIL[op];
    return mod.compare ? `${sigil}${serializeComparison(mod.compare, false)}` : sigil;
  }
  return op;
}

function serializeComparison(compare: Comparison, bareEquals: boolean): string {
  if (bareEquals && compare.op === '=') {
    return serializeComparisonValue(compare.value);
  }
  return `${compare.op}${serializeComparisonValue(compare.value)}`;
}

function serializeComparisonValue(value: RollExpr): string {
  if (typeof value === 'number') return String(value);
  return serialize(value).text;
}

function wrapBelow(inner: Out, parentPrec: number): string {
  return inner.prec < parentPrec ? `(${inner.text})` : inner.text;
}

function wrapAtMost(inner: Out, parentPrec: number): string {
  return inner.prec <= parentPrec ? `(${inner.text})` : inner.text;
}

function formatNumber(n: number): string {
  return Object.is(n, -0) ? '0' : String(n);
}

function isDice(expr: RollExpr): expr is DieTerm | Pool {
  return (expr as { type?: string }).type === 'die' || (expr as { type?: string }).type === 'pool';
}

function singleKey(expr: object): string {
  const keys = Object.keys(expr);
  return keys.length === 1 ? keys[0]! : '';
}
