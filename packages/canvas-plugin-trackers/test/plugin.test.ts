import './globals';
import { describe, expect, it } from 'bun:test';
import { TrackersPlugin } from '../src/plugin';
import { DND5E_COMBAT, defineTrackerPreset, type TrackerPreset } from '../src/presets';
import { EVERYTHING_VIEWER } from '../src/resolve';

describe('TrackersPlugin standalone (sem canvas)', () => {
  it('resolve() funciona antes do install via fallback sem hooks', () => {
    const plugin = new TrackersPlugin();
    const t = plugin.upsert('t1', { name: 'HP', kind: 'bar', value: 8, max: 10, label: 'fraction' });
    const resolved = plugin.resolve('t1');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].label).toBe('8/10');
    expect(resolved[0].ratio).toBeCloseTo(0.8);
    expect(resolved[0].tracker.id).toBe(t.id);
  });

  it('viewer default vê tudo como GM', () => {
    const plugin = new TrackersPlugin();
    plugin.upsert('t1', { name: 'HP', kind: 'bar', value: 1, max: 5, audience: { others: 'never' } });
    expect(plugin.resolve('t1')[0].visible).toBe(true);
    expect(plugin.viewer).toEqual(EVERYTHING_VIEWER);
  });

  it('viewer factory é reavaliada a cada resolve', () => {
    let role: 'gm' | 'player' = 'gm';
    const plugin = new TrackersPlugin({ viewer: () => ({ role, owns: () => false }) });
    plugin.upsert('t1', { name: 'HP', audience: { gm: 'always', others: 'never' } });
    expect(plugin.resolve('t1')[0].visible).toBe(true);
    role = 'player';
    expect(plugin.resolve('t1')[0].visible).toBe(false);
  });

  it('registerPreset adiciona e o dispose remove', () => {
    const plugin = new TrackersPlugin();
    const preset: TrackerPreset = defineTrackerPreset({ id: 'custom', name: 'Custom', trackers: [] });
    const dispose = plugin.registerPreset(preset);
    expect(plugin.presets().map((p) => p.id)).toContain('custom');
    dispose();
    expect(plugin.presets().map((p) => p.id)).not.toContain('custom');
  });

  it('instâncias têm stores independentes', () => {
    const a = new TrackersPlugin();
    const b = new TrackersPlugin();
    a.upsert('t1', { name: 'HP' });
    expect(b.list('t1')).toHaveLength(0);
    expect(a.store).not.toBe(b.store);
  });

  it('options.defaults viram defaults de cena no install-like fluxo', () => {
    const plugin = new TrackersPlugin({ defaults: DND5E_COMBAT.trackers });
    expect(plugin.defaults()).toHaveLength(0);
    plugin.store.setDefaults(DND5E_COMBAT.trackers);
    expect(plugin.defaults()).toHaveLength(3);
  });

  it('serialize/hydrate via plugin preserva estado', () => {
    const plugin = new TrackersPlugin();
    plugin.upsert('t1', { name: 'HP', kind: 'bar', value: 3, max: 6 });
    const clone = new TrackersPlugin();
    clone.hydrate(plugin.serialize());
    expect(clone.list('t1')[0].value).toBe(3);
  });
});
