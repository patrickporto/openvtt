# @openvtt/events

Schema-validated event & hook bus for the openvtt monorepo. It combines typed pub/sub events (built on `mitt`) with tapable-style hook pipelines (built on `tapable`), validates every payload against Valibot schemas, and tags each emission with tracing metadata (UUID v7 ids, correlation ids, origin). Optional addons provide cross-tab broadcast via `BroadcastChannel` and a browser-extension bridge via a global registry.

**Version:** 0.1.0
**Dependencies:** `mitt`, `tapable`, `uuid`, `valibot`

## Installation

```bash
bun add @openvtt/events
```

```ts
import { createBus, defineContract } from '@openvtt/events';
```

See the [Events and hooks guide](../guides/events-and-hooks.md) for a conceptual walkthrough.

## `createBus(contract?, options?)`

Creates an `EventBus` from an optional contract and options.

```ts
function createBus<E extends EventMap = EventMap, H extends HookMap = HookMap>(
  contract?: Contract<E, H>,
  options?: BusOptions,
): EventBus<E, H>;
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| contract | `Contract<E, H>` | `undefined` | Typed contract produced by `defineContract`. |
| options | `BusOptions` | `{}` | Runtime options (validation, broadcast, bridge, debug). |

```ts
import * as v from 'valibot';
import { createBus } from '@openvtt/events';

const bus = createBus({
  namespace: 'dice',
  events: {
    rolled: v.object({ result: v.number() }),
  },
  hooks: {
    beforeRoll: { strategy: 'syncWaterfall', schema: v.object({ sides: v.number() }) },
  },
});

bus.on('rolled', (payload, meta) => console.log(payload.result, meta.id));
const prepared = bus.call('beforeRoll', { sides: 20 });
bus.emit('rolled', { result: 42 });
```

## `class EventBus<E, H>`

### Properties

| Name | Type | Description |
|------|------|-------------|
| namespace | `string` | Bus namespace, used to build wire names. |
| sourceId | `string` | Unique id of this bus instance (UUID v7 by default). |
| isDestroyed | `boolean` | Whether `destroy()` has been called. |

### Event methods

```ts
on<K extends keyof E>(name: K, handler: (payload: E[K], meta: EventMeta) => void): () => void;
once<K extends keyof E>(name: K, handler: (payload: E[K], meta: EventMeta) => void): () => void;
off<K extends keyof E>(name: K, handler?: (payload: E[K], meta: EventMeta) => void): void;
onAny(handler: WildcardHandler<E>): () => void;
offAny(handler: WildcardHandler<E>): void;
onError(handler: (error: unknown, info: { kind: string; name: string; meta?: EventMeta }) => void): () => void;
emit<K extends keyof E>(name: K, payload?: E[K], options?: EmitOptions): EventMeta;
```

`on` and `once` return an unsubscribe function. Handler exceptions are isolated: a throwing handler does not break other handlers, and the error is routed to `onError` listeners.

### Middleware

```ts
use(middleware: BusMiddleware): () => void;

interface BusMiddleware {
  beforeEmit?(name: string, payload: unknown, meta: EventMeta): void;
}
```

Returns an unsubscribe function that removes the middleware.

### Hook methods

```ts
tap<K extends keyof H>(name: K, tapName: string, fn: HookTapFn<H[K]>): void;
tapPromise<K extends keyof H>(name: K, tapName: string, fn: HookTapPromiseFn<H[K]>): void;
tapAsync<K extends keyof H>(name: K, tapName: string, fn: (...args: unknown[]) => void): void;
interceptHook<K extends keyof H>(name: K, interceptor: HookInterceptor<H[K]>): void;
call<K extends keyof H>(name: K, value: H[K]): H[K];
callAsync<K extends keyof H>(name: K, value: H[K]): Promise<H[K]>;
```

`call` only works with sync strategies and throws a `HookError` if the hook uses an async strategy. Both `call` and `callAsync` return the tap result, or the input value if the taps return `undefined`.

### Registration and introspection

```ts
registerEvent(name: string, schema?: Schema): void;
registerHook(name: string, def: HookDef): void;
hasEvent(name: string): boolean;
hasHook(name: string): boolean;
eventNames(): string[];
hookNames(): string[];
toWireName(name: string): string; // `${namespace}:${name}`
destroy(): void;
```

Emitting on a destroyed bus throws an `EventBusError` with code `NOT_INITIALIZED`.

## `BusOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| validate | `'throw' \| 'warn' \| 'off'` | `'throw'` | How schema validation failures are handled. |
| unknownEvents | `'allow' \| 'reject'` | `'allow'` | Whether emitting unregistered events is allowed. |
| bridge | `boolean \| BridgeOptions` | `false` | Enable the browser-extension bridge. |
| broadcast | `boolean \| BroadcastOptions` | `false` | Enable cross-tab broadcast. |
| debug | `boolean \| ((...args: unknown[]) => void)` | `false` | Enable debug logging, optionally to a custom sink. |
| sourceId | `string` | uuid v7 | Override the bus source id. |

