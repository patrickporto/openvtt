import { dynamicBus, type CanvasBus } from '@openvtt/canvas';
import type {
  TrackersAppliedEvent,
  TrackersChangedEvent,
  TrackersLabelPayload,
  TrackersResolvePayload,
  TrackersValueEvent,
  TrackersVisibilityPayload,
} from './schemas';

/**
 * Porta tipada para eventos/hooks dinâmicos registrados por este plugin no
 * bus do canvas (o mesmo truque de `dynamicBus`, para `tap`/`call`).
 */
export interface TrackerBusPort {
  tap(name: string, tapName: string, fn: (value: any) => any): void;
  call<T>(name: string, value: T): T;
}

export function trackerBusPort(bus: CanvasBus): TrackerBusPort {
  return bus as unknown as TrackerBusPort;
}

/**
 * Taps do pipeline de trackers. Taps de waterfall retornam o payload
 * modificado — retornar `undefined` preserva o valor atual.
 */
export interface TrackerHookTaps {
  resolve?(payload: TrackersResolvePayload): TrackersResolvePayload | void;
  label?(payload: TrackersLabelPayload): TrackersLabelPayload | void;
  visibility?(payload: TrackersVisibilityPayload): TrackersVisibilityPayload | void;
}

/**
 * Registra taps nos hooks `trackers:resolve|label|visibility` do bus.
 * Os taps vivem enquanto o bus viver (não há untap no engine).
 */
export function tapTrackersHooks(bus: CanvasBus, tapName: string, taps: TrackerHookTaps): void {
  const port = trackerBusPort(bus);
  if (taps.resolve) port.tap('trackers:resolve', tapName, taps.resolve);
  if (taps.label) port.tap('trackers:label', tapName, taps.label);
  if (taps.visibility) port.tap('trackers:visibility', tapName, taps.visibility);
}

export interface TrackersEventHandlers {
  changed?(payload: TrackersChangedEvent): void;
  value?(payload: TrackersValueEvent): void;
  applied?(payload: TrackersAppliedEvent): void;
}

/** Assina os eventos `trackers:*` tipados; retorna função de cancelamento. */
export function onTrackersEvents(bus: CanvasBus, handlers: TrackersEventHandlers): () => void {
  const port = dynamicBus(bus);
  const unsubs: Array<() => void> = [];
  if (handlers.changed) unsubs.push(port.on('trackers:changed', (payload: TrackersChangedEvent) => handlers.changed!(payload)));
  if (handlers.value) unsubs.push(port.on('trackers:value', (payload: TrackersValueEvent) => handlers.value!(payload)));
  if (handlers.applied) unsubs.push(port.on('trackers:applied', (payload: TrackersAppliedEvent) => handlers.applied!(payload)));
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
