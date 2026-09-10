# @openvtt/sheet

Effect-oriented character sheet engine. A `SystemPack` declares ordinals, derived values, roll templates, and effect definitions; a `SheetEngine` applies effect instances to a `CharacterDocument` through a deterministic, auditable pipeline and emits lifecycle events over an `@openvtt/events` bus.

**Version:** 0.1.0
**Dependencies:** `@openvtt/dice-core`, `@openvtt/dice-notation`, `@openvtt/events`, `@openvtt/formula`, `uuid`, `valibot`

## Installation

```bash
bun add @openvtt/sheet
```

```ts
import { SheetEngine, createDocument, defineSystemPack } from '@openvtt/sheet';
```

See the [Character sheets guide](../guides/character-sheets.md) for system-pack authoring, and the [Events and hooks guide](../guides/events-and-hooks.md) for the bus contract.

## Core types

### Changes

```ts
type ValueOp = 'set' | 'add' | 'multiply' | 'upgrade' | 'downgrade' | 'append' | 'remove';

interface ValueChange {
  kind: 'value';
  path: string;
  op: ValueOp;
  value: string;  // formula string; ladder name for upgrade/downgrade
  steps?: number; // default 1
}

interface ExtraDie {
  count: number;
  faces: number;
  modifiers?: Modifier[];
}

interface RollTransform {
  addDice?: number;
  addModifiers?: Modifier[];
  extraDice?: ExtraDie[];
  bonus?: string; // formula string
}

interface RollChange {
  kind: 'roll';
  target: string; // roll template id or tag
  transform: RollTransform;
}

interface FlagChange {
  kind: 'flag';
  path: string;
  value: boolean | string;
}

type Change = ValueChange | RollChange | FlagChange;
```

`upgrade`/`downgrade` move a value along a named ordinal ladder (for example a dice ladder `d4 -> d6 -> d8`), `steps` positions at a time. `append`/`remove` add or remove an entry in an array path and are applied in the `add` pass.

### Effects

```ts
type DurationUnit = 'seconds' | 'rounds' | 'turns' | 'until-event';

interface DurationSpec {
  unit: DurationUnit;
  value?: number; // required for 'seconds' | 'rounds' | 'turns'
  event?: string; // required for 'until-event'
}

type ExpirationState = /* internal expiration bookkeeping */;

interface TriggerRollInto {
  path: string;                        // base path to write the roll result into
  op?: 'add' | 'subtract' | 'set';     // default 'subtract'
}

interface TriggerSpec {
  on: string;              // event name, e.g. 'turn:start'
  condition?: string;      // formula string
  changes?: Change[];
  effect?: string;         // effect definition ref to apply
  roll?: string | RollExpr; // formula/notation string or parsed roll expression
  rollInto?: TriggerRollInto;
}

type StackingMode = 'stack' | 'newest' | 'highest-priority';

interface StackingRule {
  group?: string;  // default: definition id
  mode?: StackingMode; // default 'stack'
}

type GrantRef = string | { ref: string; data?: Record<string, unknown> };

interface EffectDefinition {
  id: string;
  label: string;
  changes: Change[];
  duration?: DurationSpec;
  triggers?: TriggerSpec[];
  grants?: GrantRef[];    // child effects applied (and removed) together with this one
  condition?: string;   // formula gating whether the effect is active
  stacking?: StackingRule;
  priority?: number;    // default 0; lower applies first
  icon?: string;
}

interface EffectSource {
  kind: string; // e.g. 'manual', 'item', 'spell'
  id?: string;
}

interface EffectInstance {
  id: string;               // UUID v7, schema-enforced
  ref?: string;             // definition id reference
  inline?: EffectDefinition;
  source: EffectSource;     // default { kind: 'manual' }
  enabled: boolean;         // mutable
  expiresAt?: ExpirationState; // mutable
  data?: Record<string, unknown>; // exposed as data.* in formulas
}
```

### Documents and packs

```ts
interface CharacterDocument {
  systemId: string;
  systemVersion: string;
  identity: Record<string, unknown>;
  base: Record<string, unknown>;
  effects: EffectInstance[];
}

interface RollTemplate {
  expr: RollExpr;
  tags?: string[];
}

interface SystemPack {
  id: string;
  version: string;
  ordinals?: Record<string, string[]>;
  derived?: Record<string, string>;        // path -> formula string
  rollTemplates?: Record<string, RollTemplate>;
  definitions?: EffectDefinition[];
}
```

### Computation results

