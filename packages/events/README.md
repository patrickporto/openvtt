# @openvtt/events

Mature, schema-validated **event + hook bus** for OpenVTT — the foundation of the
OpenVTT hook system. A capable, reliable foundation for events and hooks that
stays drop-in simple, **cross-VTT interoperable**, and friendly to
**browser extensions** and injected scripts.

- **Events** (notifications, fire-and-forget) — powered by [`mitt`](https://github.com/developit/mitt): typed, wildcard-capable.
- **Hooks** (interception / pipelines) — powered by [`tapable`](https://github.com/webpack/tapable): `sync`, `syncBail`, `syncWaterfall`, `asyncSeries`, `asyncSeriesBail`, `asyncSeriesWaterfall`, `asyncParallel`, `asyncParallelBail`.
- **Validation** — every event/hook payload is validated with [`valibot`](https://valibot.dev) schemas.
- **IDs** — UUID **v7** (time-ordered, sortable) for every event/correlation.
- **Bridge** — exposes the bus to `globalThis.__OPENVTT_EVENTS__` and dispatches DOM `CustomEvent`s, so content scripts and extensions can participate with plain `addEventListener`.
- **Broadcast** — optional cross-tab propagation via `BroadcastChannel`.
- **Robust** — a throwing handler never crashes the bus; errors are isolated and observable.
- SSR-safe (no `window`/`document` access at import time), ESM + CJS, tree-shakeable.

## Install

```bash
bun add @openvtt/events
```

## Quick start

### Freeform (no contract)

```ts
import { createBus } from '@openvtt/events';

const bus = createBus();

const off = bus.on('scene:ready', (payload, meta) => {
  console.log(meta.id, meta.timestamp); // uuid v7 id
});
bus.emit('scene:ready', { id: 'forest' });
off();
```

### Typed + validated contract (recommended)

```ts
import * as v from 'valibot';
import { createBus, defineContract } from '@openvtt/events';

const contract = defineContract({
  namespace: 'dice',
  events: {
    rolled: v.object({ result: v.number() }),
  },
  hooks: {
    beforeRoll: { strategy: 'syncWaterfall', schema: v.object({ sides: v.number() }) },
  },
});

const bus = createBus(contract);

bus.on('rolled', (payload, meta) => {
  console.log('rolled', payload.result, meta.id);
});

bus.tap('beforeRoll', 'physics', (ctx) => ({ ...ctx, sides: ctx.sides })); // waterfall returns the (transformed) value

const result = bus.call('beforeRoll', { sides: 20 }); // → { sides: 20 }
bus.emit('rolled', { result: 42 }); // validated against the schema
```

## Events (notify)

```ts
bus.on(name, (payload, meta) => {});        // subscribe → returns unsubscribe fn
bus.once(name, (payload, meta) => {});      // fire once
bus.off(name, handler);                     // remove a handler
bus.onAny((name, payload, meta) => {});     // observe every event
bus.emit(name, payload);                    // → EventMeta (contains the uuid v7 id)
bus.onError((err, ctx) => {});              // observe handler/validation errors
```

- `emit` is **synchronous** and returns the `EventMeta` (so you get the event `id` for correlation).
- A handler that throws is **isolated**: it is reported via `onError` and the remaining handlers still run.

## Hooks (pipelines)

Hooks are extensible pipeline points where plugins can intercept, transform, or
short-circuit a process.

```ts
bus.tap(name, 'plugin-name', (value) => value);           // sync tap
bus.tapPromise(name, 'plugin-name', async (value) => {}); // async tap
bus.call(name, value);        // invoke a SYNC hook (sync / syncBail / syncWaterfall)
bus.callAsync(name, value);   // invoke ANY hook (required for async* strategies)
```

| Strategy                 | Runs   | Behaviour                                                                  |
| ------------------------ | ------ | -------------------------------------------------------------------------- |
| `sync`                   | sync   | All taps run; return values ignored.                                       |
| `syncBail`               | sync   | Stops at the first tap returning non-`undefined`; returns it.              |
| `syncWaterfall`          | sync   | Each tap receives the previous return and returns the next value.          |
| `asyncSeries`            | async  | Taps run sequentially in registration order.                               |
| `asyncSeriesBail`        | async  | Sequential; stops at the first resolved non-`undefined`.                   |
| `asyncSeriesWaterfall`   | async  | Sequential; each tap receives the previous resolved value.                 |
| `asyncParallel`          | async  | All taps run concurrently.                                                 |
| `asyncParallelBail`      | async  | Concurrent; resolves with the first non-`undefined`.                       |

Hook inputs are validated against the hook's `schema` before any tap runs.

## Validation

Validation mode is set per-bus via `validate: 'throw' | 'warn' | 'off'` (default `'throw'`).

- Events without a schema and hooks without a `schema` are **never** validated (freeform-friendly).
- On `'throw'`, invalid payloads raise an `EventValidationError` listing every issue.

```ts
bus.registerEvent('spawned', v.object({ tokenId: v.string() })); // add at runtime
bus.registerHook('damage', { strategy: 'syncWaterfall', schema: v.object({ amount: v.number() }) });
```

## Browser extensions & external scripts (the bridge)

Enable the bridge to let **content scripts, page scripts, and browser
extensions** talk to the bus using only standard APIs. No build step required
for them.

```ts
const bus = createBus(contract, { bridge: true });
```

This does two things:

**1. A global handle** at `globalThis.__OPENVTT_EVENTS__` (constant: `GLOBAL_KEY`):

```js
// from a content script, page script, or extension
const bus = window.__OPENVTT_EVENTS__.get('dice');
bus.on('rolled', (payload, meta) => console.log(payload, meta.id));
bus.emit('rolled', { result: 42 }); // validated against the contract schema
bus.events(); // → ['rolled']
```

**2. DOM `CustomEvent`s** dispatched on `document` (the most reliable channel
across Chrome content-script isolated worlds) with the namespaced name
`${namespace}:${event}` and `event.detail = { payload, meta }`:

```js
// works from any content script / injected script, no SDK needed
document.addEventListener('dice:rolled', (e) => {
  console.log(e.detail.payload, e.detail.meta.id);
});
```

> The default bridge target is `document` when available (for maximum
> content-script compatibility), falling back to `globalThis`. Override with
> `bridge: { target: myTarget }`.

External `emit`/`tap` calls are **validated** just like internal ones, so the
bus stays reliable even when untrusted scripts participate.

## Cross-tab broadcast

```ts
const bus = createBus(contract, { broadcast: true }); // channel defaults to `openvtt:<namespace>`
```

Emits are mirrored to other tabs/windows on the same origin via
`BroadcastChannel`. Received messages are re-dispatched locally but never
re-broadcast (no loops). Inbound payloads that fail validation are reported via
`onError` and dropped (a misbehaving peer can never crash your tab).

Because the bus is VTT-agnostic and namespaced, you can wire several adapters
against the same bus to translate between platforms.

## API reference

### `createBus(contract?, options?)` / `new EventBus(contract?, options?)`

`contract: { namespace?, events?, hooks? }` — `events` maps name → valibot
schema; `hooks` maps name → `{ strategy, schema? }`.

`options:`
| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `validate` | `'throw' \| 'warn' \| 'off'` | `'throw'` | Payload validation behaviour. |
| `unknownEvents` | `'allow' \| 'reject'` | `'allow'` | Reject emits for events not in the contract. |
| `bridge` | `boolean \| BridgeOptions` | `false` | Expose the bus to extensions/scripts. |
| `broadcast` | `boolean \| BroadcastOptions` | `false` | Cross-tab `BroadcastChannel`. |
| `debug` | `boolean \| ((...a) => void)` | `false` | Debug logging. |
| `sourceId` | `string` | uuid v7 | Unique instance id used for broadcast de-dup. |

### Event & hook methods

See the [Events](#events-notify) and [Hooks](#hooks-pipelines) sections.

### Errors

`EventBusError`, `EventValidationError`, `UnknownEventError`, `UnknownHookError`, `HookError` — all carry a typed `code`.

## License

MIT
