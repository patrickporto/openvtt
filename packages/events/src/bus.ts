import { defineContract } from './contract';
import type {
  Contract,
  ContractDef,
  EventMap,
  EventPayload,
  HookDef,
  HookMap,
  HookPayload,
} from './contract';
import { EventBusError, EventValidationError, UnknownEventError } from './errors';
import { HookEngine } from './hooks';
import type { HookTapFn, HookTapPromiseFn } from './hooks';
import { NotifyBus } from './notify';
import { validatePayload } from './schema';
import type { Schema, ValidationMode } from './schema';
import { createMeta, newId } from './tracing';
import type { EventMeta, EmitOptions } from './tracing';
import { Bridge } from './bridge';
import type { BridgeOptions, BridgeBusAdapter } from './bridge';
import { Broadcast } from './broadcast';
import type { BroadcastOptions, BroadcastMessage } from './broadcast';

export interface BusOptions {
  validate?: ValidationMode;
  unknownEvents?: 'allow' | 'reject';
  bridge?: boolean | BridgeOptions;
  broadcast?: boolean | BroadcastOptions;
  debug?: boolean | ((...args: unknown[]) => void);
  sourceId?: string;
}

export interface BusMiddleware {
  beforeEmit?(name: string, payload: unknown, meta: EventMeta): void;
}

type DebugLogger = (...args: unknown[]) => void;

type TypedEventHandler<E extends EventMap, K extends string & keyof E> = (
  payload: EventPayload<E, K>,
  meta: EventMeta,
) => void;

type ErrorHandler = (error: unknown, context: { kind: string; name: string; meta?: EventMeta }) => void;

export class EventBus<E extends EventMap = EventMap, H extends HookMap = HookMap> {
  readonly namespace: string;
  readonly sourceId: string;

  private readonly contract: Contract<E, H>;
  private readonly notify: NotifyBus<E>;
  private readonly hooks: HookEngine<H>;
  private readonly bridge: Bridge | undefined;
  private readonly broadcast: Broadcast | undefined;
  private readonly validate: ValidationMode;
  private readonly unknownEvents: 'allow' | 'reject';
  private readonly debug: DebugLogger | undefined;
  private readonly errorHandlers = new Set<ErrorHandler>();
  private readonly middlewares: BusMiddleware[] = [];
  private destroyed = false;

  constructor(contract: ContractDef<E, H> | Contract<E, H> = {} as ContractDef<E, H>, options: BusOptions = {}) {
    this.contract = normalizeContract(contract);
    this.namespace = this.contract.namespace;
    this.sourceId = options.sourceId ?? newId();
    this.validate = options.validate ?? 'throw';
    this.unknownEvents = options.unknownEvents ?? 'allow';
    this.debug = resolveDebug(options.debug);

    this.notify = new NotifyBus<E>();
    this.hooks = new HookEngine<H>(this.contract.hooks);

    if (options.bridge) {
      const bridgeOptions = options.bridge === true ? {} : options.bridge;
      this.bridge = new Bridge(this.createAdapter(), bridgeOptions);
      this.bridge.attach();
    }

    if (options.broadcast) {
      const broadcastOptions = options.broadcast === true ? {} : options.broadcast;
      this.broadcast = new Broadcast(
        {
          namespace: this.namespace,
          sourceId: this.sourceId,
          onMessage: (message) => this.handleBroadcast(message),
        },
        broadcastOptions,
      );
    }
  }

  on<K extends string & keyof E>(name: K, handler: TypedEventHandler<E, K>): () => void {
    this.assertNotDestroyed();
    return this.notify.on(name, handler);
  }

  once<K extends string & keyof E>(name: K, handler: TypedEventHandler<E, K>): () => void {
    this.assertNotDestroyed();
    return this.notify.once(name, handler);
  }

  off<K extends string & keyof E>(name: K, handler: TypedEventHandler<E, K>): void {
    this.notify.off(name, handler);
  }

  onAny(handler: (name: string, payload: unknown, meta: EventMeta) => void): () => void {
    this.assertNotDestroyed();
    return this.notify.onAny(handler as never);
  }