```ts
type ApplyPass = 'flag' | 'set' | 'add' | 'multiply' | 'ordinal' | 'derived';

interface AuditEntry {
  effectId: string;   // 'system' for derived values
  ref?: string;
  pass: ApplyPass;
  path: string;
  op?: ValueOp;
  input?: unknown;
  result: unknown;
}

interface ActiveRollTransform {
  effectId: string;
  ref?: string;
  target: string;
  transform: RollTransform;
}

type SuppressionReason = 'disabled' | 'stacking' | 'condition';

interface SuppressedEffect {
  instance: EffectInstance;
  reason: SuppressionReason;
}

interface ComputedSheet {
  values: Record<string, unknown>;
  flags: Record<string, unknown>;
  scope: Record<string, unknown>; // { ...values, flags }
  audit: AuditEntry[];
  effects: EffectInstance[];      // active instances, in application order
  suppressed: SuppressedEffect[]; // inactive instances and why
  rollTransforms: ActiveRollTransform[];
}

interface SheetPatch {
  path: string;
  previous: unknown;
  next: unknown;
}
```

## Schemas

```ts
const changeSchema: v.GenericSchema;
const effectDefinitionSchema: v.GenericSchema;
const effectInstanceSchema: v.GenericSchema;
const characterDocumentSchema: v.GenericSchema;
const systemPackSchema: v.GenericSchema;
```

Valibot schemas for every persisted shape. `effectInstanceSchema` (and therefore `characterDocumentSchema`, used by `loadDocument`) enforces **UUID-format ids** on `effect.id` — the engine's default generator is UUID v7. Duration and expiration schemas carry invariants (via `v.check`): durations require `value` for `seconds`/`rounds`/`turns` and `event` for `until-event`; expiration states require `remaining` for `seconds`/`rounds`/`turns` and `event` for `until-event`. Violations surface as `PackValidationError` during pack validation (or as a Valibot `ValiError` when overriding `expiresAt` in `applyEffect`).

## Errors

```ts
type SheetErrorCode =
  | 'CYCLE'
  | 'UNKNOWN_EFFECT'
  | 'UNKNOWN_TEMPLATE'
  | 'UNKNOWN_ORDINAL'
  | 'PACK_VALIDATION'
  | 'TRIGGER';

class SheetError extends Error {
  code: SheetErrorCode;
  effectIds?: string[];
}

class EffectCycleError extends SheetError {}        // CYCLE
class UnknownEffectError extends SheetError {}      // UNKNOWN_EFFECT
class UnknownTemplateError extends SheetError {}    // UNKNOWN_TEMPLATE
class UnknownOrdinalError extends SheetError {}     // UNKNOWN_ORDINAL
class PackValidationError extends SheetError {      // PACK_VALIDATION
  issues: string[];
}
```

## Engine

### `createDocument(pack, init?)`

```ts
function createDocument(
  pack: SystemPack,
  init?: Partial<CharacterDocument>,
): CharacterDocument;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| pack | `SystemPack` | — | The system pack the document belongs to. |
| init | `Partial<CharacterDocument>` | `{}` | Initial overrides for identity, base, or effects. |

### `SheetEngineOptions`

```ts
type RollFn = (expr: RollExpr, scope: Record<string, unknown>) => number;

interface DurationEventNames {
  rounds: string; // default 'round:end'
  turns: string;  // default 'turn:end'
}

interface SheetEngineOptions {
  pack: SystemPack;
  bus?: SheetBus;
  id?: () => string;           // default UUID v7
  durationEvents?: Partial<DurationEventNames>;
  roller?: RollFn;             // default evaluateRoll-based
  validate?: boolean;          // default true — runs validatePack on construction
  clockEvent?: string | false; // default 'clock:tick'; false disables second ticking via events
}
```

Custom `id` generators must produce UUIDs if the document will be serialized and re-hydrated later — `loadDocument` validates `effect.id` against the UUID format.

### `class SheetEngine`

```ts
class SheetEngine {
  readonly pack: SystemPack;
  constructor(document: CharacterDocument, options: SheetEngineOptions); // clones the document; the engine owns its state
  get document(): CharacterDocument; // structuredClone snapshot; mutations do not affect the engine
  attach(): () => void; // subscribe the engine to all bus events; returns a detach function
  destroy(): void;

  registerDefinition(definition: EffectDefinition): EffectDefinition; // returns the validated definition
  getDefinition(ref: string): EffectDefinition | undefined;

  compute(): ComputedSheet; // deeply frozen, memoized result

  applyEffect(
    refOrDef: string | EffectDefinition,
    options?: ApplyEffectOptions,
  ): EffectInstance;

