import { afterAll, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import * as v from 'valibot';

GlobalRegistrator.register();

const { Canvas } = await import('../src/canvas');
const { PlaceableObject } = await import('../src/placeables/PlaceableObject');
const { LockableSchemaEntries } = await import('../src/schemas');
const { HistoryManager } = await import('../src/history/HistoryManager');

afterAll(() => {
  GlobalRegistrator.unregister();
});

class FakePlaceable extends PlaceableObject<any> {
  readonly objectType = 'token';

  get bounds() {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  refresh(): void {}
}

async function setup() {
  const canvas = new Canvas(document.createElement('div'));
  canvas.documents.registerType({
    type: 'token',
    schema: v.object({
      ...LockableSchemaEntries,
      id: v.optional(v.string()),
      x: v.number(),
      y: v.number(),
    }),
    placeable: FakePlaceable,
    layer: { label: 'Tokens' },
  });
  const obj = (await canvas.documents.create('token', { x: 0, y: 0 })) as PlaceableObject<any>;
  return { canvas, obj };
}

describe('placeable lock', () => {
  it('documents default to unlocked via the schema entries', async () => {
    const { canvas, obj } = await setup();
    expect(obj.isLocked).toBe(false);
    expect((obj.document as { locked: boolean }).locked).toBe(false);
    canvas.destroy();
  });

  it('create() with locked: true survives the schema parse', async () => {
    const { canvas } = await setup();
    const locked = (await canvas.documents.create('token', { x: 200, y: 0, locked: true } as never)) as PlaceableObject<any>;
    expect(locked.isLocked).toBe(true);
    canvas.destroy();
  });

  it('pick and pickRect ignore locked objects unless includeLocked', async () => {
    const { canvas, obj } = await setup();
    expect(canvas.pick({ x: 50, y: 50 })).toBe(obj);

    canvas.setLocked(obj, true);
    expect(canvas.pick({ x: 50, y: 50 })).toBeUndefined();
    expect(canvas.pick({ x: 50, y: 50 }, { includeLocked: true })).toBe(obj);
    expect(canvas.pickRect({ x: 0, y: 0, width: 500, height: 500 })).toEqual([]);
    expect(canvas.pickRect({ x: 0, y: 0, width: 500, height: 500 }, { includeLocked: true })).toEqual([obj]);
    canvas.destroy();
  });

  it('setLocked writes the document, emits document:update and deselects on lock', async () => {
    const { canvas, obj } = await setup();
    const updates: string[] = [];
    canvas.on('document:update', (payload) => updates.push(payload.id));

    canvas.select(obj, false);
    expect(canvas.selection.has(obj.id)).toBe(true);

    canvas.setLocked(obj, true);
    expect(obj.isLocked).toBe(true);
    expect(canvas.selection.has(obj.id)).toBe(false);
    expect(updates).toEqual([obj.id]);

    canvas.setLocked(obj.id, false);
    expect(obj.isLocked).toBe(false);
    canvas.destroy();
  });

  it('setLocked is a no-op when the state already matches', async () => {
    const { canvas, obj } = await setup();
    const updates: string[] = [];
    canvas.on('document:update', (payload) => updates.push(payload.id));
    canvas.setLocked(obj, false);
    expect(updates).toEqual([]);
    canvas.destroy();
  });

  it('deleteObject and deleteSelected skip locked objects', async () => {
    const { canvas, obj } = await setup();
    canvas.setLocked(obj, true);
    expect(canvas.deleteObject(obj)).toBe(false);
    expect(canvas.documents.get('token', obj.id)).toBe(obj);

    canvas.select(obj, false);
    canvas.deleteSelected();
    expect(canvas.documents.get('token', obj.id)).toBe(obj);

    canvas.setLocked(obj, false);
    canvas.select(obj, false);
    canvas.deleteSelected();
    expect(canvas.documents.get('token', obj.id)).toBeUndefined();
    canvas.destroy();
  });

  it('lock toggles are recorded in history and undoable', async () => {
    const { canvas, obj } = await setup();
    canvas.history = new HistoryManager(canvas);

    canvas.setLocked(obj, true);
    expect(obj.isLocked).toBe(true);

    await canvas.history.undo();
    expect(obj.isLocked).toBe(false);

    await canvas.history.redo();
    expect(obj.isLocked).toBe(true);
    canvas.destroy();
  });

  it('toggleLock flips the selection and is a no-op without one', async () => {
    const { canvas, obj } = await setup();
    canvas.toggleLock();
    expect(obj.isLocked).toBe(false);

    canvas.select(obj, false);
    canvas.toggleLock();
    expect(obj.isLocked).toBe(true);

    canvas.select(obj, false);
    canvas.toggleLock();
    expect(obj.isLocked).toBe(false);
    canvas.destroy();
  });
});
