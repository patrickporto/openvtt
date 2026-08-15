# Character sheets

`@openvtt/sheet` is a rules-engine for character sheets. It is built on a deliberately minimal philosophy:

> A character document stores only **base values** and **effect instances**. Everything else — final stats, derived values, flags, roll bonuses — is recomputed by a pure pipeline whenever anything changes.

That means no denormalized state to keep in sync, a complete audit trail for every number, and save files that stay small.

- [API reference](../api/sheet.md)
- Builds on: [Formulas](formulas.md), [Dice rolling](dice-rolling.md), [Events and hooks](events-and-hooks.md)

## SystemPack anatomy

A **system pack** describes the rules of a game system. Everything a character can be flows from it:

```ts
import type { SystemPack } from '@openvtt/sheet';

const pack: SystemPack = {
  id: 'mini-dnd',
  version: '1.0.0',

  // Named ladders for upgrade/downgrade ops
  ordinals: {
    dieSize: ['d4', 'd6', 'd8', 'd10', 'd12'],
  },

  // Derived values: path -> formula source (evaluated in dependency order)
  derived: {
    'abilities.str.mod': 'floor((abilities.str.score - 10) / 2)',
    'hp.max': '10 + abilities.con.mod * level',
  },

  // Named roll expressions, extensible by effects
  rollTemplates: {
    attack: { expr: /* RollExpr */ ..., tags: ['attack', 'weapon'] },
  },

  // Reusable effect definitions, referenced by id
  definitions: [
    {
      id: 'bless',
      label: 'Bless',
      changes: [{ kind: 'roll', target: 'attack', transform: { bonus: '1d4' } }],
      duration: { unit: 'rounds', value: 10 },
    },
  ],
};
```

| Field | Purpose |
|---|---|
| `id` / `version` | Stamped onto every document as `systemId` / `systemVersion` |
| `ordinals` | Named ladders (e.g. die sizes) used by `upgrade`/`downgrade` changes |
| `derived` | Path → formula; computed after all effects, in topological order |
| `rollTemplates` | Named `RollExpr`s with optional `tags`, consumed by `buildRoll` |
| `definitions` | Effect definitions: changes, durations, triggers, conditions, stacking |

`RollTemplate.expr` is a `RollExpr` — usually parsed once with `fromFormula` from `@openvtt/dice-notation`.

## Documents

```ts
import { createDocument } from '@openvtt/sheet';

const doc = createDocument(pack, {
  identity: { name: 'Aria' },
  base: {
    level: 3,
    abilities: { str: { score: 16 }, con: { mod: 2 } },
    hp: { current: 22 },
  },
});
```

A `CharacterDocument` is plain JSON: `{ systemId, systemVersion, identity, base, effects }`. It round-trips through `JSON.stringify` and through the exported `characterDocumentSchema` (Valibot).

The engine **clones** the document on construction and owns the copy — mutating the original object afterwards never reaches the engine. Read state through `engine.document` (a fresh snapshot) and change base values explicitly:

```ts
engine.updateBase((base) => ({ ...base, xp: base.xp + 1 }));
```

The mutator receives a working clone of the current base and returns the next base; the engine adopts the result, recomputes, and emits `computed` patches on the bus. To replace the whole document (e.g. on hydration), use `engine.loadDocument(json)`.

## The engine

