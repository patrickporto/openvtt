import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { TrackerStore } from '../src/store';
import { normalizeTracker, TrackersSnapshotSchema } from '../src/schemas';
import { DND5E_COMBAT, GENERIC_HP } from '../src/presets';

const TOKEN = '0195b8c0-0000-7000-8000-000000000001';

function okValue(result: ReturnType<TrackerStore['applyMathInput']>): number {
  if (!result.ok) throw new Error(`expected ok result, got ${result.error}`);
  return result.value;
}

describe('TrackerStore crud', () => {
  it('upsert assigns UUID v7 ids and keeps order', () => {
    const store = new TrackerStore();
    const a = store.upsert(TOKEN, { name: 'HP' });
    const b = store.upsert(TOKEN, { name: 'AC' });
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(store.list(TOKEN).map((t) => t.name)).toEqual(['HP', 'AC']);
    expect(b.id).not.toBe(a.id);
  });

  it('upsert with existing id replaces in place', () => {
    const store = new TrackerStore();
    const a = store.upsert(TOKEN, { name: 'HP' });
    store.upsert(TOKEN, { name: 'AC' });
    store.upsert(TOKEN, { id: a.id, name: 'Hit Points', kind: 'bar', max: 20 });
    const list = store.list(TOKEN);
    expect(list.map((t) => t.name)).toEqual(['Hit Points', 'AC']);
    expect(list[0].kind).toBe('bar');
  });

  it('patch merges and revalidates with defaults', () => {
    const store = new TrackerStore();
    const a = store.upsert(TOKEN, { name: 'HP' });
    const patched = store.patch(TOKEN, a.id, { kind: 'bar', max: 20 });
    expect(patched?.kind).toBe('bar');
    expect(patched?.max).toBe(20);
    expect(patched?.side).toBe('bottom');
    expect(patched?.id).toBe(a.id);
  });

  it('reorder moves within bounds', () => {
    const store = new TrackerStore();
    const a = store.upsert(TOKEN, { name: 'A' });
    store.upsert(TOKEN, { name: 'B' });
    store.upsert(TOKEN, { name: 'C' });
    expect(store.reorder(TOKEN, a.id, 5)).toBe(true);
    expect(store.list(TOKEN).map((t) => t.name)).toEqual(['B', 'C', 'A']);
    expect(store.reorder(TOKEN, a.id, 0)).toBe(true);
    expect(store.list(TOKEN).map((t) => t.name)).toEqual(['A', 'B', 'C']);
  });

  it('remove single tracker and clear token', () => {
    const store = new TrackerStore();
    const a = store.upsert(TOKEN, { name: 'A' });
    store.upsert(TOKEN, { name: 'B' });
    expect(store.remove(TOKEN, a.id)).toBe(true);
    expect(store.list(TOKEN).map((t) => t.name)).toEqual(['B']);
    expect(store.remove(TOKEN)).toBe(true);
    expect(store.list(TOKEN)).toHaveLength(0);
    expect(store.remove(TOKEN)).toBe(false);
  });
});

