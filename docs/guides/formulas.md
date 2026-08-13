# Formulas

`@openvtt/formula` is the expression engine underneath everything else in openvtt. Character sheet derived values, effect conditions, change values, and the arithmetic in dice expressions are all formulas. It has two faces:

- A **text language** (`1 + 2 * floor(x / 2)`, `a and not b`) parsed by `parseFormula`.
- A **JSON-logic-shaped AST** (`FormulaExpr`) that is serializable, validatable with Valibot, and extensible with custom leaf nodes.

- [API reference](../api/formula.md)

## The expression language

`parseFormula(source)` turns text into a `FormulaExpr`:

| Feature | Syntax | Example |
|---|---|---|
| Arithmetic | `+ - * / %`, unary `-` | `1 + 2 * 3` |
| Comparisons | `== != < <= > >=` | `level >= 5` |
| Logic | `&& \|\| !` **or** word aliases `and or not` | `proficient and level >= 5` |
| Ternary | `cond ? a : b` | `hp > 0 ? 'up' : 'down'` |
| Functions | `floor ceil round abs min max clamp` | `floor(@abilities.str.score / 2) - 5` |
| Variables | dotted paths | `abilities.str.mod`, `flags.rage` |
| Parentheses | `( ... )` | `(1 + 2) * 3` |

Literals are numbers and booleans. Variable paths are resolved against a scope object with `resolvePath`, so `abilities.str.mod` walks `scope.abilities.str.mod`.

## The AST: `FormulaExpr`

The AST is deliberately JSON-logic-shaped — every node is a literal, a `{ var: path }`, or a single-key object mapping an operator to its operands. That makes trees trivially serializable, diffable, and validatable.

```ts
import { parseFormula } from '@openvtt/formula';

parseFormula('1 + 2 * 3');
// { '+': [1, { '*': [2, 3] }] }

parseFormula('hp.max > 0 and not flags.dead');
// { and: [ { '>': [ { var: 'hp.max' }, 0 ] }, { '!': [ { var: 'flags.dead' } ] } ] }

parseFormula('a > 0 ? a : -a');
// { if: [ { '>': [{ var: 'a' }, 0] }, { var: 'a' }, { '-': [{ var: 'a' }] } ] }
```

Node keys: the 11 binary operators, `and`, `or`, `!`, `if`, `var`, and the 7 functions (`floor`, `ceil`, `round`, `abs`, `min`, `max`, `clamp`). `min`/`max` take any number of args; `clamp` takes exactly three (value, lo, hi).

