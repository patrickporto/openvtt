# @openvtt/dice-core

Canonical dice intermediate representation (IR) plus a seeded, deterministic evaluator. Dice terms are embedded in `@openvtt/formula` expressions as extension leaves, so rolls compose freely with arithmetic, comparisons, and variables. Every result carries full per-die history for auditing and rendering.

**Version:** 0.1.0
**Dependencies:** `@openvtt/formula`, `seedrandom`, `uuid`, `valibot`

## Installation

```bash
bun add @openvtt/dice-core
```

```ts
import { evaluateRoll, createRng } from '@openvtt/dice-core';
```

See the [Dice rolling guide](../guides/dice-rolling.md) for rolling strategies and the [Formulas guide](../guides/formulas.md) for the underlying expression model.

## IR types

```ts
type ComparisonOp = '=' | '>' | '>=' | '<' | '<=';

interface Comparison {
  op: ComparisonOp;
  value: RollExpr;
}

type ModifierOp =
  | 'keep-highest' | 'keep-lowest'
  | 'drop-highest' | 'drop-lowest'
  | 'reroll-once' | 'reroll-recursive'
  | 'explode' | 'explode-once' | 'explode-compound' | 'explode-penetrating'
  | 'min' | 'max'
  | 'count-success' | 'count-failure'
  | 'deduct-failure' | 'subtract-failure'
  | 'count-even' | 'count-odd'
  | 'margin-success'
  | 'sort-asc' | 'sort-desc';

const MODIFIER_OPS: readonly ModifierOp[]; // all 21 ops

interface Modifier {
  op: ModifierOp;
  count?: number;        // default 1
  value?: number;        // default 0
  target?: number;       // default 0
  cap?: number;          // default 100
  compare?: Comparison;
}

type FacesSpec =
  | { kind: 'number'; value: RollExpr }
  | { kind: 'percentile' }
  | { kind: 'fate' }
  | { kind: 'coin' }
  | { kind: 'expr'; value: RollExpr };

interface DieTerm {
  type: 'die';
  count: RollExpr;
  faces: FacesSpec;
  modifiers?: Modifier[];
}

interface Pool {
  type: 'pool';
  entries: RollExpr[];
  modifiers?: Modifier[];
}

type DiceExpr = DieTerm | Pool;
type RollExpr = FormulaExpr<DiceExpr>;

function isDiceExpr(expr: unknown): expr is DiceExpr;
```

`RollExpr` is the top-level roll type: a formula tree whose leaves may be dice terms or pools.

## Results

```ts
type DieOutcome = 'success' | 'failure' | 'neutral';

interface DieRoll {
  value: number;
  kept: boolean;
  exploded: boolean;
  rerolled: boolean;
  penetrated: boolean;
  outcome: DieOutcome;
  history: number[];
}

interface TermResult {
  id: string;                    // uuid v7
  type: 'die' | 'pool';
  value: number;
  dice: DieRoll[];
  applied: string[];             // applied modifier names
  children?: TermResult[];
}

interface RollResult {
  id: string;                    // uuid v7
  value: number | boolean;
  terms: TermResult[];
  rolls: DieRoll[];              // flattened across all terms
}
```

Construction helpers:

```ts
function makeDieRoll(value: number, extra?: Partial<DieRoll>): DieRoll;
type WorkingDie = DieRoll; // mutable working representation during evaluation
function toDieRoll(die: WorkingDie): DieRoll;
function freeze(result: RollResult): RollResult;
```

## RNG

```ts
type Rng = () => number; // returns values in [0, 1)

function createRng(seed?: string): Rng;
function rollInt(rng: Rng, sides: number): number;
```

`createRng` wraps `seedrandom`; pass the same seed to reproduce a roll exactly. `rollInt` returns `0` when `sides <= 0`, otherwise `floor(rng() * sides) + 1`.

## `evaluateRoll(expr, options?)`

Evaluates a `RollExpr` and returns a `RollResult`.

```ts
function evaluateRoll(
  expr: RollExpr,
  options?: {
    scope?: Scope;
    rng?: Rng;      // takes precedence over seed
    seed?: string;
  },
): RollResult;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| expr | `RollExpr` | — | The roll expression (formula tree with dice leaves). |
| options.scope | `Scope` | `undefined` | Variable bindings for `{ var }` nodes. |
| options.rng | `Rng` | — | Random source; takes precedence over `seed`. |
| options.seed | `string` | — | Seed used to build a `seedrandom` RNG when `rng` is absent. |

```ts
import { evaluateRoll } from '@openvtt/dice-core';