  offAny(handler: (name: string, payload: unknown, meta: EventMeta) => void): void {
    this.notify.offAny(handler as never);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  use(middleware: BusMiddleware): () => void {
    this.middlewares.push(middleware);
    return () => {
      const index = this.middlewares.indexOf(middleware);
      if (index >= 0) this.middlewares.splice(index, 1);
    };
  }

  emit<K extends string & keyof E>(name: K, payload?: EventPayload<E, K>, options: EmitOptions = {}): EventMeta {
    this.assertNotDestroyed();
    const wireName = this.toWireName(name as string);
    const meta = createMeta(name as string, wireName, this.namespace, options);
    const value = this.guardEvent(name as string);
    const validated = this.validatePayload(value, payload, name as string);

    for (const middleware of this.middlewares) {
      middleware.beforeEmit?.(name as string, validated, meta);
    }

    this.fanout(name as string, validated, meta, options);

    if (options.origin !== 'broadcast' && !options.skipBroadcast) {
      this.broadcast?.post(name as string, validated, meta);
    }

    this.log('emit', name as string, meta);
    return meta;
  }

  tap<K extends string & keyof H>(
    name: K,
    tapName: string,
    fn: HookTapFn<HookPayload<H, K>>,
  ): void {
    this.assertNotDestroyed();
    this.hooks.tap<HookPayload<H, K>>(name as string, tapName, fn);
  }

  tapPromise<K extends string & keyof H>(
    name: K,
    tapName: string,
    fn: HookTapPromiseFn<HookPayload<H, K>>,
  ): void {
    this.assertNotDestroyed();
    this.hooks.tapPromise<HookPayload<H, K>>(name as string, tapName, fn);
  }

  tapAsync<K extends string & keyof H>(
    name: K,
    tapName: string,
    fn: (value: HookPayload<H, K>, callback: (err?: Error | null, result?: HookPayload<H, K>) => void) => void,
  ): void {
    this.assertNotDestroyed();
    this.hooks.tapAsync<HookPayload<H, K>>(name as string, tapName, fn);
  }

  interceptHook(name: string & keyof H, interceptor: object): void {
    this.hooks.intercept(name as string, interceptor);
  }

  call<K extends string & keyof H>(name: K, value: HookPayload<H, K>): HookPayload<H, K> {
    this.assertNotDestroyed();
    const schema = this.hookSchema(name as string);
    const input = this.validatePayload(schema, value, name as string);
    try {
      return this.hooks.call<HookPayload<H, K>>(name as string, input as HookPayload<H, K>);
    } catch (error) {
      this.reportError(error, { kind: 'hook:call', name: name as string });
      throw error;
    }
  }

  async callAsync<K extends string & keyof H>(name: K, value: HookPayload<H, K>): Promise<HookPayload<H, K>> {
    this.assertNotDestroyed();
    const schema = this.hookSchema(name as string);
    const input = this.validatePayload(schema, value, name as string);
    try {
      return await this.hooks.callAsync<HookPayload<H, K>>(name as string, input as HookPayload<H, K>);
    } catch (error) {
      this.reportError(error, { kind: 'hook:callAsync', name: name as string });
      throw error;
    }
  }

  registerEvent(name: string, schema?: Schema): void {
    this.assertNotDestroyed();
    (this.contract.events as Record<string, Schema>)[name] = schema;
  }

  registerHook(name: string, def: HookDef): void {
    this.assertNotDestroyed();
    (this.contract.hooks as Record<string, HookDef>)[name] = def;
    this.hooks.register(name, def);
  }

  hasEvent(name: string): boolean {
    return name in this.contract.events;
  }

  hasHook(name: string): boolean {
    return this.hooks.has(name);
  }

  eventNames(): string[] {
    return Object.keys(this.contract.events);
  }

  hookNames(): string[] {
    return this.hooks.list();
  }

  toWireName(name: string): string {
    return `${this.namespace}:${name}`;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.notify.offAll();
    this.hooks.clearAll();
    this.bridge?.detach();
    this.broadcast?.close();
    this.errorHandlers.clear();
    this.middlewares.length = 0;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new EventBusError('EventBus has been destroyed.', 'NOT_INITIALIZED');
    }
  }