`FormulaExpr<E>` is generic over an extension leaf type `E`. With `E = never` you get `PureFormula` — the closed language. `@openvtt/dice-core` plugs dice terms in as leaves (see [Custom leaf nodes](#custom-leaf-nodes)).

## Round-tripping: `toFormula`

`toFormula(expr)` serializes an AST back to source text with correct precedence:

```ts
import { parseFormula, toFormula } from '@openvtt/formula';

const expr = parseFormula('1 + 2 * floor(x / 2)');
toFormula(expr);   // "1 + 2 * floor(x / 2)"
```

`toFormula(parseFormula(s))` is a stable normalization — handy for canonicalizing user input before storage.

## Evaluation: `evaluateFormula`

```ts
import { evaluateFormula } from '@openvtt/formula';

evaluateFormula(parseFormula('floor((str - 10) / 2)'), {
  scope: { str: 16 },
});
// 3
```

Semantics worth knowing:

- **Coercion** — arithmetic coerces operands with `toNumber`: `null`/`undefined` → `0`, booleans → `0`/`1`, numeric strings are parsed, anything else → `0`. A missing variable path therefore evaluates as `0` in arithmetic rather than throwing.
- **Truthiness** — `isTruthy`: booleans as-is; numbers are truthy when non-zero and non-NaN; `null`/`undefined` are falsy; strings are truthy when non-empty; objects are always truthy.
- **Short-circuit** — `and`/`or`/`if` evaluate lazily.
- **Division by zero** throws `FormulaError('Division by zero')` (and `Modulo by zero` for `%`).

### `resolvePath`, `toNumber`, `isTruthy`

These three helpers are exported so your own code can match engine semantics exactly:

```ts
import { resolvePath, toNumber, isTruthy } from '@openvtt/formula';

resolvePath({ a: { b: 2 } }, 'a.b');   // 2
resolvePath({ a: {} }, 'a.b.c');       // undefined (no throw)
toNumber(null);                        // 0
toNumber(true);                        // 1
isTruthy('');                          // false
```

Note `resolvePath` first checks for an exact own-property match of the full path, so keys containing dots still work.

## `extractVariables`

```ts
import { extractVariables, parseFormula } from '@openvtt/formula';

extractVariables(parseFormula('str.mod + max(level, 1)'));
// ['str.mod', 'level']
```

This powers dependency analysis: `@openvtt/sheet` uses it to topologically order derived values and to detect effect-condition cycles.

## `compileFormula` vs `evaluateFormula`

`evaluateFormula` is a tree-walking interpreter — fine for occasional evaluation. `compileFormula` JIT-compiles a **pure** formula (no custom leaves) into a native function via `new Function`, which is dramatically faster in tight loops:

```ts
import { compileFormula, parseFormula } from '@openvtt/formula';

const fn = compileFormula(parseFormula('floor((str - 10) / 2) + prof'));
fn({ str: 16, prof: 3 });   // 6
```

Use `compileFormula` when the same formula is evaluated many times against changing scopes (combat tickers, batch NPC stat computation). The compiled function has the same coercion/truthiness semantics as the interpreter.

## `createMemoizedEvaluator`

Caches results per AST object, keyed on the current values of the variables the formula reads:

```ts
import { createMemoizedEvaluator, parseFormula } from '@openvtt/formula';

const evaluate = createMemoizedEvaluator();
const expr = parseFormula('expensive.path * 2');

evaluate(expr, { expensive: { path: 21 } });   // computes
evaluate(expr, { expensive: { path: 21 } });   // cache hit — same variable values
evaluate(expr, { expensive: { path: 10 } });   // recomputes
```

The cache is a `WeakMap` keyed by the AST object identity, so it never leaks parsed trees. Reuse AST objects (parse once, evaluate often) to get hits.

## Validation: `formulaSchema` / `createFormulaSchema`

Both are Valibot schemas you can embed in your own contracts:

```ts
import * as v from 'valibot';
import { formulaSchema, createFormulaSchema } from '@openvtt/formula';

const SaveFileSchema = v.object({
  version: v.number(),
  derived: v.record(v.string(), formulaSchema),          // pure formulas only
});

// accept dice leaves too (this is what @openvtt/dice-core's rollSchema does):
const rollExprSchema = createFormulaSchema(myDiceLeafSchema);
```

`createFormulaSchema(extra)` extends the recursive union with one additional leaf schema. See [Dice rolling](dice-rolling.md#validating-rolls-with-rollschema) for the concrete dice case.

## Custom leaf nodes

`evaluateFormula<E>` accepts an `onLeaf` handler that is invoked for any node that is not a built-in operator. This is the extension point that turns the formula engine into a dice engine:

```ts
import { evaluateFormula } from '@openvtt/formula';

interface Tile { type: 'tile'; suit: string; rank: number }

const value = evaluateFormula<Tile>(
  { '+': [{ type: 'tile', suit: 'dots', rank: 5 }, 3] },
  {
    onLeaf: (leaf) => leaf.rank,
  },
);
// 8
```

`@openvtt/dice-core` uses exactly this: `RollExpr = FormulaExpr<DiceExpr>`, and its evaluator passes an `onLeaf` that rolls a `DieTerm`/`Pool` and returns its value. If a tree contains leaves and no `onLeaf` is provided, evaluation throws `FormulaError`.

## Errors: `FormulaError`

```ts
import { FormulaError, parseFormula } from '@openvtt/formula';

try {
  parseFormula('1 +');
} catch (err) {
  if (err instanceof FormulaError) {
    err.position;   // character offset in the source
    err.input;      // the original source string
    String(err);    // includes a caret-style excerpt around the position
  }
}
```

`FormulaError` carries an optional `position` and `input`, and its `toString()` renders a `»` marker at the failure point — useful for surfacing parse errors in editors. It is thrown for parse failures, division/modulo by zero, unknown operators, and unhandled leaf nodes.