const result = evaluateRoll(
  {
    type: 'die',
    count: 4,
    faces: { kind: 'number', value: 6 },
    modifiers: [{ op: 'keep-highest', count: 3 }],
  },
  { seed: 'session-42' },
);

result.value;        // sum of the 3 highest dice
result.terms[0].dice; // per-die results with kept flags
```

### Dice inside arithmetic

```ts
const expr: RollExpr = {
  '+': [
    { type: 'die', count: 1, faces: { kind: 'number', value: 20 } },
    { '/': [10, 2] },
  ],
};
evaluateRoll(expr, { seed: 'demo' });
```

### Scope-driven comparisons

```ts
const expr: RollExpr = {
  type: 'die',
  count: 1,
  faces: { kind: 'number', value: 20 },
  modifiers: [{ op: 'count-success', compare: { op: '>=', value: { var: 'dc' } } }],
};
evaluateRoll(expr, { scope: { dc: 15 }, seed: 'demo' });
```

## Modifier internals (advanced)

```ts
interface ResolvedFaces {
  sides: number;
  max: number;
  roll(): number;
}

interface ResolvedModifier { /* modifier with all defaults filled */ }

interface ModifierContext {
  scope: Scope;
  rng: Rng;
  evalExpr(expr: RollExpr): number | boolean;
}

function resolveFaces(faces: FacesSpec, ctx: ModifierContext): ResolvedFaces;
function resolveModifier(mod: Modifier): ResolvedModifier; // count=1, value=0, target=0, cap=100
function applyModifiers(dice: WorkingDie[], mods: Modifier[], ctx: ModifierContext): WorkingDie[];
function computeValue(dice: WorkingDie[], mods: Modifier[], ctx: ModifierContext): number;
function appliedModifierNames(mods: Modifier[]): string[];
```

`applyModifiers` runs in a fixed order regardless of declaration order:

```
reroll-once -> reroll-recursive -> explode -> explode-once -> explode-compound
-> explode-penetrating -> min -> max -> keep-highest -> keep-lowest
-> drop-highest -> drop-lowest -> sort-asc -> sort-desc
```

`computeValue` rules:

- `count-success`: default compare `> 0`; count kept dice matching the comparison.
- `count-failure`: default compare `<= 0`.
- `deduct-failure` / `subtract-failure`: `successes - failures`.
- `margin-success`: `sumKept - target`.
- `count-even` / `count-odd`: count of even/odd kept dice.
- Otherwise: sum of kept dice.

Default reroll comparison is `<= 1`; default explode comparison is `= max`. `reroll-recursive` has a safety limit of 1000 iterations.

## Schema

```ts
function buildRollSchema(): v.GenericSchema;
const rollSchema: v.GenericSchema;
```

Valibot schema validating the full `RollExpr` IR, including dice leaves.

```ts
import * as v from 'valibot';
import { rollSchema } from '@openvtt/dice-core';

const expr = v.parse(rollSchema, JSON.parse(savedRoll));
```

## `DiceError`

```ts
interface DiceErrorOptions {
  cause?: unknown;
  position?: number;
  input?: string;
}

class DiceError extends Error {
  position?: number;
  input?: string;
  constructor(message: string, options?: DiceErrorOptions);
}
```

## Examples

### Explode-compound history

```ts
import { evaluateRoll } from '@openvtt/dice-core';

const result = evaluateRoll(
  {
    type: 'die',
    count: 1,
    faces: { kind: 'number', value: 6 },
    modifiers: [{ op: 'explode-compound' }],
  },
  { rng: /* rng that yields 6, 6, 2 */ },
);

result.terms[0].dice[0].history; // [6, 6, 2]
result.terms[0].dice[0].value;   // 14 (compounded)
```

### Pools

```ts
const pool: RollExpr = {
  type: 'pool',
  entries: [
    { type: 'die', count: 2, faces: { kind: 'number', value: 6 } },
    { type: 'die', count: 1, faces: { kind: 'number', value: 8 } },
  ],
  modifiers: [{ op: 'keep-highest', count: 2 }],
};
evaluateRoll(pool, { seed: 'demo' });
```

## Related

- [Dice rolling guide](../guides/dice-rolling.md)
- [@openvtt/formula](./formula.md) — the expression layer beneath `RollExpr`.
- [@openvtt/dice-notation](./dice-notation.md) — text notation that produces this IR.