describe('TrackerStore values', () => {
  it('setValue clamps to [min, max] by default', () => {
    const store = new TrackerStore();
    const t = store.upsert(TOKEN, { name: 'HP', kind: 'bar', value: 5, max: 10 });
    expect(store.setValue(TOKEN, t.id, 42)?.value).toBe(10);
    expect(store.setValue(TOKEN, t.id, -4)?.value).toBe(0);
    expect(store.setValue(TOKEN, t.id, 7)?.value).toBe(7);
  });

  it('setValue respects clamp: false for out-of-range storage', () => {
    const store = new TrackerStore();
    const t = store.upsert(TOKEN, { name: 'Initiative', value: 0, clamp: false, math: false });
    expect(store.setValue(TOKEN, t.id, -5)?.value).toBe(-5);
  });

  it('applyMathInput applies the Owl semantics with clamping', () => {
    const store = new TrackerStore();
    const t = store.upsert(TOKEN, { name: 'HP', kind: 'bar', value: 10, max: 12 });
    expect(store.applyMathInput(TOKEN, t.id, '-3')).toEqual({ ok: true, value: 7, tracker: store.get(TOKEN, t.id) });
    expect(okValue(store.applyMathInput(TOKEN, t.id, '+2'))).toBe(9);
    expect(okValue(store.applyMathInput(TOKEN, t.id, '=-4'))).toBe(0);
    expect(okValue(store.applyMathInput(TOKEN, t.id, '999'))).toBe(12);
  });

  it('applyMathInput rejects arithmetic when math is disabled', () => {
    const store = new TrackerStore();
    const t = store.upsert(TOKEN, { name: 'Temp', value: -2, math: false, clamp: false });
    expect(store.applyMathInput(TOKEN, t.id, '-3')).toEqual({ ok: false, error: 'math-disabled' });
    expect(okValue(store.applyMathInput(TOKEN, t.id, '=-3'))).toBe(-3);
  });

  it('applyMathInput surfaces parse errors and unknown trackers', () => {
    const store = new TrackerStore();
    const t = store.upsert(TOKEN, { name: 'HP' });
    expect(store.applyMathInput(TOKEN, t.id, 'abc')).toEqual({ ok: false, error: 'invalid-number' });
    expect(store.applyMathInput(TOKEN, t.id, '')).toEqual({ ok: false, error: 'empty' });
    expect(store.applyMathInput(TOKEN, 'missing', '1')).toEqual({ ok: false, error: 'unknown-tracker' });
  });

  it('emits value events with before/after', () => {
    const store = new TrackerStore();
    const events: string[] = [];
    store.onChange((event) => events.push(event.kind));
    const t = store.upsert(TOKEN, { name: 'HP' });
    store.setValue(TOKEN, t.id, 3);
    expect(events).toEqual(['upsert', 'value']);
  });
});

describe('TrackerStore defaults', () => {
  it('applyDefaultsTo fills only missing names', () => {
    const store = new TrackerStore();
    store.setDefaults(DND5E_COMBAT.trackers);
    store.upsert(TOKEN, { name: 'HP', kind: 'bar', value: 3, max: 8 });
    const applied = store.applyDefaultsTo([TOKEN]);
    expect(applied).toBe(1);
    const names = store.list(TOKEN).map((t) => t.name);
    expect(names).toEqual(['HP', 'Temp HP', 'AC']);
    expect(store.get(TOKEN, store.list(TOKEN)[0].id)?.value).toBe(3);
  });

  it('saveAsDefaults copies token trackers', () => {
    const store = new TrackerStore();
    store.upsert(TOKEN, { name: 'Sanity', kind: 'bar', value: 9, max: 9 });
    expect(store.saveAsDefaults(TOKEN)).toBe(true);
    expect(store.defaults().map((t) => t.name)).toEqual(['Sanity']);
  });

  it('presets normalize cleanly through setDefaults', () => {
    const store = new TrackerStore();
    store.setDefaults(GENERIC_HP.trackers);
    const def = store.defaults()[0];
    expect(def.kind).toBe('bar');
    expect(def.label).toBe('fraction');
    expect(def.id).toBeDefined();
  });
});

