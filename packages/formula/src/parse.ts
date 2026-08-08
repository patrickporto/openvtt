import jsep from 'jsep';
import type { FormulaExpr, FuncOp } from './ir';
import { FUNC_OPS } from './ir';
import { FormulaError } from './errors';

interface Prelexed {
  readonly code: string;
  readonly mapOriginal: (codeIndex: number) => number;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

function prelex(input: string): Prelexed {
  const out: string[] = [];
  const outToIn: number[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i]!;
    if (IDENT_START.test(ch)) {
      const start = i;
      i++;
      while (i < len && IDENT_PART.test(input[i]!)) i++;
      const word = input.slice(start, i);

      if (word === 'and') {
        out.push('&', '&');
        outToIn.push(start, start);
      } else if (word === 'or') {
        out.push('|', '|');
        outToIn.push(start, start);
      } else if (word === 'not') {
        out.push('!');
        outToIn.push(start);
      } else {
        for (let k = 0; k < word.length; k++) {
          out.push(word[k]!);
          outToIn.push(start + k);
        }
      }
    } else {
      out.push(ch);
      outToIn.push(i);
      i++;
    }
  }

  const mapOriginal = (codeIndex: number): number => {
    if (outToIn.length === 0) return codeIndex;
    const clamped = codeIndex < 0 ? 0 : codeIndex >= outToIn.length ? outToIn.length - 1 : codeIndex;
    return outToIn[clamped] ?? codeIndex;
  };

  return { code: out.join(''), mapOriginal };
}

type JsepNode = jsep.Expression;

interface JsepLiteral extends JsepNode {
  type: 'Literal';
  value: boolean | number | string | RegExp | null;
  raw: string;
}
interface JsepIdentifier extends JsepNode {
  type: 'Identifier';
  name: string;
}
interface JsepBinary extends JsepNode {
  type: 'BinaryExpression';
  operator: string;
  left: JsepNode;
  right: JsepNode;
}
interface JsepUnary extends JsepNode {
  type: 'UnaryExpression';
  operator: string;
  argument: JsepNode;
  prefix: boolean;
}
interface JsepConditional extends JsepNode {
  type: 'ConditionalExpression';
  test: JsepNode;
  consequent: JsepNode;
  alternate: JsepNode;
}
interface JsepCall extends JsepNode {
  type: 'CallExpression';
  callee: JsepNode;
  arguments: JsepNode[];
}
interface JsepMember extends JsepNode {
  type: 'MemberExpression';
  computed: boolean;
  object: JsepNode;
  property: JsepNode;
}

const ALLOWED_BINARY = new Set([
  '+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=', '&&', '||',
]);

const BINARY_OP_MAP: Record<string, string> = {
  '&&': 'and',
  '||': 'or',
};

function isFuncOp(name: string): name is FuncOp {
  return (FUNC_OPS as readonly string[]).includes(name);
}

export interface ParseOptions {
  readonly input?: string;
}

export function parseFormula<E = never>(source: string): FormulaExpr<E> {
  const input = source ?? '';
  const { code, mapOriginal } = prelex(input);

  let ast: JsepNode;
  try {
    ast = jsep(code);
  } catch (err) {
    const e = err as Error & { index?: number };
    const position = typeof e.index === 'number' ? mapOriginal(e.index) : undefined;
    throw new FormulaError(stripAtChar(e.message), {
      position,
      input,
      cause: err,
    });
  }

  if (ast.type === 'Compound' || ast.type === 'SequenceExpression') {
    throw new FormulaError('Multiple statements are not allowed in a formula', { input });
  }

  return convert(ast, input) as FormulaExpr<E>;
}

function stripAtChar(message: string): string {
  return message.replace(/\s*at character\s+\d+\s*$/, '');
}

function convert(node: JsepNode, input: string): FormulaExpr<never> {
  switch (node.type) {
    case 'Literal':
      return convertLiteral(node as JsepLiteral);
    case 'Identifier':
      return { var: (node as JsepIdentifier).name };
    case 'MemberExpression':
      return convertMember(node as JsepMember, input);
    case 'BinaryExpression':
      return convertBinary(node as JsepBinary, input);
    case 'UnaryExpression':
      return convertUnary(node as JsepUnary, input);
    case 'ConditionalExpression':
      return convertConditional(node as JsepConditional, input);
    case 'CallExpression':
      return convertCall(node as JsepCall, input);
    default:
      throw new FormulaError(`Unsupported expression "${node.type}"`, { input });
  }
}

function convertLiteral(node: JsepLiteral): FormulaExpr<never> {
  const value = node.value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    throw new FormulaError('String literals are not supported');
  }
  if (value === null) {
    throw new FormulaError('null is not supported');
  }
  throw new FormulaError('Regex literals are not supported');
}

function memberToPath(node: JsepNode, input: string): string {
  if (node.type === 'Identifier') return (node as JsepIdentifier).name;
  if (node.type !== 'MemberExpression') {
    throw new FormulaError('Only dotted data paths are supported (e.g. a.b.c)', { input });
  }
  const mem = node as JsepMember;
  if (mem.computed) {
    throw new FormulaError('Computed property access (a[b]) is not supported', { input });
  }
  const base = memberToPath(mem.object, input);
  if (mem.property.type !== 'Identifier') {
    throw new FormulaError('Property names must be plain identifiers', { input });
  }
  return `${base}.${(mem.property as JsepIdentifier).name}`;
}

function convertMember(node: JsepMember, input: string): FormulaExpr<never> {
  return { var: memberToPath(node, input) };
}

function convertBinary(node: JsepBinary, input: string): FormulaExpr<never> {
  const raw = node.operator;
  if (!ALLOWED_BINARY.has(raw)) {
    throw new FormulaError(`Operator "${raw}" is not supported`, { input });
  }
  const left = convert(node.left, input);
  const right = convert(node.right, input);
  const mapped = BINARY_OP_MAP[raw];
  if (mapped === 'and') return { and: [left, right] };
  if (mapped === 'or') return { or: [left, right] };
  if (raw === '-') return { '-': [left, right] };
  return { [raw]: [left, right] } as unknown as FormulaExpr<never>;
}

function convertUnary(node: JsepUnary, input: string): FormulaExpr<never> {
  const op = node.operator;
  if (op !== '-' && op !== '!') {
    throw new FormulaError(`Unary operator "${op}" is not supported`, { input });
  }
  const arg = convert(node.argument, input);
  if (op === '-') return { '-': [arg] };
  return { '!': [arg] };
}

function convertConditional(node: JsepConditional, input: string): FormulaExpr<never> {
  return {
    if: [
      convert(node.test, input),
      convert(node.consequent, input),
      convert(node.alternate, input),
    ],
  };
}

function convertCall(node: JsepCall, input: string): FormulaExpr<never> {
  if (node.callee.type !== 'Identifier') {
    throw new FormulaError('Only direct function calls are supported (e.g. floor(x))', { input });
  }
  const name = (node.callee as JsepIdentifier).name;
  if (!isFuncOp(name)) {
    throw new FormulaError(`Unknown function "${name}"`, { input });
  }
  const args = node.arguments.map((arg) => convert(arg, input));
  return { [name]: args } as unknown as FormulaExpr<never>;
}