```ts
import { SheetEngine } from '@openvtt/sheet';

const engine = new SheetEngine(doc, {
  pack,
  bus,               // optional SheetBus — enables sheet events
});

engine.attach(); // opt-in: feed bus events into the engine
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `pack` | `SystemPack` | required | The system pack (validated unless `validate: false`) |
| `bus` | `SheetBus` | — | Bus for sheet events; use `createSheetBus()` for a pre-wired contract |
| `id` | `() => string` | UUID v7 | ID generator for effect instances |
| `durationEvents` | `Partial<DurationEventNames>` | `{ rounds: 'round:end', turns: 'turn:end' }` | Which bus event names tick round/turn durations |
| `roller` | `RollFn` | dice-core `evaluateRoll` | Roll function used by trigger rolls |
| `validate` | `boolean` | `true` | Run `validatePack` on construction |
| `clockEvent` | `string \| false` | `'clock:tick'` | Event that advances second-based durations (payload: number or `{ elapsed }`) |

`attach()` subscribes the engine to all bus events (`onAny`) and returns a detach function (`destroy()` also detaches). While attached, any event emitted on the bus is processed by the engine: triggers fire, durations tick, and a `computed` event with patches is emitted if anything changed. Events arriving while the engine is already handling an event are queued and processed afterwards, not dropped.

## The compute pipeline

Every mutation invalidates a cache; `engine.compute()` reruns this pipeline:

```
effects (document)
  │
  ▼
1. collect        resolve each instance to its definition (ref or inline)
  │
  ▼
2. filter         drop disabled instances           → suppressed: 'disabled'
  │
  ▼
3. stacking       apply stacking rules per group    → suppressed: 'stacking'
  │
  ▼
4. conditions     evaluate effect conditions against the evolving state,
                  in topological dependency order   → suppressed: 'condition'
                  (cycles throw EffectCycleError)
  │
  ▼
5. sort           by priority, then by instance id (UUID v7 keeps insertion
                  order, so application order is deterministic)
  │
  ▼
6. apply          value changes in fixed passes:
                  flag → set → add → multiply → ordinal
                  (roll changes are collected as active roll transforms)
  │
  ▼
7. derived        evaluate pack.derived formulas in topological order
  │
  ▼
ComputedSheet { values, flags, scope, audit, effects, suppressed, rollTransforms }
```

Why the pass order matters: `set` establishes a base, `add` stacks bonuses on it, `multiply` scales the total, and `ordinal` walks ladders last. Two effects adding +2 and ×2 therefore resolve deterministically regardless of application order.

Step 4 evaluates conditions against the state produced by the effects already known to be active. Because conditions can read paths that other effects write, conditional effects are ordered topologically by dependency; a dependency cycle (A's condition reads a path B writes, and vice versa) throws `EffectCycleError`.

## Changes

Effects mutate the sheet through three change kinds:

### Value changes

```ts
{ kind: 'value', path: 'ac', op: 'add', value: '2' }
```

`value` is **formula source** (parsed with `parseFormula`, evaluated against the current values + `flags` + instance `data`), except for `upgrade`/`downgrade` where it names an ordinal ladder.

| Op | Behavior |
|---|---|
| `set` | Replace the value |
| `add` | `current + input` |
| `multiply` | `current * input` |
| `upgrade` | Move up `steps` (default 1) on the named ordinal ladder |
| `downgrade` | Move down the ladder |
| `append` / `remove` | Add/remove an entry in an array path (applied in the `add` pass) |

```ts
{ kind: 'value', path: 'weapon.die', op: 'upgrade', value: 'dieSize', steps: 1 }
// d8 → d10 on the pack's dieSize ladder
```

### Roll changes

```ts
{
  kind: 'roll',
  target: 'attack',                    // template id, tag, or glob ('melee*', '*')
  transform: { addDice: 1, addModifiers: [{ op: 'keep-highest', count: 2 }] },
}
```

Roll changes do not touch values; they register **active roll transforms** that `buildRoll` applies to matching templates. The transform fields:

| Field | Effect |
|---|---|
| `addDice` | Add N dice to every die term in the expression |
| `addModifiers` | Append modifiers to every die term/pool |
| `extraDice` | Add whole new terms (`{ count, faces, modifiers? }`) summed on top |
| `bonus` | Formula source added to the expression (may reference scope) |

The classic example — advantage:

```ts
{
  id: 'advantage-on-attacks',
  label: 'Advantage',
  changes: [{
    kind: 'roll',
    target: 'attack',
    transform: { addDice: 1, addModifiers: [{ op: 'keep-highest', count: 2 }] },
  }],
}
// buildRoll('attack') turns 1d20 into 2d20keep-highest2
```

### Flag changes

```ts
{ kind: 'flag', path: 'rage.active', value: true }
```

Flags land in a separate `flags` namespace that is part of the evaluation scope — conditions and formulas read them as `flags.rage.active`.

## Durations

```ts
duration: { unit: 'rounds', value: 3 }
duration: { unit: 'turns', value: 1 }
duration: { unit: 'seconds', value: 60 }
duration: { unit: 'until-event', event: 'combat:end' }
```

- **rounds/turns** tick down when the configured duration events (`round:end` / `turn:end` by default) arrive on the bus.
- **seconds** tick down via the clock event (`clock:tick` by default; payload is a number of elapsed seconds or `{ elapsed }`), or manually via `engine.tickSeconds(n)`.
- **until-event** expires the first time the named event fires.

Expiry emits `effect:expired` and cascades to granted child effects.

## Triggers

Triggers let effects react to events:

```ts
{
  id: 'rage',
  label: 'Rage',
  changes: [/* ... */],
  triggers: [{
    on: 'turn:start',
    condition: 'flags.rage.active and hp.current > 0',
    roll: '1d6',
    rollInto: { path: 'hp.temp', op: 'add' },
  }],
}
```

| Field | Behavior |
|---|---|
| `on` | Event name that fires the trigger |
| `condition` | Optional formula; scope includes `data` (instance data) and `event` (payload) |
| `changes` | Value/flag changes applied **directly to base** (permanent until undone) |
| `effect` | Apply another effect definition when the trigger fires |
| `roll` | A `RollExpr` or canonical notation string, rolled with the engine's `roller` |
| `rollInto` | Write the roll result into a base path (`add` / `subtract` (default) / `set`) |

Each fired trigger emits `trigger:fired`; rolled triggers also emit `trigger:roll` with the value.

## Stacking

```ts
stacking: { group: 'armor', mode: 'highest-priority' }
```

| Mode | Behavior |
|---|---|
| `stack` (default) | All instances apply |
| `newest` | Only the most recently applied instance in the group applies (UUID v7 ids make "newest" well-defined) |
| `highest-priority` | Highest `priority` wins; ties broken by newest |

Effects without a `group` use their definition id as the group. Suppressed instances are listed in `computed.suppressed` with reason `'stacking'`.

## Reading results

```ts
const computed = engine.compute();

