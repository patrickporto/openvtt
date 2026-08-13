# Notation dialects

openvtt ships three notation packages that all parse into the same `RollExpr` IR from `@openvtt/dice-core`:

| Package | Dialect | Use it for |
|---|---|---|
| `@openvtt/dice-notation` | Canonical | Internal storage, new UIs, anything you control |
| `@openvtt/dice-foundry-notation` | Foundry VTT | Importing rolls/macros from Foundry |
| `@openvtt/dice-roll20-notation` | Roll20 | Importing rolls/macros from Roll20 |

Because all three produce the same IR, you can parse in one dialect and serialize in another — the packages are lossless converters, not just parsers.

- API references: [dice-notation](../api/dice-notation.md), [dice-foundry-notation](../api/dice-foundry-notation.md), [dice-roll20-notation](../api/dice-roll20-notation.md)
- Background: [Dice rolling](dice-rolling.md)

Each package exports the same trio: `fromFormula(source)`, `toFormula(expr)`, and `tokenize(source)`, plus a dialect-specific error class (`NotationError`, `FoundryNotationError`, `Roll20NotationError`).

## Sigil mapping

| Canonical op | Canonical syntax | Foundry sigil | Roll20 sigil |
|---|---|---|---|
| `keep-highest` | `keep-highest3`, `kh3` | `kh3`, `k3` | `kh3`, `k3` |
| `keep-lowest` | `keep-lowest3`, `kl3` | `kl3` | `kl3` |
| `drop-highest` | `drop-highest1`, `dh1` | `dh1` | `dh1` |
| `drop-lowest` | `drop-lowest1`, `dl1` | `dl1`, `d1` | `dl1`, `d1` |
| `reroll-once` | `reroll-once<=2` | `r<=2` | `ro<=2` |
| `reroll-recursive` | `reroll-recursive<=2` | `rr<=2` | `r<=2` |
| `explode` | `explode`, `!` | `x` | `!` |
| `explode-once` | `explode-once` | `xo` | — |
| `explode-compound` | `explode-compound`, `!!` | — | `!!` |
| `explode-penetrating` | `explode-penetrating` | — | `!p` |
| `min` / `max` | `min2` / `max4` | `min2` / `max4` | — |
| `count-success` | `count-success>=8`, `cs>=8` | `cs>=8` | `cs>=8` (usually implicit, see below) |
| `count-failure` | `count-failure<3`, `cf<3` | `cf<3` | `f<3`, `cf<3` |
| `deduct-failure` | `deduct-failure<3`, `df<3` | `df<3` | — |
| `subtract-failure` | `subtract-failure<3`, `sf<3` | — | — |
| `count-even` / `count-odd` | `count-even` / `count-odd` | — | — |
| `margin-success` | `margin-success10`, `ms10` | `ms10` | — |
| `sort-asc` | `sort-asc`, `sa` | — | `sa`, `s` |
| `sort-desc` | `sort-desc`, `sd` | — | `sd` |

A dash means the dialect has no sigil for that op; serializing such an IR node in that dialect will throw.

## Dangerous differences

These are the cases where the **same text means different things** in different dialects. They are exactly why the canonical parser rejects ambiguous sigils.

### `r`, `rr`, `ro` are flipped between Foundry and Roll20

| Text | Foundry parses as | Roll20 parses as |
|---|---|---|
| `2d6r1` | `reroll-once<=1` | **`reroll-recursive<=1`** |
| `2d6rr1` | `reroll-recursive<=1` | — (not supported) |
| `2d6ro1` | — (not supported) | `reroll-once<=1` |

Importing a Roll20 macro with the Foundry parser (or vice versa) silently changes reroll semantics. Always parse with the dialect the text was written in.

### Roll20 implicit success counting

In Roll20, a bare comparison after a dice term means "count successes":

```ts
import { fromFormula } from '@openvtt/dice-roll20-notation';

fromFormula('5d10>6');
// Pool-less die term with modifiers: [{ op: 'count-success', compare: { op: '>', value: 6 } }]
```

The same text is a syntax error in the canonical and Foundry parsers, where comparisons must use the explicit `cs`/`count-success` form. Similarly, Roll20's `f<3` is failure counting (`count-failure`), while in Foundry `df` is **deduct-failure** (successes − failures) — a different number.

### `4df` means two different things in Foundry

