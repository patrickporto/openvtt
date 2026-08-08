import mitt, { type Emitter } from 'mitt';
import type { EventMap, EventPayload } from './contract';
import type { EventMeta } from './tracing';

interface Envelope {
  payload: unknown;
  meta: EventMeta;
}

type TypedHandler<E extends EventMap, K extends keyof E> = (
  payload: EventPayload<E, K>,
  meta: EventMeta,
) => void;

type EnvelopeHandler = (envelope: Envelope) => void;
type AnyHandler = (payload: unknown, meta: EventMeta) => void;
type WildcardAnyHandler = (name: string, payload: unknown, meta: EventMeta) => void;

const WILDCARD = '*';
const ORIGINAL = Symbol('original');

interface TaggedHandler {
  [ORIGINAL]?: unknown;
}

export class NotifyBus<E extends EventMap> {
  private readonly emitter: Emitter<Record<string, Envelope>> = mitt<Record<string, Envelope>>();
  private readonly wildcardHandlers = new Set<AnyHandler>();

  on<K extends string & keyof E>(name: K, handler: TypedHandler<E, K>): () => void {
    if (name === WILDCARD) {
      throw new TypeError('Use onAny() to subscribe to all events.');
    }
    const wrapped: EnvelopeHandler & TaggedHandler = (env) => handler(env.payload as EventPayload<E, K>, env.meta);
    wrapped[ORIGINAL] = handler;
    this.emitter.on(name as string, wrapped as (env: Envelope) => void);
    return () => this.emitter.off(name as string, wrapped as (env: Envelope) => void);
  }

  once<K extends string & keyof E>(name: K, handler: TypedHandler<E, K>): () => void {
    const off = this.on(name, (payload, meta) => {
      off();
      handler(payload, meta);
    });
    return off;
  }

  off<K extends string & keyof E>(name: K, handler: TypedHandler<E, K>): void {
    const set = this.emitter.all.get(name as string);
    if (!set) return;
    for (const wrapped of [...set]) {
      if ((wrapped as TaggedHandler)[ORIGINAL] === handler) {
        this.emitter.off(name as string, wrapped as (env: Envelope) => void);
      }
    }
  }

  onAny(handler: WildcardAnyHandler): () => void {
    const wrapped: AnyHandler & TaggedHandler = (payload, meta) => handler(meta.name, payload, meta);
    wrapped[ORIGINAL] = handler;
    this.wildcardHandlers.add(wrapped);
    return () => {
      this.wildcardHandlers.delete(wrapped);
    };
  }

  offAny(handler: WildcardAnyHandler): void {
    for (const wrapped of [...this.wildcardHandlers]) {
      if ((wrapped as TaggedHandler)[ORIGINAL] === handler) {
        this.wildcardHandlers.delete(wrapped);
      }
    }
  }

  offAll(): void {
    this.emitter.all.clear();
    this.wildcardHandlers.clear();
  }

  dispatch(
    name: string,
    payload: unknown,
    meta: EventMeta,
    onError: (error: unknown, meta: EventMeta) => void,
  ): void {
    const set = this.emitter.all.get(name);
    if (set) {
      const envelope: Envelope = { payload, meta };
      for (const wrapped of [...set]) {
        try {
          (wrapped as (env: Envelope) => void)(envelope);
        } catch (error) {
          onError(error, meta);
        }
      }
    }
    for (const handler of [...this.wildcardHandlers]) {
      try {
        handler(payload, meta);
      } catch (error) {
        onError(error, meta);
      }
    }
  }
}
