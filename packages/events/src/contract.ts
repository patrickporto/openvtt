import type { Schema } from './schema';
import type { SchemaOutput } from './schema';

export type EventMap = Record<string, Schema>;

export type HookStrategy =
  | 'sync'
  | 'syncBail'
  | 'syncWaterfall'
  | 'asyncSeries'
  | 'asyncSeriesBail'
  | 'asyncSeriesWaterfall'
  | 'asyncParallel'
  | 'asyncParallelBail';

export interface HookDef {
  strategy: HookStrategy;
  schema?: Schema;
}

export type HookMap = Record<string, HookDef>;

export interface ContractDef<E extends EventMap = EventMap, H extends HookMap = HookMap> {
  namespace?: string;
  events?: E;
  hooks?: H;
}

export interface Contract<E extends EventMap = EventMap, H extends HookMap = HookMap> {
  readonly namespace: string;
  readonly events: E;
  readonly hooks: H;
}

export function defineContract<E extends EventMap = EventMap, H extends HookMap = HookMap>(
  def: ContractDef<E, H>,
): Contract<E, H> {
  return {
    namespace: def.namespace ?? 'openvtt',
    events: (def.events ?? {}) as E,
    hooks: (def.hooks ?? {}) as H,
  };
}

export type EventPayload<E extends EventMap, K extends keyof E> = SchemaOutput<E[K]>;

export type HookPayload<H extends HookMap, K extends keyof H> = SchemaOutput<H[K]['schema']>;

export type WildcardHandler<E extends EventMap> = <K extends string & keyof E>(
  name: K,
  payload: EventPayload<E, K>,
  meta: import('./tracing').EventMeta,
) => void;