computed.values;           // base + effects + derived
computed.flags;            // flag namespace
computed.scope;            // values + flags merged (what formulas see)
computed.effects;          // active effect instances, in application order
computed.suppressed;       // [{ instance, reason }]
computed.rollTransforms;   // active roll transforms for buildRoll
computed.audit;            // AuditEntry[] — why every number is what it is
```

### The audit trail: "why is AC 14?"

Every pass of the pipeline records an entry:

```ts
for (const entry of engine.compute().audit) {
  if (entry.path === 'ac') {
    console.log(entry.pass, entry.op, entry.input, '→', entry.result, `(from ${entry.ref ?? entry.effectId})`);
  }
}
// set   set   10   → 10  (from system/base)
// add   add   2    → 12  (from shield)
// add   add   2    → 14  (from dexterity)
```

Each `AuditEntry` carries `effectId`, `ref`, `pass`, `path`, `op`, `input`, and `result` — enough to build a "breakdown" tooltip for any value.

## Building rolls

```ts
const expr = engine.buildRoll('attack');   // template + active transforms
const result = evaluateRoll(expr, { scope: engine.compute().scope });
```

`buildRoll` looks up the template, then applies every active roll transform whose `target` matches the template id, one of its `tags`, or a glob (`'melee*'`, `'*'`). Unknown template ids throw `UnknownTemplateError`.

## Events

Pass a bus (ideally `createSheetBus()`, which ships the matching contract) and the engine emits:

| Event | Payload | When |
|---|---|---|
| `effect:applied` | `{ instanceId, ref? }` | Effect applied (including grants) |
| `effect:removed` | `{ instanceId, ref? }` | Effect removed manually or by source |
| `effect:expired` | `{ instanceId, ref? }` | Duration ran out / until-event fired |
| `effect:enabled` / `effect:disabled` | `{ instanceId, ref? }` | `setEnabled` toggles |
| `computed` | `{ patches }` | Recomputed scope differs — patches are `{ path, previous, next }` |
| `trigger:fired` | `{ instanceId, on }` | A trigger matched its event |
| `trigger:roll` | `{ instanceId, on, value }` | A trigger rolled |

```ts
import { createSheetBus } from '@openvtt/sheet';

