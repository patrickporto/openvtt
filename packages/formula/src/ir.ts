export type BinaryOp = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=';

export type UnaryOp = '-' | '!';

export type FuncOp = 'floor' | 'ceil' | 'round' | 'abs' | 'min' | 'max' | 'clamp';

export type NodeKey =
  | BinaryOp
  | 'and'
  | 'or'
  | '!'
  | 'if'
  | 'var'
  | FuncOp;

export const BINARY_OPS: readonly BinaryOp[] = [
  '+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
];

export const UNARY_OPS: readonly UnaryOp[] = ['-', '!'];

export const FUNC_OPS: readonly FuncOp[] = [
  'floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp',
];

export const VAR_OPS: readonly ('and' | 'or' | 'if' | 'var')[] = ['and', 'or', 'if', 'var'];

export const ALL_NODE_KEYS: readonly NodeKey[] = [
  ...BINARY_OPS,
  'and',
  'or',
  '!',
  'if',
  'var',
  ...FUNC_OPS,
];

export type FormulaExpr<E = never> =
  | number
  | boolean
  | { readonly '+': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | {
      readonly '-':
        | readonly [FormulaExpr<E>]
        | readonly [FormulaExpr<E>, FormulaExpr<E>];
    }
  | { readonly '*': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '/': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '%': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '==': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '!=': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '<': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '<=': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '>': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly '>=': readonly [FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly and: readonly FormulaExpr<E>[] }
  | { readonly or: readonly FormulaExpr<E>[] }
  | { readonly '!': readonly [FormulaExpr<E>] }
  | { readonly if: readonly [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }
  | { readonly var: string }
  | { readonly floor: readonly [FormulaExpr<E>] }
  | { readonly ceil: readonly [FormulaExpr<E>] }
  | { readonly round: readonly [FormulaExpr<E>] }
  | { readonly abs: readonly [FormulaExpr<E>] }
  | { readonly min: readonly FormulaExpr<E>[] }
  | { readonly max: readonly FormulaExpr<E>[] }
  | { readonly clamp: readonly [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }
  | E;

export type PureFormula = FormulaExpr<never>;

export type FormulaLeaf<E> = E;

export function isLiteral(value: FormulaExpr): value is number | boolean {
  return typeof value === 'number' || typeof value === 'boolean';
}

export function nodeKey<E>(node: FormulaExpr<E>): NodeKey | 'leaf' | 'literal' {
  if (isLiteral(node as FormulaExpr<never>)) return 'literal';
  if (typeof node !== 'object' || node === null) return 'leaf';
  const keys = Object.keys(node);
  if (keys.length === 1 && (ALL_NODE_KEYS as readonly string[]).includes(keys[0]!)) {
    return keys[0] as NodeKey;
  }
  return 'leaf';
}
