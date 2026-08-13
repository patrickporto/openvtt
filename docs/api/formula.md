# @openvtt/formula

jsep-powered formula parser producing a json-logic-shaped intermediate representation (IR), with a safe tree-walking evaluator, a canonical serializer, a JIT compiler, and a memoizing evaluator. No `eval` is ever used for the standard evaluator; formulas are pure data until you explicitly evaluate or compile them.

**Version:** 0.1.0
**Dependencies:** `jsep`, `valibot`

## Installation

```bash
bun add @openvtt/formula
```

```ts
import { parseFormula, evaluateFormula, toFormula } from '@openvtt/formula';
```

See the [Formulas guide](../guides/formulas.md) for usage patterns in game systems.

## Types

```ts
type BinaryOp = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=';
type UnaryOp = '!';
type FuncOp = 'floor' | 'ceil' | 'round' | 'abs' | 'min' | 'max' | 'clamp';

type NodeKey =
  | BinaryOp | UnaryOp
  | 'and' | 'or' | 'if' | 'var'
  | FuncOp;

type FormulaExpr<E = never> =
  | number
  | boolean
  | { '+': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '-': [FormulaExpr<E>] | [FormulaExpr<E>, FormulaExpr<E>] }
  | { '*': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '/': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '%': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '==': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '!=': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '<': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '<=': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '>': [FormulaExpr<E>, FormulaExpr<E>] }
  | { '>=': [FormulaExpr<E>, FormulaExpr<E>] }
  | { and: FormulaExpr<E>[] }
  | { or: FormulaExpr<E>[] }
  | { '!': [FormulaExpr<E>] }
  | { if: [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }
  | { var: string }
  | { floor: [FormulaExpr<E>] }
  | { ceil: [FormulaExpr<E>] }
  | { round: [FormulaExpr<E>] }
  | { abs: [FormulaExpr<E>] }
  | { min: FormulaExpr<E>[] }
  | { max: FormulaExpr<E>[] }
  | { clamp: [FormulaExpr<E>, FormulaExpr<E>, FormulaExpr<E>] }
  | E;

type PureFormula = FormulaExpr<never>;
type FormulaLeaf<E> = Exclude<E, FormulaExpr>;
```

The `E` type parameter is an extension slot: `@openvtt/dice-core` uses it to embed dice terms inside arithmetic expressions. `PureFormula` (the default) forbids leaves, giving a closed, fully evaluable tree.

## Constants

```ts
const BINARY_OPS: readonly BinaryOp[];
const UNARY_OPS: readonly UnaryOp[];
const FUNC_OPS: readonly FuncOp[];
const ALL_NODE_KEYS: readonly NodeKey[];
```

## `isLiteral(value)` / `nodeKey(node)`

```ts
function isLiteral(value: unknown): value is number | boolean;
function nodeKey<E>(node: FormulaExpr<E>): NodeKey | 'leaf' | 'literal';
```

`nodeKey` returns the operator key of a node, `'literal'` for numbers and booleans, and `'leaf'` for extension nodes.

## `parseFormula<E>(source)`

Parses a formula string into a `FormulaExpr<E>`.

```ts
function parseFormula<E = never>(source: string): FormulaExpr<E>;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| source | `string` | — | The formula text. |

Grammar: numbers, booleans, `+ - * / %`, comparisons, `&& || !` plus word aliases `and`/`or`/`not`, ternary `?:`, dotted paths (`a.b.c` becomes `{ var: 'a.b.c' }`), and function calls limited to `FUNC_OPS`. The parser rejects strings, `null`, regexes, computed member access, bitwise operators, `===`, and unknown functions. It throws `FormulaError` with the offending `position`.

```ts
import { parseFormula } from '@openvtt/formula';

parseFormula('floor((str - 10) / 2)');
// { floor: [ { '/': [ { '-': [ { var: 'str' }, 10 ] }, 2 ] } ] }
```

## `toFormula<E>(expr)`

Serializes an expression back to a string with minimal parentheses.

```ts
function toFormula<E = never>(expr: FormulaExpr<E>): string;
```

Precedence levels: `or = 1`, `and = 2`, equality = 3, relational = 4, additive = 5, multiplicative = 6, unary = 7, ternary = 0. `-0` prints as `0`.

```ts
toFormula(parseFormula('(a + b) * c')); // '(a + b) * c'
toFormula(parseFormula('a + b * c'));   // 'a + b * c'
```

## `extractVariables<E>(expr)`

Returns the deduplicated list of variable paths referenced by the expression.

```ts
function extractVariables<E>(expr: FormulaExpr<E>): readonly string[];

