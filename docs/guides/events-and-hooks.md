# Events and hooks

`@openvtt/events` is the single pub/sub and hooks layer for the whole monorepo. Every package routes its events through an `EventBus` built from a typed **contract**, so payloads are validated with Valibot schemas and every event carries trace metadata.

- [API reference](../api/events.md)

## Contracts

A contract declares a namespace, a set of events (each with a Valibot schema), and a set of hooks (each with a strategy and an optional schema):

```ts
import * as v from 'valibot';
import { defineContract, createBus } from '@openvtt/events';

const diceContract = defineContract({
  namespace: 'dice',
  events: {
    rolled: v.object({ result: v.number(), notation: v.string() }),
  },
  hooks: {
    beforeRoll: {
      strategy: 'syncWaterfall',
      schema: v.object({ sides: v.number() }),
    },
  },
});
```

`defineContract` fills in defaults: the namespace defaults to `'openvtt'`, and `events`/`hooks` default to empty maps. The contract object is typed, so every `on`, `emit`, `tap`, and `call` is checked against the Valibot output types.

## Creating a bus

```ts
const bus = createBus(diceContract, {
  validate: 'throw',
  unknownEvents: 'allow',
});
```

`createBus(contract, options)` accepts a contract from `defineContract` **or** an inline contract definition (`createBus({ namespace: 'x', events: {...} })`).

### Bus options

| Option | Type | Default | Description |
|---|---|---|---|
| `validate` | `'throw' \| 'warn' \| 'off'` | `'throw'` | Payload validation mode on emit/call |
| `unknownEvents` | `'allow' \| 'reject'` | `'allow'` | `'reject'` throws `UnknownEventError` for events not in the contract |
| `bridge` | `boolean \| BridgeOptions` | `false` | Expose the bus to external consumers (browser extensions) |
| `broadcast` | `boolean \| BroadcastOptions` | `false` | Cross-tab replication via `BroadcastChannel` |
| `debug` | `boolean \| ((...args) => void)` | `false` | Log every emit/error; `true` uses `console.debug` |
| `sourceId` | `string` | new UUID v7 | Identity used to ignore own broadcast messages |

## Events

### Subscribing

```ts
const off = bus.on('rolled', (payload, meta) => {
  console.log(payload.result, meta.wireName);
});

bus.once('rolled', (payload) => { /* fires a single time */ });
bus.off('rolled', handler);           // remove a specific handler
off();                                // or use the returned unsubscribe
```

Every handler receives `(payload, meta)`. The `meta` object (`EventMeta`) is created fresh for each emit:

| Field | Description |
|---|---|
| `id` | UUID v7 identifying this emission |
| `name` | Short event name, e.g. `rolled` |
| `wireName` | Namespaced name, `'namespace:name'` (e.g. `dice:rolled`) |
| `namespace` | Contract namespace |
| `timestamp` | `Date.now()` at emission |
| `origin` | `'local' \| 'broadcast' \| 'bridge'` |
| `correlationId` | Optional, passed via emit options or preserved across broadcast hops |
| `source` | Optional free-form source tag |

### Wildcards and errors

```ts
bus.onAny((name, payload, meta) => console.log(name, payload));

bus.onError((error, context) => {
  // context: { kind: 'event:handler' | 'hook:call' | 'hook:callAsync' | 'broadcast:validation', name, meta? }
  console.error(context.kind, context.name, error);
});
```

Handler exceptions never break `emit` — they are routed to `onError` subscribers instead.

### Emitting

```ts
const meta = bus.emit('rolled', { result: 42, notation: '1d100' }, {
  correlationId: requestId,
  source: 'attack-resolver',
});
```

`emit` validates the payload against the contract schema, runs middleware, dispatches to local handlers, forwards to the bridge, posts to the broadcast channel, and returns the `EventMeta`.

### Validation modes

- `'throw'` (default) — invalid payloads throw `EventValidationError` (with a `issues` array of Valibot issues).
- `'warn'` — invalid payloads log a warning and are dispatched as-is.
- `'off'` — schemas are ignored entirely.

