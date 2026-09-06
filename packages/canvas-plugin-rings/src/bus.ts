import type { CanvasBus } from '@openvtt/canvas';
import type { RingData, RingStyle } from './schemas';

export interface RingStyleContext {
  readonly ring: {
    readonly id: string;
    readonly tokenId: string;
    readonly preset?: string;
    readonly label?: string;
  };
  readonly style: RingStyle;
}

export interface RingAddedEvent {
  readonly ring: RingData;
  readonly tokenId: string;
}

export interface RingRemovedEvent {
  readonly ringId: string;
  readonly tokenId: string;
}

export interface RingsClearedEvent {
  readonly tokenId: string;
  readonly count: number;
}

interface RingsBusRuntime {
  on(name: 'ring:added', handler: (payload: RingAddedEvent) => void): () => void;
  on(name: 'ring:removed', handler: (payload: RingRemovedEvent) => void): () => void;
  on(name: 'rings:cleared', handler: (payload: RingsClearedEvent) => void): () => void;
  tap(
    name: 'rings:resolve-style',
    tapName: string,
    fn: (ctx: RingStyleContext) => RingStyleContext,
  ): void;
  call(name: 'rings:resolve-style', ctx: RingStyleContext): RingStyleContext;
}

export interface RingsBusPort {
  onRingAdded(handler: (e: RingAddedEvent) => void): () => void;
  onRingRemoved(handler: (e: RingRemovedEvent) => void): () => void;
  onRingsCleared(handler: (e: RingsClearedEvent) => void): () => void;
  tapResolveStyle(tapName: string, fn: (ctx: RingStyleContext) => RingStyleContext): void;
  callResolveStyle(ctx: RingStyleContext): RingStyleContext;
}

export function ringsBus(bus: CanvasBus): RingsBusPort {
  const runtime = bus as unknown as RingsBusRuntime;
  return {
    onRingAdded: (handler) => runtime.on('ring:added', handler),
    onRingRemoved: (handler) => runtime.on('ring:removed', handler),
    onRingsCleared: (handler) => runtime.on('rings:cleared', handler),
    tapResolveStyle: (tapName, fn) => runtime.tap('rings:resolve-style', tapName, fn),
    callResolveStyle: (ctx) => runtime.call('rings:resolve-style', ctx),
  };
}