extractVariables(parseFormula('str + max(con, 10)')); // ['str', 'con']
```

## `evaluateFormula<E>(expr, options?)`

Evaluates an expression against a scope. Returns `number | boolean`.

```ts
function evaluateFormula<E = never>(
  expr: FormulaExpr<E>,
  options?: {
    scope?: Scope;
    onLeaf?: LeafHandler<E>;
  },
): number | boolean;

type Scope = Record<string, unknown> | undefined;
type LeafHandler<E> = (leaf: E, scope: Scope) => number | boolean;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| expr | `FormulaExpr<E>` | — | The expression to evaluate. |
| options.scope | `Scope` | `undefined` | Variable bindings. |
| options.onLeaf | `LeafHandler<E>` | `undefined` | Handler for extension leaf nodes. |

`and`/`or` short-circuit. Division or modulo by zero throws `FormulaError`. Unknown (extension) nodes delegate to `onLeaf`; without a handler they throw.

```ts
import { parseFormula, evaluateFormula } from '@openvtt/formula';

const expr = parseFormula('floor((str - 10) / 2)');
evaluateFormula(expr, { scope: { str: 16 } }); // 3
```

### Custom leaves

```ts
import { evaluateFormula } from '@openvtt/formula';

type Leaf = { roll: { sides: number } };
const expr = { '+': [1, { roll: { sides: 6 } }] } as FormulaExpr<Leaf>;

evaluateFormula<Leaf>(expr, {
  onLeaf: (leaf) => Math.ceil(Math.random() * leaf.roll.sides),
});
```

## Scope helpers

```ts
function resolvePath(scope: Scope, path: string): unknown;
function toNumber(value: unknown): number;
function isTruthy(value: unknown): boolean;
```

- `resolvePath` checks for an exact key first, then walks the path dot by dot.
- `toNumber`: booleans become `0`/`1`, `null`/`undefined` become `0`, `NaN` becomes `0`.
- `isTruthy`: `0`, `NaN`, `''`, `null`, and `undefined` are falsy; everything else is truthy.

## `createFormulaSchema(extra?)` / `formulaSchema`

```ts
function createFormulaSchema(extra?: v.GenericSchema): v.GenericSchema;
const formulaSchema: v.GenericSchema;
```

A recursive Valibot schema (via `v.lazy`) that validates formula IR. Pass an `extra` schema to also accept extension leaves.

```ts
import * as v from 'valibot';
import { formulaSchema } from '@openvtt/formula';

const expr = v.parse(formulaSchema, JSON.parse(jsonFromDisk));
```

## `compileFormula(expr)`

JIT-compiles a pure formula to a native function via `new Function`.

```ts
type CompiledFormula = (scope?: Scope) => number | boolean;
function compileFormula(expr: PureFormula): CompiledFormula;
```

Throws for extension leaf nodes — only `PureFormula` trees can be compiled.

```ts
import { parseFormula, compileFormula, evaluateFormula } from '@openvtt/formula';

const expr = parseFormula('floor((str - 10) / 2)');
const fast = compileFormula(expr);
fast({ str: 16 });                                    // 3
evaluateFormula(expr, { scope: { str: 16 } });        // 3 (same result)
```

## `createMemoizedEvaluator<E>(options?)`

Creates an evaluator that caches results per AST identity (WeakMap) keyed on the JSON values of the extracted variables.

```ts
function createMemoizedEvaluator<E = never>(options?: {
  onLeaf?: LeafHandler<E>;
}): (expr: FormulaExpr<E>, scope?: Scope) => number | boolean;
```

```ts
import { parseFormula, createMemoizedEvaluator } from '@openvtt/formula';

const evaluate = createMemoizedEvaluator();
const expr = parseFormula('str * 2 + con');
evaluate(expr, { str: 16, con: 12 }); // computed
evaluate(expr, { str: 16, con: 12 }); // cache hit
```

## `FormulaError`

```ts
interface FormulaErrorOptions {
  position?: number;
  input?: string;
  cause?: unknown;
}

class FormulaError extends Error {
  position?: number;
  input?: string;
  constructor(message: string, options?: FormulaErrorOptions);
  toString(): string; // appends position info when available
}
```

## Related

- [Formulas guide](../guides/formulas.md)
- [@openvtt/dice-core](./dice-core.md) — embeds dice terms as formula leaves.
- [@openvtt/dice-notation](./dice-notation.md) — parses dice notation into `RollExpr`.
