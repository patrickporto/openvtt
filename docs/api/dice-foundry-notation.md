# @openvtt/dice-foundry-notation

Foundry VTT dice notation dialect. Parses Foundry-style sigils (`r`, `x`, `kh`, `df`, ...) into the canonical `@openvtt/dice-core` `RollExpr` IR, and serializes IR back to Foundry sigils. The API shape mirrors `@openvtt/dice-notation`.

**Version:** 0.1.0
**Dependencies:** `@openvtt/dice-core`

## Installation

```bash
bun add @openvtt/dice-foundry-notation
```

```ts
import { fromFormula, toFormula } from '@openvtt/dice-foundry-notation';
```

See the [Notation dialects guide](../guides/notation-dialects.md) for a side-by-side comparison of dialects.

## `fromFormula(source)`

Parses Foundry dialect notation into a `RollExpr`. Throws `FoundryNotationError` on invalid syntax.

```ts
function fromFormula(source: string): RollExpr;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| source | `string` | — | Foundry-style notation, e.g. `'2d6r1'`. |

```ts
import { fromFormula } from '@openvtt/dice-foundry-notation';

fromFormula('2d6r1');
// modifiers: [{ op: 'reroll-once', compare: { op: '=', value: 1 } }]
```

## `toFormula(expr)`

Serializes a `RollExpr` back to Foundry sigils using `CANONICAL_TO_SIGIL`. Fate faces print as `f`, coin faces as `c`.

```ts
function toFormula(expr: RollExpr): string;

toFormula(fromFormula('4df')); // '4df'
```

## `tokenize(source)`

Low-level tokenizer with the same token model as the canonical dialect.

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

## Sigil table

### Parser (sigil to canonical op)

| Sigil | Canonical op |
|-------|--------------|
| `rr` | `reroll-recursive` |
| `r` | `reroll-once` (opposite of Roll20) |
| `xo` | `explode-once` |
| `x` | `explode` |
| `kh`, `k` | `keep-highest` |
| `kl` | `keep-lowest` |
| `dh` | `drop-highest` |
| `dl`, `d` | `drop-lowest` |
| `cs` | `count-success` |
| `cf` | `count-failure` |
| `df` | `deduct-failure` |
| `ms` | `margin-success` |
| `min` | `min` |
| `max` | `max` |

### Serializer

`CANONICAL_TO_SIGIL` maps canonical ops back to Foundry sigils (`keep-highest` -> `kh`, etc.).

```ts
const CANONICAL_TO_SIGIL: Record<string, string>;
const MODIFIER_PATTERNS: readonly unknown[];
const FUNCTIONS: readonly ['floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp'];
```

## Dialect specifics

- Faces: number, `%` percentile, `f`/`F`/`fate`, `c`/`coin`, and parenthesized expressions.
- Position matters: `4df` rolls 4 fate dice (`df` in the faces position), while `4d6df` applies the `deduct-failure` modifier to 4d6.
- Bare numeric reroll: `2d6r1` means `reroll-once` on `= 1`.
- Variables: `@path.to.data` becomes `{ var: 'path.to.data' }`.
- Pools `{expr, expr}` are supported.
- Not supported: `explode-compound`, `explode-penetrating`, `sort-asc`, `sort-desc`, `count-even`, `count-odd`, `subtract-failure`.

## Errors

```ts
class FoundryNotationError extends Error {
  position?: number;
  input?: string;
}
```

## Examples

### Fate dice vs deduct-failure

```ts
fromFormula('4df');   // 4 fate dice (faces position)
fromFormula('4d6df'); // 4d6 with deduct-failure modifier
```

### Explode with comparison

```ts
fromFormula('1d6x>=5');
// modifiers: [{ op: 'explode', compare: { op: '>=', value: 5 } }]
```

### Round trip

```ts
toFormula(fromFormula('4df')); // '4df'
```

### Evaluation

```ts
import { fromFormula } from '@openvtt/dice-foundry-notation';
import { evaluateRoll, createRng } from '@openvtt/dice-core';

const expr = fromFormula('4d6kh3');
const result = evaluateRoll(expr, { rng: createRng('seed') });
result.terms[0].applied; // ['keep-highest']
```

## Related

- [Notation dialects guide](../guides/notation-dialects.md)
- [@openvtt/dice-notation](./dice-notation.md) — canonical notation.
- [@openvtt/dice-roll20-notation](./dice-roll20-notation.md) — Roll20 dialect.
- [@openvtt/dice-core](./dice-core.md) — the IR and evaluator.