  removeEffect(id: string): EffectInstance | undefined; // the removed root instance (grants cascade), undefined if not found
  removeBySource(source: EffectSource): EffectInstance[];
  setEnabled(id: string, enabled: boolean): boolean;

  buildRoll(templateId: string): RollExpr;

  notifyEvent(name: string, payload?: unknown): void;
  tickSeconds(seconds: number): void;
  loadDocument(json: unknown): CharacterDocument;
  updateBase(mutator: (base: Record<string, unknown>) => Record<string, unknown>): void;
  refresh(): void;
}

interface ApplyEffectOptions {
  source?: EffectSource;
  data?: Record<string, unknown>;
  expiresAt?: ExpirationState;
  enabled?: boolean; // default true
  id?: string;
}
```

- `compute()` is memoized — it returns the **same reference** until the next mutation — and the result is **deeply frozen** (recursive `Object.freeze`). Do not mutate the returned `ComputedSheet`; mutations throw a `TypeError` in strict mode. The freeze only covers engine-owned copies: caller objects (`data`, inline definitions, the pack) are cloned on the way in and are never frozen.
- The engine validates the pack with `validatePack` on construction (unless `validate: false`) and throws `PackValidationError` for invalid packs.
- `applyEffect` clones `options.data` and inline definitions into the document, and validates `options.expiresAt` against the expiration schema (`remaining` required for `seconds`/`rounds`/`turns`, `event` for `until-event`).
- `buildRoll(templateId)` returns the template expression with all active roll transforms applied; throws `UnknownTemplateError` for unknown ids.
- `notifyEvent` advances `until-event` durations, fires triggers, and emits expiry events. `tickSeconds` does the same for `seconds` durations.
- The engine clones the document passed to the constructor and owns the copy; mutating the original afterwards has no effect.
- `updateBase(mutator)` is the explicit way to change base values: the mutator receives a working clone of the current base and returns the next base; the engine adopts the result, recomputes, and emits `computed` patches. `loadDocument(json)` replaces the whole document (validated against `characterDocumentSchema`).
- `refresh()` forces recomputation.

### Events

When a bus is provided, the engine emits (via the `sheet` contract):

| Event | Payload | Fired when |
|-------|---------|------------|
| `effect:applied` | `{ instanceId, ref? }` | `applyEffect` succeeds (including grants) |
| `effect:removed` | `{ instanceId, ref? }` | An effect is removed |
| `effect:expired` | `{ instanceId, ref? }` | A duration expires |
| `effect:enabled` | `{ instanceId, ref? }` | `setEnabled(id, true)` |
| `effect:disabled` | `{ instanceId, ref? }` | `setEnabled(id, false)` |
| `computed` | `{ patches: SheetPatch[] }` | Recomputation produced changes |
| `trigger:fired` | `{ instanceId, on }` | A trigger condition passes |
| `trigger:roll` | `{ instanceId, on, value }` | A trigger requests a roll |

## `applyRollTransform(expr, transform)`

Applies a `RollTransform` to a `RollExpr` at the IR level.

```ts
function applyRollTransform(expr: RollExpr, transform: RollTransform): RollExpr;
```

- `addDice` bumps die counts.
- `addModifiers` appends modifiers to die terms.
- `extraDice` appends `+` DieTerm nodes.
- `bonus` parses the formula string and appends it with `+`.
- Recurses into pools.

```ts
import { applyRollTransform } from '@openvtt/sheet';

const advantaged = applyRollTransform(template.expr, {
  addDice: 1,
  addModifiers: [{ op: 'keep-highest', count: 1 }],
});
```

## Paths

```ts
function getPath(obj: unknown, path: string): unknown;
function setPath(obj: unknown, path: string, value: unknown): void;
function flatten(obj: unknown): Record<string, unknown>;
function diffFlattened(prev: Record<string, unknown>, next: Record<string, unknown>): SheetPatch[];
```

`diffFlattened` returns patches sorted by path.

## Pack validation

```ts
function validatePack(pack: SystemPack): SystemPack;   // throws PackValidationError
function defineSystemPack(pack: SystemPack): SystemPack; // identity authoring helper
```

- `defineSystemPack(pack)` is an **identity helper** for authoring: it returns the pack unchanged, fully typed, and performs **no validation**. Use it to get type inference and autocomplete while writing a pack literal.
- `validatePack(pack)` performs explicit validation — Valibot schema (including duration invariants), derived-formula cycles, ordinal references, grant/trigger references, condition cycles — and throws `PackValidationError` containing all collected issues.
- The engine runs `validatePack` automatically in the constructor unless `validate: false` is passed, so packs built with `defineSystemPack` are still checked before use.

```ts
import { defineSystemPack, validatePack, PackValidationError } from '@openvtt/sheet';