const bus = createSheetBus();
bus.on('computed', ({ patches }) => ui.applyPatches(patches));

const engine = new SheetEngine(doc, { pack, bus });
engine.attach();
bus.emit('round:end');   // ticks round durations, fires triggers
```

## Validating packs

```ts
import { validatePack, defineSystemPack, PackValidationError } from '@openvtt/sheet';

try {
  const validPack = validatePack(pack);   // schema + formula refs + ordinal refs + cycles
} catch (err) {
  if (err instanceof PackValidationError) console.error(err.issues);
}
```

`validatePack` checks the Valibot schema, parses every formula (derived, conditions, change values, bonuses), verifies ordinal ladder references, and detects derived-formula and condition cycles. The engine runs it automatically unless `validate: false`. `defineSystemPack` is the identity-style helper for authoring packs with full type inference.

## Path utilities

```ts
import { getPath, setPath, flatten, diffFlattened } from '@openvtt/sheet';

getPath(values, 'abilities.str.mod');              // deep read
setPath(values, 'hp.current', 12);                 // deep write (creates objects)
flatten({ a: { b: 1 } });                          // { 'a.b': 1 }
diffFlattened(before, after);                      // SheetPatch[] { path, previous, next }
```

`diffFlattened` is what the engine uses to produce `computed` event patches.

## Worked mini-example

```ts
import { fromFormula } from '@openvtt/dice-notation';
import { evaluateRoll } from '@openvtt/dice-core';
import {
  createDocument, createSheetBus, validatePack, SheetEngine,
  type SystemPack,
} from '@openvtt/sheet';

const pack: SystemPack = {
  id: 'mini-dnd',
  version: '1.0.0',
  derived: {
    'abilities.str.mod': 'floor((abilities.str.score - 10) / 2)',
    'hp.max': '20 + abilities.con.mod * level',
  },
  rollTemplates: {
    attack: { expr: fromFormula('1d20 + @abilities.str.mod'), tags: ['attack'] },
  },
  definitions: [
    {
      id: 'enlarge',
      label: 'Enlarge',
      changes: [{ kind: 'value', path: 'damage.bonus', op: 'add', value: '2' }],
      duration: { unit: 'rounds', value: 3 },
    },
    {
      id: 'shield-of-faith',
      label: 'Shield of Faith',
      changes: [{ kind: 'value', path: 'ac', op: 'add', value: '2' }],
    },
  ],
};
validatePack(pack);

const doc = createDocument(pack, {
  base: { level: 2, ac: 12, abilities: { str: { score: 16 }, con: { mod: 2 } } },
});

const bus = createSheetBus();
const engine = new SheetEngine(doc, { pack, bus });
engine.attach();

engine.compute().values['hp.max'];   // 24  (20 + 2 * 2)
engine.compute().values['abilities.str.mod'];  // 3

engine.applyEffect('shield-of-faith', { source: { kind: 'spell' } });
engine.compute().values['ac'];       // 14

const enlarged = engine.applyEffect('enlarge', { source: { kind: 'spell' } });
engine.compute().values['damage.bonus'];  // 2

bus.emit('round:end');
bus.emit('round:end');
bus.emit('round:end');               // third tick → 'effect:expired'
engine.compute().values['damage.bonus'];  // 0 (undefined → 0 in formulas)

const attackExpr = engine.buildRoll('attack');
const roll = evaluateRoll(attackExpr, { scope: engine.compute().scope, seed: 'demo' });
roll.value;                          // d20 + 3
```