## `defineContract(def)`

Declares a typed contract of events and hooks with Valibot schemas.

```ts
function defineContract<E extends EventMap, H extends HookMap>(def: ContractDef<E, H>): Contract<E, H>;

interface ContractDef<E, H> {
  namespace?: string;                          // default 'openvtt'
  events?: Record<string, v.GenericSchema>;
  hooks?: Record<string, HookDef>;
}

interface HookDef {
  strategy: HookStrategy;
  schema?: v.GenericSchema;
}

type HookStrategy =
  | 'sync' | 'syncBail' | 'syncWaterfall'
  | 'asyncSeries' | 'asyncSeriesBail' | 'asyncSeriesWaterfall'
  | 'asyncParallel' | 'asyncParallelBail';
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| def.namespace | `string` | `'openvtt'` | Contract namespace, used in wire names. |
| def.events | `Record<string, v.GenericSchema>` | `{}` | Event name to payload schema. |
| def.hooks | `Record<string, HookDef>` | `{}` | Hook name to strategy and optional schema. |

## Types

```ts
type EventMap = Record<string, unknown>;
type HookMap = Record<string, unknown>;
type EventPayload<E extends EventMap, K extends keyof E> = E[K];
type HookPayload<H extends HookMap, K extends keyof H> = H[K];
type WildcardHandler<E extends EventMap> = (name: keyof E, payload: E[keyof E], meta: EventMeta) => void;
type Schema = v.GenericSchema | undefined;
type ValidationMode = 'throw' | 'warn' | 'off';
type ValidationResult = ValidationOk | ValidationFail;
interface ValidationOk { ok: true; value: unknown }
interface ValidationFail { ok: false; issues: v.BaseIssue<unknown>[] }
```

## Validation utilities

```ts
function isSchema(value: unknown): value is v.GenericSchema;
function validatePayload(schema: Schema, value: unknown, mode: ValidationMode, label: string): ValidationResult;
function formatIssues(issues: v.BaseIssue<unknown>[]): string;
```

`validatePayload` respects the mode: `'throw'` raises an `EventValidationError`, `'warn'` logs and continues, `'off'` skips validation entirely.

## Tracing

```ts
type EventOrigin = 'local' | 'broadcast' | 'bridge';

interface EventMeta {
  id: string;              // uuid v7
  name: string;
  wireName: string;        // `${namespace}:${name}`
  namespace: string;
  timestamp: number;
  origin: EventOrigin;
  correlationId?: string;
  source?: string;
}

interface EmitOptions {
  origin?: EventOrigin;
  correlationId?: string;
  source?: string;
  timestamp?: number;
  skipBroadcast?: boolean;
  skipBridge?: boolean;
}

function newId(): string; // uuid v7
function createMeta(name: string, wireName: string, namespace: string, options?: EmitOptions): EventMeta;
```

Use `correlationId` to link related emissions (for example, a roll request and its result).

## `class HookEngine<H>` (advanced)

The underlying hook pipeline engine, exposed for advanced use cases.

```ts
class HookEngine<H extends HookMap> {
  register(name: string, def: HookDef): void;
  has(name: string): boolean;
  getDef(name: string): HookDef | undefined;
  list(): string[];
  tap<K extends keyof H>(name: K, tapName: string, fn: HookTapFn<H[K]>): void;
  tapPromise<K extends keyof H>(name: K, tapName: string, fn: HookTapPromiseFn<H[K]>): void;
  tapAsync<K extends keyof H>(name: K, tapName: string, fn: (...args: unknown[]) => void): void;
  intercept<K extends keyof H>(name: K, interceptor: HookInterceptor<H[K]>): void;
  isAsync(name: string): boolean;
  isWaterfall(name: string): boolean;
  call<K extends keyof H>(name: K, value: H[K]): H[K];
  callAsync<K extends keyof H>(name: K, value: H[K]): Promise<H[K]>;
  clear(name: string): void;
  clearAll(): void;
}

type HookTapFn<T> = (value: T) => T | undefined | void;
type HookTapPromiseFn<T> = (value: T) => Promise<T | undefined | void>;

interface HookContext<T> {
  name: string;
  strategy: HookStrategy;
  value: T;
}
```

## Bridge (browser extensions)

Exposes buses through a global registry so browser extensions can subscribe and emit.

```ts
const GLOBAL_KEY = '__OPENVTT_EVENTS__'; // also exported as BRIDGE_GLOBAL_KEY

interface BridgeOptions {
  globalKey?: string;       // default GLOBAL_KEY
  target?: unknown;
  customEvents?: boolean;   // default true
  exposeGlobal?: boolean;   // default true
}

