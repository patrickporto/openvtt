import {
  AsyncParallelBailHook,
  AsyncParallelHook,
  AsyncSeriesBailHook,
  AsyncSeriesHook,
  AsyncSeriesWaterfallHook,
  SyncBailHook,
  SyncHook,
  SyncWaterfallHook,
} from 'tapable';
import type { HookDef, HookMap, HookStrategy } from './contract';
import { HookError, UnknownHookError } from './errors';

type AnyTap = {
  tap(name: string, fn: (...args: any[]) => any): void;
  tapPromise?(name: string, fn: (...args: any[]) => any): void;
  tapAsync?(name: string, fn: (...args: any[]) => any): void;
  intercept?(interceptor: object): void;
};

interface Entry {
  def: HookDef;
  hook: AnyTap;
}

const ASYNC_STRATEGIES: ReadonlySet<HookStrategy> = new Set([
  'asyncSeries',
  'asyncSeriesBail',
  'asyncSeriesWaterfall',
  'asyncParallel',
  'asyncParallelBail',
]);

const WATERFALL_STRATEGIES: ReadonlySet<HookStrategy> = new Set([
  'syncWaterfall',
  'asyncSeriesWaterfall',
]);

function createHook(strategy: HookStrategy): AnyTap {
  switch (strategy) {
    case 'sync':
      return new SyncHook(['context']);
    case 'syncBail':
      return new SyncBailHook(['context']);
    case 'syncWaterfall':
      return new SyncWaterfallHook(['context']);
    case 'asyncSeries':
      return new AsyncSeriesHook(['context']);
    case 'asyncSeriesBail':
      return new AsyncSeriesBailHook(['context']);
    case 'asyncSeriesWaterfall':
      return new AsyncSeriesWaterfallHook(['context']);
    case 'asyncParallel':
      return new AsyncParallelHook(['context']);
    case 'asyncParallelBail':
      return new AsyncParallelBailHook(['context']);
    default:
      throw new HookError(`Unsupported hook strategy: ${String(strategy)}`);
  }
}

export type HookTapFn<T> = (value: T) => T | undefined | void;
export type HookTapPromiseFn<T> = (value: T) => Promise<T | undefined | void>;

export interface HookContext<T> {
  readonly name: string;
  readonly strategy: HookStrategy;
  readonly value: T;
}

export class HookEngine<H extends HookMap> {
  private readonly instances = new Map<string, Entry>();

  constructor(defs: H) {
    for (const [name, def] of Object.entries(defs)) {
      this.register(name, def);
    }
  }

  register(name: string, def: HookDef): void {
    if (!this.instances.has(name)) {
      this.instances.set(name, { def, hook: createHook(def.strategy) });
    }
  }

  has(name: string): boolean {
    return this.instances.has(name);
  }

  getDef(name: string): HookDef | undefined {
    return this.instances.get(name)?.def;
  }

  list(): string[] {
    return [...this.instances.keys()];
  }

  private entry(name: string): Entry {
    const entry = this.instances.get(name);
    if (!entry) throw new UnknownHookError(name);
    return entry;
  }

  tap<T>(name: string, tapName: string, fn: HookTapFn<T>): void {
    const { hook } = this.entry(name);
    hook.tap(tapName, fn as (...args: any[]) => any);
  }

  tapPromise<T>(name: string, tapName: string, fn: HookTapPromiseFn<T>): void {
    const { hook } = this.entry(name);
    if (!hook.tapPromise) {
      throw new HookError(`Hook "${name}" does not support tapPromise. Use tap() for synchronous hooks.`);
    }
    hook.tapPromise(tapName, fn as (...args: any[]) => any);
  }

  tapAsync<T>(name: string, tapName: string, fn: (value: T, callback: (err?: Error | null, result?: T) => void) => void): void {
    const { hook } = this.entry(name);
    if (!hook.tapAsync) {
      throw new HookError(`Hook "${name}" does not support tapAsync. Use tap() for synchronous hooks.`);
    }
    hook.tapAsync(tapName, fn as (...args: any[]) => any);
  }

  intercept(name: string, interceptor: object): void {
    const { hook } = this.entry(name);
    hook.intercept?.(interceptor);
  }

  isAsync(name: string): boolean {
    const def = this.entry(name).def;
    return ASYNC_STRATEGIES.has(def.strategy);
  }

  isWaterfall(name: string): boolean {
    const def = this.entry(name).def;
    return WATERFALL_STRATEGIES.has(def.strategy);
  }

  call<T>(name: string, value: T): T {
    const entry = this.entry(name);
    if (ASYNC_STRATEGIES.has(entry.def.strategy)) {
      throw new HookError(
        `Hook "${name}" is asynchronous (${entry.def.strategy}). Use callAsync() instead of call().`,
      );
    }
    try {
      const result = (entry.hook as unknown as { call: (...args: any[]) => any }).call(value);
      return (result ?? value) as T;
    } catch (error) {
      throw new HookError(`Sync hook "${name}" failed`, error);
    }
  }

  async callAsync<T>(name: string, value: T): Promise<T> {
    const entry = this.entry(name);
    const hook = entry.hook as unknown as {
      promise?: (...args: any[]) => Promise<any>;
      call?: (...args: any[]) => any;
    };
    try {
      if (typeof hook.promise === 'function') {
        const result = await hook.promise(value);
        return (result ?? value) as T;
      }
      const result = hook.call?.(value);
      return (result ?? value) as T;
    } catch (error) {
      throw new HookError(`Async hook "${name}" failed`, error);
    }
  }

  clear(name: string): void {
    this.instances.delete(name);
  }

  clearAll(): void {
    this.instances.clear();
  }
}