With `unknownEvents: 'reject'`, emitting an event that is not declared in the contract throws `UnknownEventError`. You can still register events at runtime with `bus.registerEvent(name, schema)`.

## Hooks

Hooks are tapable-style extension points: named pipelines that other code can `tap` into. They are how openvtt implements modifiers, transforms, and policy checks without hard-coding extension points.

### The 8 strategies

| Strategy | Execution | Tap result semantics | Call with |
|---|---|---|---|
| `sync` | Synchronous series | Results ignored | `call` |
| `syncBail` | Synchronous series | First non-`undefined` result stops the series and becomes the hook result | `call` |
| `syncWaterfall` | Synchronous series | Each tap receives the previous tap's return value; final value is returned | `call` |
| `asyncSeries` | Sequential async | Results ignored | `callAsync` |
| `asyncSeriesBail` | Sequential async | First non-`undefined` result bails and becomes the result | `callAsync` |
| `asyncSeriesWaterfall` | Sequential async | Each tap receives the previous tap's resolved value | `callAsync` |
| `asyncParallel` | Concurrent async | Results ignored | `callAsync` |
| `asyncParallelBail` | Concurrent async | First non-`undefined` result bails | `callAsync` |

Rules of thumb:

- **Waterfall** when taps transform a value (roll contexts, configs).
- **Bail** when taps vote or short-circuit (`shouldReroll` in `@openvtt/dice` is `syncBail`).
- **Series** for ordered side effects; **parallel** for independent async work.

### Tapping

```ts
bus.tap('beforeRoll', 'double', (ctx) => ({ n: ctx.n * 2 }));
bus.tap('beforeRoll', 'plus-one', (ctx) => ({ n: ctx.n + 1 }));
```

Taps run in registration order. A tap may return `undefined` to leave the value untouched (for waterfall hooks, returning `undefined` keeps the previous value).

For async hooks use the async tap forms:

```ts
bus.tapPromise('save', 'db', async (doc) => { await db.save(doc); });
bus.tapAsync('save', 'legacy', (doc, callback) => {
  legacySave(doc).then(() => callback(), callback);
});
```

Calling `tapPromise`/`tapAsync` on a synchronous hook throws a `HookError`.

### Calling

```ts
// synchronous strategies only
const finalCtx = bus.call('beforeRoll', { n: 2 });
// { n: 5 } — double first, then plus-one

// any strategy
const saved = await bus.callAsync('save', doc);
```

`call` on an async hook throws `HookError` telling you to use `callAsync`. The input is validated against the hook's schema before taps run; failures inside taps are wrapped in `HookError` with the original error as `cause`.

### Waterfall example

```ts
bus.tap('transform', 'double', (c) => ({ n: c.n * 2 }));
bus.tap('transform', 'add-ten', (c) => ({ n: c.n + 10 }));
bus.tap('transform', 'noop', () => undefined);   // leaves value untouched

bus.call('transform', { n: 1 });   // { n: 12 } — ((1 * 2) + 10)
```

## Middleware

Middleware observes (and can mutate) every emission before handlers run:

```ts
const stop = bus.use({
  beforeEmit(name, payload, meta) {
    console.log('emitting', meta.wireName, payload);
  },
});
stop();   // removes the middleware
```

## Bridge: exposing the bus to the outside world

The bridge is designed for browser extensions and third-party scripts that must interact with your app without a module import. With `bridge: true`, the bus:

1. Registers itself in a global registry at `globalThis.__OPENVTT_EVENTS__`.
2. Re-dispatches every emitted event as a DOM `CustomEvent` named by the wire name (e.g. `dice:rolled`) on `document` (or a custom `target`), with `{ payload, meta }` in `event.detail`.

```ts
const bus = createBus(contract, { bridge: true });
// or with options:
const bus2 = createBus(contract, {
  bridge: { customEvents: true, exposeGlobal: true, target: window },
});
```

From an extension content script:

