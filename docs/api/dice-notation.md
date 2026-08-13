# @openvtt/dice-notation

Canonical, unambiguous dice notation parser and serializer. Produces the `@openvtt/dice-core` `RollExpr` IR from text and prints IR back to canonical long-form notation. Ambiguous shorthand aliases are rejected with helpful errors so saved rolls stay explicit.

**Version:** 0.1.0
**Dependencies:** `@openvtt/dice-core`

## Installation

```bash
bun add @openvtt/dice-notation
```

```ts
import { fromFormula, toFormula } from '@openvtt/dice-notation';
```

See the [Notation dialects guide](../guides/notation-dialects.md) for a comparison with the Foundry and Roll20 dialects, and the [Dice rolling guide](../guides/dice-rolling.md) for evaluation.

## `fromFormula(source)`

Parses canonical notation into a `RollExpr`.

```ts
function fromFormula(source: string): RollExpr;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| source | `string` | — | Notation text, e.g. `'4d6keep-highest3'`. |

Throws `NotationError` (with `position` and `input`) on invalid syntax or ambiguous aliases.

```ts
import { fromFormula } from '@openvtt/dice-notation';

fromFormula('4d6keep-highest3');
// { type: 'die', count: 4, faces: { kind: 'number', value: 6 },
//   modifiers: [{ op: 'keep-highest', count: 3 }] }
```

## `toFormula(expr)`

Serializes a `RollExpr` back to canonical long-form notation.

```ts
function toFormula(expr: RollExpr): string;

toFormula(fromFormula('4d6kh3')); // '4d6keep-highest3'
```

The serializer always emits canonical long names, never aliases.

## `tokenize(source)`

Low-level tokenizer, useful for tooling and syntax highlighting.

```ts
function tokenize(source: string): Token[];

type TokenType =
  | 'num' | 'word'
  | 'plus' | 'dash' | 'star' | 'slash' | 'percent'
  | 'lparen' | 'rparen' | 'lbrace' | 'rbrace'
  | 'comma' | 'colon' | 'question' | 'bang'
  | 'at' | 'dot'
  | 'eq' | 'gt' | 'ge' | 'lt' | 'le'
  | 'eof';

interface Token {
  type: TokenType;
  text: string;
  value?: number;
  start: number;
  end: number;
}
```

## Constants

```ts
const MODIFIER_PATTERNS: readonly unknown[];
const FUNCTIONS: readonly ['floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp'];
const AMBIGUOUS_ALIASES: readonly ['r', 'rr', 'ro', 'k', 'd', 's'];
```

Ambiguous aliases (`r`, `rr`, `ro`, `k`, `d`, `s`) throw a `NotationError` telling the user to use the full canonical name, because their meaning differs between dialects.

## Grammar

- Arithmetic with precedence: `* /` bind tighter than `+ -`; unary `-` supported.
- Dice terms `NdX` with implicit count (`d20` is `1d20`).
- Faces: number (`d20`), `%` percentile (`d%`), `F`/`fate` fate dice, `coin`/`c` coin flips, and parenthesized expression faces or counts (`(1+1)d(8)`).
- Pools: `{expr, expr}` followed by optional modifiers.
- Variables: `@path.to.data` becomes `{ var: 'path.to.data' }`.
- Functions: `floor`, `ceil`, `round`, `abs`, `min`, `max`, `clamp`.
- Comments: everything after `#` is ignored.
- Comparisons `= > >= < <=` accept numbers, `(expr)`, or `@path` values.

## Modifier aliases

Canonical long names are always accepted. These short aliases are also unambiguous and accepted:

| Alias | Canonical op |
|-------|--------------|
| `kh` | `keep-highest` |
| `kl` | `keep-lowest` |
| `dh` | `drop-highest` |
| `dl` | `drop-lowest` |
| `!` | `explode` |
| `!!` | `explode-compound` |
| `cs` | `count-success` |
| `cf` | `count-failure` |
| `df` | `deduct-failure` |
| `sf` | `subtract-failure` |
| `ms` | `margin-success` |
| `sa` | `sort-asc` |
| `sd` | `sort-desc` |

## Errors

```ts
interface NotationErrorOptions {
  position?: number;
  input?: string;
  cause?: unknown;
}

class NotationError extends Error {
  position?: number;
  input?: string;
  constructor(message: string, options?: NotationErrorOptions);
}
```

## Examples

### Reroll with comparison

```ts
fromFormula('2d6reroll-once<=2');
// modifiers: [{ op: 'reroll-once', compare: { op: '<=', value: 2 } }]
```

### Pool with keep

```ts
fromFormula('{2d6, 1d8}keep-highest2');
// { type: 'pool', entries: [2d6, 1d8], modifiers: [{ op: 'keep-highest', count: 2 }] }
```

### Variables and functions

```ts
fromFormula('floor((@str - 10) / 2)');
// { floor: [ { '/': [ { '-': [ { var: 'str' }, 10 ] }, 2 ] } ] }
```

### End to end

```ts
import { fromFormula } from '@openvtt/dice-notation';
import { evaluateRoll } from '@openvtt/dice-core';

const expr = fromFormula('1d20 + @abilities.str.mod');
const result = evaluateRoll(expr, {
  rng: () => 0.95,
  scope: { abilities: { str: { mod: 3 } } },
});
result.value; // 23
```

## Related

- [Notation dialects guide](../guides/notation-dialects.md)
- [@openvtt/dice-core](./dice-core.md) — the IR and evaluator.
- [@openvtt/dice-foundry-notation](./dice-foundry-notation.md) and [@openvtt/dice-roll20-notation](./dice-roll20-notation.md) — dialect variants.
