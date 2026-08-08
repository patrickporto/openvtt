import type { EventMeta } from './tracing';

export const GLOBAL_KEY = '__OPENVTT_EVENTS__';
export const BRIDGE_VERSION = 1;

export type ExternalHandler = (payload: unknown, meta: EventMeta) => void;

export interface BridgeBusAdapter {
  readonly namespace: string;
  on(name: string, handler: ExternalHandler): () => void;
  off(name: string, handler: ExternalHandler): void;
  emit(name: string, payload: unknown): void;
  tap(name: string, tapName: string, fn: (...args: any[]) => any): void;
  call(name: string, value: unknown): unknown;
  callAsync(name: string, value: unknown): Promise<unknown>;
  eventNames(): string[];
  hookNames(): string[];
}

export interface BridgeOptions {
  globalKey?: string;
  target?: EventTarget;
  customEvents?: boolean;
  exposeGlobal?: boolean;
}

export interface PublicBridge {
  readonly namespace: string;
  readonly version: number;
  on(name: string, handler: ExternalHandler): () => void;
  off(name: string, handler: ExternalHandler): void;
  once(name: string, handler: ExternalHandler): () => void;
  emit(name: string, payload: unknown): void;
  tap(name: string, tapName: string, fn: (...args: any[]) => any): void;
  call(name: string, value: unknown): unknown;
  callAsync(name: string, value: unknown): Promise<unknown>;
  events(): string[];
  hooks(): string[];
}

export interface BridgeRegistry {
  readonly version: number;
  register(namespace: string, bridge: PublicBridge): void;
  unregister(namespace: string): void;
  get(namespace?: string): PublicBridge | undefined;
  list(): string[];
  has(namespace: string): boolean;
}

function resolveTarget(override?: EventTarget): EventTarget {
  if (override) return override;
  const g = globalThis as { document?: Document };
  if (typeof g.document !== 'undefined') return g.document;
  return globalThis;
}

function getOrCreateRegistry(globalKey: string): BridgeRegistry {
  const root = globalThis as Record<string, unknown>;
  const existing = root[globalKey];
  if (existing && typeof existing === 'object' && 'register' in (existing as object)) {
    return existing as BridgeRegistry;
  }
  const bridges = new Map<string, PublicBridge>();
  const registry: BridgeRegistry = {
    version: BRIDGE_VERSION,
    register(namespace, bridge) {
      bridges.set(namespace, bridge);
    },
    unregister(namespace) {
      bridges.delete(namespace);
    },
    get(namespace) {
      if (namespace) return bridges.get(namespace);
      return bridges.values().next().value;
    },
    list() {
      return [...bridges.keys()];
    },
    has(namespace) {
      return bridges.has(namespace);
    },
  };
  try {
    Object.defineProperty(root, globalKey, {
      value: registry,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch {
    root[globalKey] = registry;
  }
  return registry;
}

export function getBridgeRegistry(globalKey: string = GLOBAL_KEY): BridgeRegistry | undefined {
  const root = globalThis as Record<string, unknown>;
  const value = root[globalKey];
  if (value && typeof value === 'object' && 'register' in (value as object)) {
    return value as BridgeRegistry;
  }
  return undefined;
}

export class Bridge {
  private readonly target: EventTarget;
  private readonly globalKey: string;
  private readonly customEvents: boolean;
  private readonly exposeGlobal: boolean;
  private attached = false;

  constructor(
    private readonly bus: BridgeBusAdapter,
    options: BridgeOptions = {},
  ) {
    this.target = resolveTarget(options.target);
    this.globalKey = options.globalKey ?? GLOBAL_KEY;
    this.customEvents = options.customEvents ?? true;
    this.exposeGlobal = options.exposeGlobal ?? true;
  }

  attach(): void {
    if (this.attached) return;
    if (this.exposeGlobal) {
      const registry = getOrCreateRegistry(this.globalKey);
      registry.register(this.bus.namespace, this.createPublicBridge());
    }
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    if (this.exposeGlobal) {
      getBridgeRegistry(this.globalKey)?.unregister(this.bus.namespace);
    }
    this.attached = false;
  }

  dispatch(name: string, payload: unknown, meta: EventMeta): void {
    if (!this.attached || !this.customEvents) return;
    if (typeof CustomEvent === 'undefined') return;
    try {
      const event = new CustomEvent(meta.wireName, { detail: { payload, meta } });
      this.target.dispatchEvent(event);
    } catch {
      // ignore dispatch failures (non-DOM environments)
    }
  }

  private createPublicBridge(): PublicBridge {
    const bus = this.bus;
    const once = (name: string, handler: ExternalHandler) => {
      const off = bus.on(name, (payload, meta) => {
        off();
        handler(payload, meta);
      });
      return off;
    };
    return {
      namespace: bus.namespace,
      version: BRIDGE_VERSION,
      on: (name, handler) => bus.on(name, handler),
      off: (name, handler) => bus.off(name, handler),
      once,
      emit: (name, payload) => bus.emit(name, payload),
      tap: (name, tapName, fn) => bus.tap(name, tapName, fn),
      call: (name, value) => bus.call(name, value),
      callAsync: (name, value) => bus.callAsync(name, value),
      events: () => bus.eventNames(),
      hooks: () => bus.hookNames(),
    };
  }
}