```ts
import { fromFormula } from '@openvtt/dice-foundry-notation';

fromFormula('4df');    // 4 FATE dice: faces { kind: 'fate' }  (−1 / 0 / +1)
fromFormula('4d6df');  // 4d6 with the deduct-failure modifier
```

Position matters: `df` directly after the count is the fate-die faces spec; `df` after a faces spec is the modifier. The canonical dialect avoids this collision entirely — fate is `dF` and deduct-failure is spelled `deduct-failure` or `df` only as a modifier.

### Attribute references

| Dialect | Syntax | Parsed `var` path |
|---|---|---|
| Canonical | `@abilities.str.mod` | `abilities.str.mod` |
| Foundry | `@abilities.str.mod` | `abilities.str.mod` |
| Roll20 | `@{strength_mod}`, `@{character|level}` | `strength_mod`, `character.level` |

Roll20 wraps attributes in `@{...}` and uses **pipes** for nesting; the parser converts `@{character|level}` to the dotted path `character.level` so scope resolution is uniform. When serializing to Roll20, dotted paths inside `@{...}` are written back with pipes.

## Capability matrix

| Capability | Canonical | Foundry | Roll20 |
|---|---|---|---|
| All 21 modifier ops | yes | 14 ops (see sigil table) | 13 ops |
| Full modifier names as fallback | yes | no | no |
| Pools `{...}` | yes | yes | yes |
| Percentile `d%` | yes | yes | yes |
| Fate dice `dF` | yes (`dF`) | yes (`df`) | yes (`dF`) |
| Coin dice `dcoin` | yes | yes (`dcoin`) | no |
| Expression faces `d(x)` | yes | yes | yes |
| Implicit success comparison | no | no | yes (`5d10>6`) |
| Ambiguous sigils (`r`, `k`, `d`, `s`) | rejected with error | accepted (Foundry meaning) | accepted (Roll20 meaning) |
| Variable paths | `@path.to.value` | `@path.to.value` | `@{path|to|value}` |

## Converting between dialects

The workflow is always: parse with the source dialect into the shared IR, then serialize with the target dialect:

```ts
import { fromFormula as fromFoundry } from '@openvtt/dice-foundry-notation';
import { toFormula as toRoll20 } from '@openvtt/dice-roll20-notation';
import { toFormula as toCanonical, fromFormula as fromCanonical } from '@openvtt/dice-notation';

// Foundry -> Roll20: reroll sigils get translated correctly
const ir = fromFoundry('2d6r1');     // reroll-once<=1
toRoll20(ir);                        // '2d6ro1'  — same semantics, Roll20 spelling

// Roll20 -> canonical: implicit successes become explicit
import { fromFormula as fromRoll20 } from '@openvtt/dice-roll20-notation';
toCanonical(fromRoll20('5d10>6'));   // '5d10cs>6'
```

Two caveats:

1. **Not every IR is expressible in every dialect.** Serializing `explode-penetrating` or `count-even` to Foundry throws because Foundry has no sigil. Convert to canonical first if you need a guaranteed target.
2. **Semantics are preserved, text is not.** `toFormula` picks each dialect's canonical sigil (`reroll-once` → `r` in Foundry, `ro` in Roll20), so round-tripping `from → to → from` yields equal IR, not necessarily equal strings.

## Examples

```ts
// Foundry: exploding attack roll with a keep
import { fromFormula, toFormula } from '@openvtt/dice-foundry-notation';
const expr = fromFormula('1d20x + 4d6kh3');
toFormula(expr);   // '1d20x + 4d6kh3' (round-trip stable)

// Roll20: FATE dice with ascending sort, from a macro
import { fromFormula as r20 } from '@openvtt/dice-roll20-notation';
r20('4dFs');

// Canonical: safe for storage and for your own UI
import { fromFormula as canon } from '@openvtt/dice-notation';
canon('4d6drop-lowest1');        // full names always work
canon('4d6d1');                  // NotationError: ambiguous alias "d"
```

## When to use which

- **Storing roll definitions** (sheet templates, saved macros): canonical. It is total (covers all 21 ops), unambiguous, and safe to re-parse forever.
- **Accepting pasted Foundry macros**: `@openvtt/dice-foundry-notation`, then optionally `toFormula` to canonical for storage.
- **Accepting pasted Roll20 macros**: `@openvtt/dice-roll20-notation`. Remember implicit comparisons become `count-success` — evaluate the result and you get the number of successes, as Roll20 users expect.
- **Generating text for an external tool**: serialize with that tool's dialect package.
