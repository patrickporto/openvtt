import type {
  Comparison,
  DieTerm,
  FacesSpec,
  Modifier,
  Pool,
  RollExpr,
} from '@openvtt/dice-core';
import { EXPLODE_OPS, FAILURE_OPS, KEEP_DROP_OPS } from './keywords';
import type { DialectConfig } from './dialect';

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

export function toFormula(dialect: DialectConfig, expr: RollExpr): string {
  return serialize(dialect, expr).text;
}

function serialize(dialect: DialectConfig, expr: RollExpr): Out {
  if (typeof expr === 'number') return { text: formatNumber(expr), prec: ATOM };
  if (typeof expr === 'boolean') return { text: expr ? 'true' : 'false', prec: ATOM };
  if (expr === null) return { text: 'null', prec: ATOM };

  if (isDice(expr)) {
    return { text: expr.type === 'die' ? serializeDie(dialect, expr) : serializePool(dialect, expr), prec: ATOM };
  }

  const key = singleKey(expr);
  const value = (expr as Record<string, unknown>)[key] as unknown;

  switch (key) {
    case 'var':
      return {
        text: dialect.bracedAttributes ? `@{${value as string}}` : `@${value as string}`,
        prec: ATOM,
      };
    case '!': {
      const inner = serialize(dialect, (value as RollExpr[])[0]!);
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
      return serializeBinaryPair(dialect, key, value as RollExpr[]);
    case '-':
      return (value as RollExpr[]).length === 1
        ? { text: `-${wrapBelow(serialize(dialect, (value as RollExpr[])[0]!), UNARY_PREC)}`, prec: UNARY_PREC }
        : serializeBinaryPair(dialect, '-', value as RollExpr[]);
    case 'if': {
      const [t, c, a] = value as RollExpr[];
      return {
        text: `${wrapAtMost(serialize(dialect, t!), TERNARY_PREC)} ? ${wrapBelow(serialize(dialect, c!), TERNARY_PREC)} : ${wrapBelow(serialize(dialect, a!), TERNARY_PREC)}`,
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
      return { text: `${key}(${(value as RollExpr[]).map((e) => serialize(dialect, e).text).join(', ')})`, prec: ATOM };
    default:
      return { text: String(expr), prec: ATOM };
  }
}

function serializeBinaryPair(dialect: DialectConfig, op: string, args: RollExpr[]): Out {
  const prec = PREC[op] ?? ATOM;
  const left = serialize(dialect, args[0]!);
  const right = serialize(dialect, args[1]!);
  return {
    text: `${wrapBelow(left, prec)} ${op} ${wrapAtMost(right, prec)}`,
    prec,
  };
}

function serializeDie(dialect: DialectConfig, term: DieTerm): string {
  const count = serializeCount(dialect, term.count);
  const faces = serializeFaces(dialect, term.faces);
  const mods = (term.modifiers ?? []).map((m) => serializeModifier(dialect, m)).join('');
  return `${count}d${faces}${mods}`;
}

function serializePool(dialect: DialectConfig, pool: Pool): string {
  const entries = pool.entries.map((e) => serialize(dialect, e).text).join(', ');
  const mods = (pool.modifiers ?? []).map((m) => serializeModifier(dialect, m)).join('');
  return `{${entries}}${mods}`;
}

function serializeCount(dialect: DialectConfig, count: RollExpr): string {
  if (typeof count === 'number') return String(count);
  return `(${serialize(dialect, count).text})`;
}

function serializeFaces(dialect: DialectConfig, faces: FacesSpec): string {
  switch (faces.kind) {
    case 'number':
      return String(faces.value);
    case 'percentile':
      return '%';
    case 'fate':
      return dialect.fateFace;
    case 'coin':
      return dialect.coinFace;
    case 'expr':
      return `(${serialize(dialect, faces.value).text})`;
  }
}

function serializeModifier(dialect: DialectConfig, mod: Modifier): string {
  const op = mod.op;
  const sigil = dialect.sigils[op] ?? op;
  if (KEEP_DROP_OPS.includes(op)) {
    return mod.count != null ? `${sigil}${mod.count}` : sigil;
  }
  if (op === 'min' || op === 'max') return `${sigil}${mod.value}`;
  if (op === 'margin-success') return `${sigil}${mod.target}`;
  if (op === 'reroll-once' || op === 'reroll-recursive') {
    return mod.compare
      ? `${sigil}${serializeComparison(dialect, mod.compare, dialect.rerollOmitEquals)}`
      : sigil;
  }
  if (EXPLODE_OPS.includes(op)) {
    const cap = dialect.explodeCap && mod.cap != null ? String(mod.cap) : '';
    const cmp = mod.compare ? serializeComparison(dialect, mod.compare, false) : '';
    return `${sigil}${cap}${cmp}`;
  }
  if (op === 'count-success' && dialect.countSuccessBare) {
    return mod.compare ? serializeComparison(dialect, mod.compare, false) : 'cs';
  }
  if (op === 'count-success' || FAILURE_OPS.includes(op)) {
    return mod.compare ? `${sigil}${serializeComparison(dialect, mod.compare, false)}` : sigil;
  }
  return sigil;
}

function serializeComparison(dialect: DialectConfig, compare: Comparison, omitEquals: boolean): string {
  if (omitEquals && compare.op === '=') {
    return serializeComparisonValue(dialect, compare.value);
  }
  return `${compare.op}${serializeComparisonValue(dialect, compare.value)}`;
}

function serializeComparisonValue(dialect: DialectConfig, value: RollExpr): string {
  if (typeof value === 'number') return String(value);
  return serialize(dialect, value).text;
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
