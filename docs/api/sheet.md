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
type ValueOp = 'set' | 'add' | 'multiply' | 'upgrade' | 'downgrade';

interface ValueChange {
  kind: 'value';
  path: string;
  op: ValueOp;
  value: string;  // formula string; ladder name for upgrade/downgrade
  steps?: number; // default 1
}

interface ExtraDie {
  count: number;
  faces: string;
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

`upgrade`/`downgrade` move a value along a named ordinal ladder (for example a dice ladder `d4 -> d6 -> d8`), `steps` positions at a time.

### Effects

```ts
type DurationUnit = 'seconds' | 'rounds' | 'turns' | 'until-event';

interface DurationSpec {
  unit: DurationUnit;
  value?: number;
  event?: string; // required for 'until-event'
}

type ExpirationState = /* internal expiration bookkeeping */;

interface TriggerSpec {
  on: string;              // event name, e.g. 'turn:start'
  condition?: string;      // formula string
  changes?: Change[];
  effect?: string;         // effect definition ref to apply
  roll?: string;           // roll template to roll
}

type StackingMode = 'stack' | 'newest' | 'highest-priority';

interface StackingRule {
  group?: string;  // default: definition id
  mode?: StackingMode; // default 'stack'
}

interface EffectDefinition {
  id: string;
  label: string;
  changes: Change[];
  duration?: DurationSpec;
  triggers?: TriggerSpec[];
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
  definitions?: Record<string, EffectDefinition>;
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

interface ComputedSheet {
  values: Record<string, unknown>;
  flags: Record<string, boolean | string>;
  scope: Record<string, unknown>; // { ...values, flags }
  audit: AuditEntry[];
  activeEffects: EffectInstance[];
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

Valibot schemas for every persisted shape. `effectInstanceSchema` enforces UUID-format ids.

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
  issues: v.BaseIssue<unknown>[];
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
type RollFn = (expr: RollExpr, scope: Scope) => number;

interface DurationEventNames {
  rounds?: string; // default 'round:end'
  turns?: string;  // default 'turn:end'
}

interface SheetEngineOptions {
  pack: SystemPack;
  bus?: SheetBus;
  id?: string;                 // default uuid v7
  durationEvents?: DurationEventNames;
  roller?: RollFn;             // default evaluateRoll-based
  validate?: boolean;          // default true
}
```

### `class SheetEngine`

```ts
class SheetEngine {
  readonly pack: SystemPack;
  constructor(document: CharacterDocument, options: SheetEngineOptions); // clones the document; the engine owns its state
  get document(): CharacterDocument; // snapshot copy; mutations do not affect the engine
  snapshot(): CharacterDocument;
  attach(): () => void; // subscribe the engine to all bus events; returns a detach function
  destroy(): void;

  registerDefinition(definition: EffectDefinition): void;
  getDefinition(ref: string): EffectDefinition;

  compute(): ComputedSheet;

  applyEffect(
    refOrDef: string | EffectDefinition,
    options?: ApplyEffectOptions,
  ): EffectInstance;

  removeEffect(id: string): boolean;
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

- `compute()` is memoized and only recomputes when the document is dirty.
- `buildRoll(templateId)` returns the template expression with all active roll transforms applied; throws `UnknownTemplateError` for unknown ids.
- `notifyEvent` advances `until-event` durations, fires triggers, and emits expiry events. `tickSeconds` does the same for `seconds` durations.
- The engine clones the document passed to the constructor and owns the copy; mutating the original afterwards has no effect.
- `updateBase(mutator)` is the explicit way to change base values: the mutator receives a working clone of the current base and returns the next base; the engine adopts the result, recomputes, and emits `computed` patches. `loadDocument(json)` replaces the whole document (validated against `characterDocumentSchema`).
- `refresh()` forces recomputation.

### Events

When a bus is provided, the engine emits (via the `sheet` contract):

| Event | Payload | Fired when |
|-------|---------|------------|
| `effect:applied` | instance | `applyEffect` succeeds |
| `effect:removed` | instance | An effect is removed |
| `effect:expired` | instance | A duration expires |
| `effect:enabled` | instance | `setEnabled(id, true)` |
| `effect:disabled` | instance | `setEnabled(id, false)` |
| `computed` | `{ patches: SheetPatch[] }` | Recomputation produced changes |
| `trigger:fired` | trigger context | A trigger condition passes |
| `trigger:roll` | trigger roll context | A trigger requests a roll |

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

## Pipeline (advanced)

The computation pipeline, exported for testing and custom tooling:

```ts
function applyStacking(effects: EffectInstance[], engine: SheetEngine): EffectInstance[];
function sortEffects(effects: EffectInstance[], engine: SheetEngine): EffectInstance[];
function filterActive(effects: EffectInstance[], state: unknown, engine: SheetEngine): EffectInstance[];
function applyChanges(state: unknown, effects: EffectInstance[], engine: SheetEngine): AuditEntry[];
function applyDerived(state: unknown, pack: SystemPack): AuditEntry[];
function topoOrder(derived: Record<string, string>): string[];
function buildState(document: CharacterDocument): unknown;
function computeSheet(document: CharacterDocument, engine: SheetEngine): ComputedSheet;
```

- `sortEffects`: priority ascending, then UUID v7 id ascending (chronological).
- `filterActive`: fixed-point evaluation of effect conditions, 2 passes; throws `EffectCycleError` on cyclic conditions.
- `applyChanges` runs passes in order: `flag` -> `set` -> `add` -> `multiply` -> `ordinal`.
- `applyDerived` evaluates derived formulas in topological order; `topoOrder` throws on cycles.

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
function validatePack(pack: SystemPack): SystemPack;
const defineSystemPack: typeof validatePack; // alias
```

Validates the full pack — schemas, derived-formula cycles, ordinal references, template references — and throws `PackValidationError` containing all collected issues.

```ts
import { defineSystemPack, PackValidationError } from '@openvtt/sheet';

try {
  defineSystemPack({
    id: 'bad',
    version: '1.0.0',
    derived: { a: 'b + 1', b: 'a + 1' }, // cycle
  });
} catch (err) {
  if (err instanceof PackValidationError) {
    console.error(err.issues);
  }
}
```

## Sheet bus

```ts
const sheetContract: Contract; // defineContract with namespace 'sheet'

function createSheetBus(options?: BusOptions): SheetBus;
```

`createSheetBus` builds an `@openvtt/events` bus pre-configured with the sheet contract. Pass it as `options.bus` to the engine, or subscribe to engine events externally.

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
  definitions: {
    blessed: {
      id: 'blessed',
      label: 'Blessed',
      changes: [{ kind: 'value', path: 'str', op: 'add', value: '2' }],
    },
  },
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
engine.attach(); // feed bus events into the engine

bus.on('effect:expired', (instance) => console.log('expired', instance.id));
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
    { on: 'turn:start', roll: 'burn-damage' },
  ],
});
```

## Related

- [Character sheets guide](../guides/character-sheets.md)
- [Events and hooks guide](../guides/events-and-hooks.md)
- [Formulas guide](../guides/formulas.md)
- [@openvtt/events](./events.md) — the bus used for lifecycle events.
- [@openvtt/dice-core](./dice-core.md) — roll evaluation behind `RollFn`.