```ts
import { getBridgeRegistry } from '@openvtt/events';

const bridge = getBridgeRegistry()?.get('dice');
bridge?.on('rolled', (payload) => console.log('saw a roll', payload));
bridge?.emit('rolled', { result: 20, notation: '1d20' });
bridge?.tap('beforeRoll', 'ext', (ctx) => ctx);

// or without the package at all:
document.addEventListener('dice:rolled', (e) => console.log(e.detail.payload));
```

The public bridge exposes `on`, `off`, `once`, `emit`, `tap`, `call`, `callAsync`, `events()`, and `hooks()` — enough for full two-way integration. `getBridgeRegistry()` returns `undefined` outside a bridged environment.

## Broadcast: cross-tab replication

With `broadcast: true`, every `emit` is also posted to a `BroadcastChannel` named `openvtt:<namespace>`. Other tabs with a bus on the same channel receive the event with `meta.origin === 'broadcast'`:

```ts
const bus = createBus(contract, { broadcast: true });
// custom channel name:
const bus2 = createBus(contract, { broadcast: { channel: 'my-room' } });

bus.on('rolled', (payload, meta) => {
  if (meta.origin === 'broadcast') console.log('rolled in another tab');
});
```

Notes:

- A bus never receives its own messages (filtered by `sourceId`).
- Incoming payloads are re-validated in `'warn'` mode regardless of the local validation mode; invalid messages are dropped and reported via `onError` with kind `'broadcast:validation'`.
- Correlation IDs and timestamps survive the hop.
- Payloads must be structured-cloneable; non-cloneable payloads are silently skipped for broadcast (local handlers still fire).

## Errors

| Class | Code | Raised when |
|---|---|---|
| `EventBusError` | `EVENT_BUS_ERROR` / `NOT_INITIALIZED` | Base class; also thrown when using a destroyed bus |
| `EventValidationError` | `VALIDATION_ERROR` | Payload fails its schema in `'throw'` mode; `issues` holds Valibot issues |
| `UnknownEventError` | `UNKNOWN_EVENT` | Emitting an undeclared event with `unknownEvents: 'reject'` |
| `UnknownHookError` | `UNKNOWN_HOOK` | Tapping/calling a hook not in the contract |
| `HookError` | `HOOK_ERROR` | Wrong tap/call form for a strategy, or a tap threw (original error in `cause`) |

## Lifecycle

```ts
bus.destroy();
bus.isDestroyed;   // true
```

`destroy()` removes all handlers, clears all hooks, detaches the bridge, closes the broadcast channel, and clears middleware and error handlers. Any subsequent use throws `EventBusError` with code `NOT_INITIALIZED`.

## Complete worked example: a dice contract

```ts
import * as v from 'valibot';
import { createBus } from '@openvtt/events';
import { fromFormula } from '@openvtt/dice-notation';
import { evaluateRoll } from '@openvtt/dice-core';

const bus = createBus({
  namespace: 'dice',
  events: {
    rolled: v.object({ result: v.number(), notation: v.string() }),
  },
  hooks: {
    beforeRoll: { strategy: 'syncWaterfall', schema: v.object({ notation: v.string() }) },
  },
});

// A "bless" house rule: every roll gets +1d4.
bus.tap('beforeRoll', 'bless', (ctx) => ({ notation: `${ctx.notation} + 1d4` }));

bus.on('rolled', ({ result, notation }, meta) => {
  console.log(`[${meta.id}] ${notation} → ${result}`);
});

function roll(notation: string) {
  const { notation: finalNotation } = bus.call('beforeRoll', { notation });
  const result = evaluateRoll(fromFormula(finalNotation), { seed: 'demo' });
  bus.emit('rolled', { result: Number(result.value), notation: finalNotation });
}

roll('1d20');
// [0190...] 1d20 + 1d4 → 17   (deterministic because of the seed)
```

This pattern — hooks for transforming inputs, events for announcing outcomes — is exactly how `@openvtt/dice` (`shouldReroll`), `@openvtt/sheet` (`computed`, `effect:applied`, ...), and `@openvtt/assets` (`preload:*`) are built.