describe('TrackerStore resolvers', () => {
  it('inline is the default source', () => {
    const store = new TrackerStore();
    const t = store.upsert(TOKEN, { name: 'HP', kind: 'bar', value: 4, max: 6 });
    expect(store.resolveSource(TOKEN, t)).toEqual({ value: 4, max: 6 });
  });

  it('custom resolvers override value and max', () => {
    const store = new TrackerStore();
    store.registerResolver('sheet', ({ tracker }) => ({ value: 20, max: tracker.max ?? 20 }));
    const t = store.upsert(TOKEN, { name: 'HP', source: 'sheet', max: 10 });
    expect(store.resolveSource(TOKEN, t)).toEqual({ value: 20, max: 10 });
  });

  it('numeric resolver results keep tracker max', () => {
    const store = new TrackerStore();
    store.registerResolver('dice', () => 3);
    const t = store.upsert(TOKEN, { name: 'Level', source: 'dice', max: 20 });
    expect(store.resolveSource(TOKEN, t)).toEqual({ value: 3, max: 20 });
  });

  it('failing resolvers fall back to inline', () => {
    const store = new TrackerStore();
    store.registerResolver('boom', () => {
      throw new Error('no sheet');
    });
    store.registerResolver('nullish', () => null);
    const a = store.upsert(TOKEN, { name: 'A', value: 7, source: 'boom' });
    const b = store.upsert(TOKEN, { name: 'B', value: 8, source: 'nullish' });
    expect(store.resolveSource(TOKEN, a).value).toBe(7);
    expect(store.resolveSource(TOKEN, b).value).toBe(8);
  });

  it('unknown sources fall back to inline', () => {
    const store = new TrackerStore();
    const t = store.upsert(TOKEN, { name: 'A', value: 5, source: 'nope' });
    expect(store.resolveSource(TOKEN, t).value).toBe(5);
  });
});

describe('TrackerStore serialization', () => {
  it('round-trips through serialize/hydrate', () => {
    const store = new TrackerStore();
    store.setDefaults(DND5E_COMBAT.trackers);
    const t = store.upsert(TOKEN, { name: 'HP', kind: 'bar', value: 7, max: 12, label: 'fraction' });

    const clone = new TrackerStore();
    clone.hydrate(store.serialize());

    expect(clone.list(TOKEN).map((x) => ({ ...x }))).toEqual(store.list(TOKEN).map((x) => ({ ...x })));
    expect(clone.get(TOKEN, t.id)?.value).toBe(7);
    expect(clone.defaults().map((d) => d.name)).toEqual(store.defaults().map((d) => d.name));
  });

  it('hydrate rejects invalid snapshots', () => {
    const store = new TrackerStore();
    expect(() => store.hydrate({ version: 2 })).toThrow();
    expect(() => store.hydrate({ version: 1, defaults: [{ name: '' }], tokens: {} })).toThrow();
  });

  it('schema rejects invalid tracker fields', () => {
    expect(() => normalizeTracker({ name: 'x', opacity: 5 } as never)).toThrow();
    expect(() => normalizeTracker({ name: 'x', segments: 99 } as never)).toThrow();
    expect(() => normalizeTracker({ name: 'x', id: 'not-uuid' } as never)).toThrow();
  });
});

describe('TrackerStore prune', () => {
  it('evicts state of tokens absent from the valid set', () => {
    const store = new TrackerStore();
    store.setDefaults(DND5E_COMBAT.trackers);
    store.upsert(TOKEN, { name: 'HP' });
    store.upsert('0195b8c0-0000-7000-8000-000000000002', { name: 'AC' });

    const removed = store.prune([TOKEN]);

    expect(removed).toBe(1);
    expect(store.list('0195b8c0-0000-7000-8000-000000000002')).toHaveLength(0);
    expect(store.list(TOKEN)).toHaveLength(1);
    expect(store.defaults()).toHaveLength(3);
  });

  it('emits prune with removed ids and nothing when no-op', () => {
    const store = new TrackerStore();
    const events: string[] = [];
    store.onChange((event) => events.push(event.kind));
    store.upsert(TOKEN, { name: 'HP' });

    expect(store.prune([TOKEN])).toBe(0);
    expect(events).toEqual(['upsert']);

    expect(store.prune([])).toBe(1);
    expect(events).toEqual(['upsert', 'prune']);
  });

  it('serialize output validates against the snapshot schema after prune', () => {
    const store = new TrackerStore();
    store.upsert(TOKEN, { name: 'HP' });
    store.upsert('0195b8c0-0000-7000-8000-000000000003', { name: 'AC' });
    store.prune([TOKEN]);
    const snapshot = store.serialize();
    expect(Object.keys(snapshot.tokens)).toEqual([TOKEN]);
    expect(() => v.parse(TrackersSnapshotSchema, JSON.parse(JSON.stringify(snapshot)))).not.toThrow();
  });
});