  private guardEvent(name: string): Schema {
    const known = Object.prototype.hasOwnProperty.call(this.contract.events, name);
    if (!known && this.unknownEvents === 'reject') {
      throw new UnknownEventError(name);
    }
    return this.contract.events[name];
  }

  private hookSchema(name: string): Schema {
    const def = this.hooks.getDef(name);
    return def?.schema;
  }

  private validatePayload(schema: Schema, value: unknown, label: string): unknown {
    const result = validatePayload(schema, value, this.validate, label);
    if (result.ok) return result.value;
    return value;
  }

  private fanout(name: string, payload: unknown, meta: EventMeta, options: EmitOptions): void {
    this.notify.dispatch(name, payload, meta, (error) =>
      this.reportError(error, { kind: 'event:handler', name, meta }),
    );
    if (!options.skipBridge) {
      this.bridge?.dispatch(name, payload, meta);
    }
  }

  private handleBroadcast(message: BroadcastMessage): void {
    if (this.destroyed) return;
    const options: EmitOptions = {
      origin: 'broadcast',
      skipBroadcast: true,
      correlationId: message.correlationId || undefined,
      timestamp: message.timestamp,
    };
    const wireName = this.toWireName(message.name);
    const meta = createMeta(message.name, wireName, this.namespace, options);
    const schema = this.contract.events[message.name];
    let payload = message.payload;
    if (schema && this.validate !== 'off') {
      const result = validatePayload(schema, message.payload, 'warn', message.name);
      if (!result.ok) {
        this.reportError(
          new EventValidationError(`Inbound broadcast "${message.name}" failed validation`, result.issues),
          { kind: 'broadcast:validation', name: message.name, meta },
        );
        return;
      }
      payload = result.value;
    }
    this.fanout(message.name, payload, meta, options);
    this.log('broadcast:inbound', message.name, meta);
  }

  private reportError(error: unknown, context: { kind: string; name: string; meta?: EventMeta }): void {
    this.log('error', context.kind, context.name, error);
    for (const handler of [...this.errorHandlers]) {
      try {
        handler(error, context);
      } catch {
        // error handlers must never throw uncaught
      }
    }
  }

  private log(...args: unknown[]): void {
    this.debug?.(`[@openvtt/events:${this.namespace}]`, ...args);
  }

  private createAdapter(): BridgeBusAdapter {
    const bus = this;
    return {
      namespace: bus.namespace,
      on: (name, handler) => {
        bus.assertNotDestroyed();
        return bus.notify.on(name as string & keyof E, handler as TypedEventHandler<E, string & keyof E>);
      },
      off: (name, handler) => {
        bus.notify.off(name as string & keyof E, handler as TypedEventHandler<E, string & keyof E>);
      },
      emit: (name, payload) => {
        bus.emit(name as string & keyof E, payload as EventPayload<E, string & keyof E>);
      },
      tap: (name, tapName, fn) => {
        bus.hooks.tap(name as string, tapName, fn);
      },
      call: (name, value) => bus.hooks.call(name as string, value),
      callAsync: (name, value) => bus.hooks.callAsync(name as string, value),
      eventNames: () => bus.eventNames(),
      hookNames: () => bus.hookNames(),
    };
  }
}

function normalizeContract<E extends EventMap, H extends HookMap>(
  contract: ContractDef<E, H> | Contract<E, H>,
): Contract<E, H> {
  if (contract && typeof contract === 'object' && 'namespace' in contract) {
    return contract as Contract<E, H>;
  }
  return defineContract(contract as ContractDef<E, H>);
}

function resolveDebug(debug: BusOptions['debug']): DebugLogger | undefined {
  if (!debug) return undefined;
  if (debug === true) return (...args: unknown[]) => console.debug(...args);
  return debug;
}

export function createBus<E extends EventMap = EventMap, H extends HookMap = HookMap>(
  contract?: ContractDef<E, H> | Contract<E, H>,
  options?: BusOptions,
): EventBus<E, H> {
  return new EventBus<E, H>((contract ?? {}) as ContractDef<E, H>, options);
}