const pack = defineSystemPack({
  id: 'bad',
  version: '1.0.0',
  derived: { a: 'b + 1', b: 'a + 1' }, // cycle — only caught by validatePack
});

try {
  validatePack(pack);
} catch (err) {
  if (err instanceof PackValidationError) {
    console.error(err.issues); // string[]
  }
}
```

## Sheet bus

```ts
const sheetContract: Contract; // defineContract with namespace 'sheet'

interface SheetBusOptions<E extends EventMap = {}> extends BusOptions {
  events?: E; // extra typed events merged into the contract
}

type SheetBus<E extends EventMap = {}> = EventBus<SheetEventMap & E>;

function createSheetBus<E extends EventMap = {}>(
  options?: SheetBusOptions<E>,
): SheetBus<E>;
```

`createSheetBus` builds an `@openvtt/events` bus pre-configured with the sheet contract. Pass it as `options.bus` to the engine, or subscribe to engine events externally.

The `events` option merges extra, fully typed events into the contract — the recommended way to declare the gameplay events that drive durations and triggers (`round:end`, `turn:start`, `clock:tick`, ...). Emissions and listeners for these names are type-checked, and the bus stays compatible with `unknownEvents: 'reject'`:

```ts
import * as v from 'valibot';
import { createSheetBus } from '@openvtt/sheet';

const bus = createSheetBus({
  events: {
    'round:end': v.object({}),
    'turn:end': v.object({}),
    'clock:tick': v.object({ elapsed: v.number() }),
  },
});

bus.emit('round:end', {});              // typed
bus.emit('clock:tick', { elapsed: 6 }); // payload checked against the schema
```

Extra event names may not collide with the contract's own events (`computed`, `effect:applied`, ...): `createSheetBus` throws a `SheetError` with code `PACK_VALIDATION` if they do.

With `engine.attach()`, the engine reacts to any bus event (`onAny`): it fires matching triggers, ticks durations according to `durationEvents` (rounds/turns) and `clockEvent` (seconds), and re-emits `computed` only when the recomputed scope actually changed.

## Examples

### Full engine setup

```ts
import {
  SheetEngine,
  createDocument,
  createSheetBus,
  defineSystemPack,
} from '@openvtt/sheet';

const pack = defineSystemPack({
  id: 'demo',
  version: '1.0.0',
  ordinals: {
    dice: ['d4', 'd6', 'd8', 'd10', 'd12'],
  },
  derived: {
    'hp.max': '10 + con * 2',
  },
  rollTemplates: {
    attack: { expr: /* parsed 1d20 + @str */, tags: ['attack'] },
  },
  definitions: [
    {
      id: 'blessed',
      label: 'Blessed',
      changes: [{ kind: 'value', path: 'str', op: 'add', value: '2' }],
    },
  ],
});

const bus = createSheetBus();
const doc = createDocument(pack, { base: { str: 3, con: 2 } });
const engine = new SheetEngine(doc, { pack, bus });

const effect = engine.applyEffect('blessed');
const computed = engine.compute();

computed.values.str;    // 5
computed.values['hp.max']; // 14
computed.audit;         // one entry per applied change
```

### Expiry and computed events

```ts
import * as v from 'valibot';
import { createSheetBus } from '@openvtt/sheet';

const bus = createSheetBus({
  events: {
    'turn:end': v.object({}), // extra typed gameplay events
  },
});

engine.attach(); // feed bus events into the engine

bus.on('effect:expired', ({ instanceId }) => console.log('expired', instanceId));
bus.on('computed', ({ patches }) => console.log(patches));

bus.emit('turn:end', {}); // advances turn-based durations
```

### Advantage via buildRoll

```ts
const roll = engine.buildRoll('attack');
// addDice: 1 + keep-highest applied by active effects transforms
```

### Triggers

```ts
engine.registerDefinition({
  id: 'burning',
  label: 'Burning',
  changes: [],
  triggers: [
    { on: 'turn:start', roll: '1d6', rollInto: { path: 'hp.current' } },
  ],
});
```

## Related

- [Character sheets guide](../guides/character-sheets.md)
- [Events and hooks guide](../guides/events-and-hooks.md)
- [Formulas guide](../guides/formulas.md)
- [@openvtt/events](./events.md) — the bus used for lifecycle events.
- [@openvtt/dice-core](./dice-core.md) — roll evaluation behind `RollFn`.
