# Dice rolling

This guide covers the headless dice stack: `@openvtt/dice-core` (the IR and evaluator) and `@openvtt/dice-notation` (the canonical text syntax). For the 3D animated roller see [3D dice](3d-dice.md); for Foundry/Roll20 syntax see [Notation dialects](notation-dialects.md).

- API references: [dice-core](../api/dice-core.md), [dice-notation](../api/dice-notation.md)

## The big picture

```
text ──fromFormula──▶ RollExpr (IR) ──evaluateRoll──▶ RollResult
     @openvtt/dice-notation            @openvtt/dice-core
```

`RollExpr` is defined as `FormulaExpr<DiceExpr>`: the [formula AST](formulas.md#the-ast-formulaexpr) extended with two dice leaf nodes. That means any dice expression can contain full formula arithmetic, variable paths, functions, and comparisons — and any formula can contain dice.

## The IR

### DieTerm and Pool

```ts
import type { DieTerm, Pool, FacesSpec, Modifier } from '@openvtt/dice-core';

const fourD6Keep3: DieTerm = {
  type: 'die',
  count: 4,                                     // a RollExpr — numbers, formulas, anything
  faces: { kind: 'number', value: 6 },
  modifiers: [{ op: 'keep-highest', count: 3 }],
};

const mixedPool: Pool = {
  type: 'pool',
  entries: [
    { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
    { type: 'die', count: 1, faces: { kind: 'number', value: 8 } },
  ],
  modifiers: [{ op: 'keep-highest', count: 2 }],
};
```

A **Pool** merges the dice of its entries into one shared group and applies the pool's modifiers across all of them. This is how `{2d6, 1d8}keep-highest2` keeps the two highest dice across *different* die types.

### FacesSpec

| Kind | Syntax | Behavior |
|---|---|---|
| `{ kind: 'number', value: n }` | `d6`, `d20` | 1..n |
| `{ kind: 'percentile' }` | `d%` | 1..100 |
| `{ kind: 'fate' }` | `dF` | −1, 0, or +1 |
| `{ kind: 'coin' }` | `dcoin` | 1 or 2 |
| `{ kind: 'expr', value: RollExpr }` | `d(level)` | sides computed from an expression |

### Modifier

```ts
interface Modifier {
  op: ModifierOp;
  count?: number;        // keep/drop counts
  value?: number;        // min/max clamp values
  target?: number;       // margin-success target
  cap?: number;          // explosion cap (default 100)
  compare?: Comparison;  // { op: '=' | '>' | '>=' | '<' | '<=', value: RollExpr }
}
```

## The 21 modifier ops

| Op | Meaning |
|---|---|
| `keep-highest` | Keep the N highest dice, drop the rest |
| `keep-lowest` | Keep the N lowest dice |
| `drop-highest` | Drop the N highest dice |
| `drop-lowest` | Drop the N lowest dice |
| `reroll-once` | Reroll matching dice once (default: `<=1`) |
| `reroll-recursive` | Keep rerolling matching dice until they stop matching |
| `explode` | On max (or comparison), roll an extra die, recursively |
| `explode-once` | Explode, but at most one extra die per original die |
| `explode-compound` | Explode recursively, accumulating into the same die's value |
| `explode-penetrating` | Explode recursively; each extra die is rolled − 1 |
| `min` | Clamp each die up to at least `value` |
| `max` | Clamp each die down to at most `value` |
| `count-success` | Result = number of kept dice matching the comparison (default `>0`) |
| `count-failure` | Result = number of kept dice matching the failure comparison (default `<=0`) |
| `deduct-failure` | Result = successes − failures |
| `subtract-failure` | Alias behavior of `deduct-failure` (successes − failures) |
| `count-even` | Result = number of kept dice with even values |
| `count-odd` | Result = number of kept dice with odd values |
| `margin-success` | Result = sum of kept dice − `target` |
| `sort-asc` | Order dice ascending (cosmetic; affects `rolls` order) |
| `sort-desc` | Order dice descending |

### Fixed structural application order

Modifiers are **not** applied in the order written. Structural modifiers (the ones that change which dice exist or are kept) always apply in this fixed order, regardless of source order:

```
reroll-once, reroll-recursive,
explode, explode-once, explode-compound, explode-penetrating,
min, max,
keep-highest, keep-lowest, drop-highest, drop-lowest,
sort-asc, sort-desc
```

Value-computing modifiers (`count-*`, `deduct/subtract-failure`, `margin-success`) then determine the term's value from the final dice. This makes `4d6drop-lowest1explode` mean the same thing everywhere: explode first, then drop.

### Success counting semantics

When any success-family modifier is present, dice outcomes are classified per kept die:

- Successes use the `count-success` comparison, defaulting to `>0`.
- Failures use the `count-failure` comparison (or the `deduct/subtract-failure` comparison), defaulting to `<=0`.

The term's value is then: `count-success` → number of successes; `count-failure` → number of failures; `deduct-failure`/`subtract-failure` → successes − failures. Each die's classification is visible as `outcome: 'success' | 'failure' | 'neutral'` on its `DieRoll`.

`margin-success` is different: it is plain sum-minus-target (`sum of kept dice − target`), so `3d6ms10` rolling 12 yields `2`.

## Canonical notation syntax

`@openvtt/dice-notation` parses the canonical, unambiguous syntax. Full modifier names (`keep-highest3`) always work, plus a curated set of aliases:

| Alias | Op | | Alias | Op |
|---|---|---|---|---|
| `kh` | `keep-highest` | | `df` | `deduct-failure` |
| `kl` | `keep-lowest` | | `sf` | `subtract-failure` |
| `dh` | `drop-highest` | | `ms` | `margin-success` |
| `dl` | `drop-lowest` | | `sa` | `sort-asc` |
| `!` | `explode` | | `sd` | `sort-desc` |
| `!!` | `explode-compound` | | `cs` / `cf` | `count-success` / `count-failure` |

Other syntax:

```text
2d6                  count + faces          d20, d% (percentile), dF (fate), dcoin
{2d6, 1d8}kh2        pools with modifiers
@abilities.str.mod   variable paths (resolved from scope)
floor(x / 2)         all @openvtt/formula functions
1d20 + 3 >= 15       comparisons evaluate to booleans
(2 + 1)d6            parenthesized count / faces expressions
```

**Ambiguous aliases are rejected.** The sigils `r`, `rr`, `ro`, `k`, `d`, `s` mean different things in Foundry and Roll20 (see [Notation dialects](notation-dialects.md)), so the canonical parser throws a `NotationError` telling you to use the full canonical name instead:

```ts
fromFormula('4d6r1');
// NotationError: Ambiguous alias "r" is rejected; use the full canonical name
```

## Evaluating rolls

```ts
import { fromFormula } from '@openvtt/dice-notation';
import { evaluateRoll } from '@openvtt/dice-core';

const result = evaluateRoll(fromFormula('4d6keep-highest3'), { seed: 'demo' });

result.value;    // number | boolean — the final value of the whole expression
result.id;       // UUID v7 for this roll
result.terms;    // TermResult[] — one per die term / pool, in evaluation order
result.rolls;    // DieRoll[] — flattened dice across all top-level terms
```

### DieRoll shape

Every physical die is recorded, including dropped and rerolled ones:

```ts
interface DieRoll {
  value: number;             // final face value
  kept: boolean;             // false when dropped by keep/drop modifiers
  exploded: boolean;         // born from an explosion
  rerolled: boolean;         // produced by (or discarded during) a reroll
  penetrated: boolean;       // produced by penetrating explosion
  outcome: 'success' | 'failure' | 'neutral';
  history: readonly number[];  // every face this die ever showed, in order
}
```

`TermResult` additionally carries `id` (UUID v7), `type: 'die' | 'pool'`, the term's `value`, its `dice`, the `applied` modifier op names, and — for pools — `children` term results.

### Deterministic rolls

Pass `seed` for reproducible rolls, or bring your own `rng` (any `() => number` returning `[0, 1)`); `createRng(seed)` builds a seeded one:

```ts
import { createRng, evaluateRoll } from '@openvtt/dice-core';

evaluateRoll(expr, { seed: 'session-42' });          // same result every time
evaluateRoll(expr, { rng: createRng('session-42') }); // equivalent
evaluateRoll(expr);                                   // random seed
```

Determinism covers the whole expression — dice, pools, explosions, and rerolls all draw from the same stream.

## Validating rolls with `rollSchema`

`rollSchema` is a Valibot schema for the full `RollExpr` IR (built on `createFormulaSchema` with dice leaves). Use it to validate persisted or user-supplied roll JSON:

```ts
import * as v from 'valibot';
import { rollSchema } from '@openvtt/dice-core';

const expr = v.parse(rollSchema, JSON.parse(savedJson));
```

## Worked examples

```ts
import { fromFormula } from '@openvtt/dice-notation';
import { evaluateRoll } from '@openvtt/dice-core';

// Standard stat roll: 4d6 drop the lowest
evaluateRoll(fromFormula('4d6keep-highest3'), { seed: 'demo' }).value;

// Reroll 1s and 2s, once
evaluateRoll(fromFormula('2d6reroll-once<=2'), { seed: 'demo' }).value;

// Count successes at 8+ (World of Darkness style)
const wod = evaluateRoll(fromFormula('4d10cs>=8'), { seed: 'demo' });
wod.value;                                            // e.g. 2
wod.rolls.map((d) => `${d.value}:${d.outcome}`);      // ['3:neutral', '8:success', ...]

// Mixed pool, keep best 2 dice overall
evaluateRoll(fromFormula('{2d6, 1d8}keep-highest2'), { seed: 'demo' }).value;

// End-to-end: dice + character data + arithmetic
const attack = fromFormula('1d20 + @abilities.str.mod');
const result = evaluateRoll(attack, {
  seed: 'demo',
  scope: { abilities: { str: { mod: 3 } } },
});
console.log(result.value);            // d20 + 3
console.log(result.rolls[0].value);   // the raw d20 face
```

Because `RollExpr` is a formula AST, you can also build expressions programmatically and serialize them back with `toFormula` from `@openvtt/dice-notation` — see [Notation dialects](notation-dialects.md#converting-between-dialects) for round-trip workflows.
