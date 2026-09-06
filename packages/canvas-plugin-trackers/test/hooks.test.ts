import './globals';
import { describe, expect, it, mock } from 'bun:test';
import { createBus } from '@openvtt/events';
import {
  onTrackersEvents,
  tapTrackersHooks,
  TrackersAppliedEventSchema,
  TrackersChangedEventSchema,
  TrackersLabelHookSchema,
  TrackersResolveHookSchema,
  TrackersValueEventSchema,
  TrackersVisibilityHookSchema,
} from '../src';

function trackersBus() {
  const bus = createBus({ namespace: 'test' });
  bus.registerEvent('trackers:changed', TrackersChangedEventSchema);
  bus.registerEvent('trackers:value', TrackersValueEventSchema);
  bus.registerEvent('trackers:applied', TrackersAppliedEventSchema);
  bus.registerHook('trackers:resolve', { strategy: 'syncWaterfall', schema: TrackersResolveHookSchema });
  bus.registerHook('trackers:label', { strategy: 'syncWaterfall', schema: TrackersLabelHookSchema });
  bus.registerHook('trackers:visibility', { strategy: 'syncWaterfall', schema: TrackersVisibilityHookSchema });
  return bus;
}

describe('tapTrackersHooks', () => {
  it('taps alteram o payload e retorno void preserva o valor', () => {
    const bus = trackersBus();
    tapTrackersHooks(bus, 'demo', {
      resolve: (p) => ({ ...p, value: 99 }),
      label: (p) => ({ ...p, label: `★ ${p.label}` }),
      visibility: (p) => (p.visible ? p : undefined),
    });
    const resolved = bus.call('trackers:resolve', {
      tokenId: 't1',
      tracker: { id: 'a', name: 'HP', kind: 'bar' },
      value: 1,
    });
    expect(resolved.value).toBe(99);
    const labeled = bus.call('trackers:label', {
      tokenId: 't1',
      tracker: { id: 'a', name: 'HP', kind: 'bar' },
      value: 1,
      label: '1',
    });
    expect(labeled.label).toBe('★ 1');
    const hidden = bus.call('trackers:visibility', {
      tokenId: 't1',
      tracker: { id: 'a', name: 'HP', kind: 'bar' },
      visible: false,
    });
    expect(hidden.visible).toBe(false);
  });

  it('payloads fora do schema são rejeitados pelo bus (throw)', () => {
    const bus = trackersBus();
    expect(() =>
      bus.call('trackers:resolve', {
        tokenId: 't1',
        tracker: { id: 'a', name: 'HP', kind: 'bar' },
        value: Number.NaN,
      }),
    ).toThrow();
  });
});

describe('onTrackersEvents', () => {
  it('entrega payloads tipados e o unsub cancela todos', () => {
    const bus = trackersBus();
    const changed = mock();
    const value = mock();
    const applied = mock();
    const unsub = onTrackersEvents(bus, { changed, value, applied });

    bus.emit('trackers:changed', { scope: 'defaults' });
    bus.emit('trackers:value', { tokenId: 't1', trackerId: 'a', name: 'HP', before: 3, after: 2 });
    bus.emit('trackers:applied', { tokenIds: ['t1'], count: 1 });

    expect(changed).toHaveBeenCalledTimes(1);
    expect(value).toHaveBeenCalledWith({ tokenId: 't1', trackerId: 'a', name: 'HP', before: 3, after: 2 });
    expect(applied).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit('trackers:changed', { scope: 'all' });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('handlers omitidos não assinam nada', () => {
    const bus = trackersBus();
    const unsub = onTrackersEvents(bus, {});
    expect(() => unsub()).not.toThrow();
  });
});