interface PublicBridge {
  namespace: string;
  version: string;
  on(name: string, handler: (payload: unknown, meta: EventMeta) => void): () => void;
  off(name: string, handler: (payload: unknown, meta: EventMeta) => void): void;
  once(name: string, handler: (payload: unknown, meta: EventMeta) => void): () => void;
  emit(name: string, payload?: unknown): EventMeta;
  tap(name: string, tapName: string, fn: HookTapFn<unknown>): void;
  call(name: string, value: unknown): unknown;
  callAsync(name: string, value: unknown): Promise<unknown>;
  events(): string[];
  hooks(): string[];
}

interface BridgeRegistry {
  version: string;
  register(bridge: PublicBridge): void;
  unregister(namespace: string): void;
  get(namespace: string): PublicBridge | undefined;
  list(): PublicBridge[];
  has(namespace: string): boolean;
}

function getBridgeRegistry(globalKey?: string): BridgeRegistry;

class Bridge {
  constructor(bus: EventBus, options?: BridgeOptions);
  attach(): void;
  detach(): void;
  dispatch(name: string, payload: unknown, meta?: Partial<EventMeta>): void;
}
```

```ts
import { createBus, getBridgeRegistry } from '@openvtt/events';

const bus = createBus({ namespace: 'dice', events: {} }, { bridge: true });
const bridge = getBridgeRegistry().get('dice');
bridge?.on('rolled', (payload) => console.log(payload));
```

## Broadcast (cross-tab)

Replicates emissions across tabs via `BroadcastChannel`.

```ts
interface BroadcastOptions {
  channel?: string; // default `openvtt:${namespace}`
}

interface BroadcastMessage {
  v: 1;
  namespace: string;
  name: string;
  payload: unknown;
  correlationId?: string;
  sourceId: string;
  timestamp: number;
}

class Broadcast {
  readonly enabled: boolean;
  post(name: string, payload: unknown, options?: EmitOptions): void;
  close(): void;
}
```

Broadcast filters self-messages using `sourceId` and validates inbound payloads with mode `'warn'`, so a malformed message from another tab never crashes the receiver.

```ts
const a = createBus({ namespace: 'dice', events: {} }, { broadcast: true });
const b = createBus({ namespace: 'dice', events: {} }, { broadcast: true });
b.on('rolled', (payload, meta) => console.log(meta.origin)); // 'broadcast'
a.emit('rolled', { result: 12 });
```

## Errors

```ts
class EventBusError extends Error { code: EventBusErrorCode }
class EventValidationError extends EventBusError { issues: v.BaseIssue<unknown>[] }
class UnknownEventError extends EventBusError {}
class UnknownHookError extends EventBusError {}
class HookError extends EventBusError {}

type EventBusErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_EVENT'
  | 'UNKNOWN_HOOK'
  | 'HOOK_ERROR'
  | 'BRIDGE_ERROR'
  | 'NOT_INITIALIZED'
  | 'EVENT_BUS_ERROR';
```

| Error | Code | Raised when |
|-------|------|-------------|
| `EventValidationError` | `VALIDATION_ERROR` | A payload fails its Valibot schema in `'throw'` mode. |
| `UnknownEventError` | `UNKNOWN_EVENT` | Emitting an unregistered event with `unknownEvents: 'reject'`. |
| `UnknownHookError` | `UNKNOWN_HOOK` | Calling or tapping an unregistered hook. |
| `HookError` | `HOOK_ERROR` | Hook execution fails, e.g. `call` on an async-strategy hook. |

## Behavior notes

- Handler exceptions are isolated per handler and routed to `onError` listeners.
- Emitting on a destroyed bus throws `EventBusError` with code `NOT_INITIALIZED`.
- `call` and `callAsync` return the tap result, or the input value when taps return `undefined`.
- Broadcast filters self-messages via `sourceId` and validates inbound payloads with `'warn'`.

## Examples

### Waterfall hook pipeline

```ts
import * as v from 'valibot';
import { createBus } from '@openvtt/events';

const bus = createBus({
  namespace: 'math',
  events: {},
  hooks: {
    compute: { strategy: 'syncWaterfall', schema: v.object({ n: v.number() }) },
  },
});

bus.tap('compute', 'double', (ctx) => ({ n: ctx.n * 2 }));
bus.tap('compute', 'plus1', (ctx) => ({ n: ctx.n + 1 }));

bus.call('compute', { n: 3 }); // { n: 7 }
```

### Validation errors

```ts
import * as v from 'valibot';
import { createBus, EventValidationError } from '@openvtt/events';

const bus = createBus({
  namespace: 'dice',
  events: { rolled: v.object({ result: v.number() }) },
});

try {
  bus.emit('rolled', { result: 'not a number' });
} catch (err) {
  if (err instanceof EventValidationError) {
    console.error(err.issues);
  }
}
```

## Related

- [Events and hooks guide](../guides/events-and-hooks.md)
- [@openvtt/sheet](./sheet.md) — uses an event bus for sheet lifecycle events.
