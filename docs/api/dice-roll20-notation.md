# @openvtt/dice-roll20-notation

Roll20 dice notation dialect. Parses Roll20-style sigils (`!`, `!!`, `!p`, `ro`, `r`, ...) and `@{attribute}` references into the canonical `@openvtt/dice-core` `RollExpr` IR, and serializes IR back to Roll20 sigils. The API shape mirrors `@openvtt/dice-notation`, plus an `isFunctionName` helper and an additional `pipe` token type.

**Version:** 0.1.0
**Dependencies:** `@openvtt/dice-core`

## Installation

```bash
bun add @openvtt/dice-roll20-notation
```

```ts
import { fromFormula, toFormula } from '@openvtt/dice-roll20-notation';
```

See the [Notation dialects guide](../guides/notation-dialects.md) for a side-by-side comparison of dialects.

## `fromFormula(source)`

Parses Roll20 dialect notation into a `RollExpr`. Throws `Roll20NotationError` on invalid syntax.

```ts
function fromFormula(source: string): RollExpr;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| source | `string` | — | Roll20-style notation, e.g. `'5d10>6'`. |

```ts
import { fromFormula } from '@openvtt/dice-roll20-notation';

fromFormula('2d6r<=2');  // reroll-recursive on <= 2
fromFormula('2d6ro<=2'); // reroll-once on <= 2
```

## `toFormula(expr)`

Serializes a `RollExpr` back to Roll20 sigils.

```ts
function toFormula(expr: RollExpr): string;

toFormula(fromFormula('4d10cs>=8')); // '4d10>=8'
```

Serialization rules: `reroll-once` -> `ro`, `reroll-recursive` -> `r`, `explode` -> `!`, `explode-compound` -> `!!`, `explode-penetrating` -> `!p`, `count-failure` -> `f`, `sort-asc` -> `sa`, `sort-desc` -> `sd`. `count-success` serializes as a bare comparison when it has exactly one, otherwise as `cs`.

## `tokenize(source)` / `isFunctionName(name)`

```ts
function tokenize(source: string): Token[];
function isFunctionName(name: string): boolean;

type TokenType =
  | 'num' | 'word'
  | 'plus' | 'dash' | 'star' | 'slash' | 'percent'
  | 'lparen' | 'rparen' | 'lbrace' | 'rbrace'
  | 'comma' | 'colon' | 'question' | 'bang'
  | 'at' | 'dot' | 'pipe'
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

The `pipe` token type supports Roll20's `@{character|level}` attribute syntax.

## Constants

```ts
const MODIFIER_PATTERNS: readonly unknown[];
const FUNCTIONS: readonly string[];
```

## Sigil table

### Parser (sigil to canonical op)

| Sigil | Canonical op |
|-------|--------------|
| `!!` | `explode-compound` |
| `!p` | `explode-penetrating` |
| `!` | `explode` |
| `kh`, `k` | `keep-highest` |
| `kl` | `keep-lowest` |
| `dh` | `drop-highest` |
| `dl`, `d` | `drop-lowest` |
| `ro` | `reroll-once` |
| `r` | `reroll-recursive` (opposite of Foundry) |
| `cs` | `count-success` |
| `cf`, `f` | `count-failure` |
| `s`, `sa` | `sort-asc` |
| `sd` | `sort-desc` |

## Dialect specifics

- Faces: number, `%` percentile, `F`/`fate` (no coin).
- Dynamic count and faces via expressions.
- Bare comparison after a die implicitly inserts `count-success`: `5d10>6` counts dice `> 6`.
- Implicit comparisons combine with modifiers: `5d10>7f<1` counts successes `> 7` and failures `< 1`.
- Explode accepts an optional numeric cap before the comparison: `2d6!3>5` explodes at most 3 times on `> 5`.
- Attributes: `@{strength}` becomes `{ var: 'strength' }`; `@{character|level}` becomes `{ var: 'character.level' }` (pipe becomes a dot). The serializer prints `@{path.with.dots}`.
- Comments: everything after `#` is ignored.
- Not supported: `min`/`max`/`clamp` modifiers, `margin-success`, `count-even`, `count-odd`, `deduct-failure`, `subtract-failure`, `explode-once`.

## Errors

```ts
class Roll20NotationError extends Error {
  position?: number;
  input?: string;
}
```

## Examples

### Reroll variants

```ts
fromFormula('2d6r<=2');  // modifiers: [{ op: 'reroll-recursive', compare: { op: '<=', value: 2 } }]
fromFormula('2d6ro<=2'); // modifiers: [{ op: 'reroll-once', compare: { op: '<=', value: 2 } }]
```

### Implicit count-success

```ts
fromFormula('5d10>6');
// modifiers: [{ op: 'count-success', compare: { op: '>', value: 6 } }]
```

### Attribute references

```ts
fromFormula('@{character|level}');
// { var: 'character.level' }
```

### Round trip

```ts
toFormula(fromFormula('4d10cs>=8')); // '4d10>=8'
```

### Evaluation

```ts
import { fromFormula } from '@openvtt/dice-roll20-notation';
import { evaluateRoll } from '@openvtt/dice-core';

const expr = fromFormula('1d20 + @{strength}');
const result = evaluateRoll(expr, {
  rng: () => 0.95,
  scope: { strength: 4 },
});
result.value; // 24
```

## Related

- [Notation dialects guide](../guides/notation-dialects.md)
- [@openvtt/dice-notation](./dice-notation.md) — canonical notation.
- [@openvtt/dice-foundry-notation](./dice-foundry-notation.md) — Foundry dialect.
- [@openvtt/dice-core](./dice-core.md) — the IR and evaluator.
