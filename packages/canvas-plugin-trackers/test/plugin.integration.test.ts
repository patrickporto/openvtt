import './globals';
import { installDocumentFake, removeDocumentFake } from './globals';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas, ContextMenuItem, ContextMenuContext } from '@openvtt/canvas';
import type { TokensPlugin } from '@openvtt/canvas-plugin-tokens';
import type { TrackersPlugin } from '../src/plugin';
import { tapTrackersHooks } from '../src/hooks';
import { trackersSelectionMenu, trackersSceneMenu, type TrackersMenuApi } from '../src/contextmenu';
import type { Tracker } from '../src/schemas';

let CanvasCtor: typeof Canvas;
let dynamicBusMod: typeof import('@openvtt/canvas');
let tokensPlugin: TokensPlugin;
let TrackersPluginCtor: typeof TrackersPlugin;
let canvas: Canvas;
let trackers: TrackersPlugin;

beforeAll(async () => {
  installDocumentFake();
  dynamicBusMod = await import('@openvtt/canvas');
  ({ Canvas: CanvasCtor } = dynamicBusMod);
  ({ tokensPlugin } = await import('@openvtt/canvas-plugin-tokens'));
  ({ TrackersPlugin: TrackersPluginCtor } = await import('../src/plugin'));

  canvas = new CanvasCtor({} as HTMLElement);
  await canvas.use(tokensPlugin as never);
  trackers = new TrackersPluginCtor({
    defaults: [
      { name: 'HP', kind: 'bar', value: 10, max: 10, label: 'none' },
    ],
  });
  await canvas.use(trackers as never);
});

afterAll(() => {
  canvas?.destroy();
  removeDocumentFake();
});

function menuCtx(selection: { objectType: string; id: string }[]): ContextMenuContext {
  return {
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    target: { type: 'canvas' },
    selection: selection as never,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

function walk(items: readonly ContextMenuItem[], visit: (item: ContextMenuItem) => void): void {
  for (const item of items) {
    visit(item);
    if (item.type === 'action' && item.submenu) walk(item.submenu, visit);
  }
}

function findItem(items: readonly ContextMenuItem[], id: string): ContextMenuItem | undefined {
  let found: ContextMenuItem | undefined;
  walk(items, (item) => {
    if (item.id === id) found = item;
  });
  return found;
}

describe('TrackersPlugin install', () => {
  it('registra eventos e hooks trackers:* no bus', () => {
    expect(canvas.bus.hasEvent('trackers:changed')).toBe(true);
    expect(canvas.bus.hasEvent('trackers:value')).toBe(true);
    expect(canvas.bus.hasEvent('trackers:applied')).toBe(true);
    for (const hook of ['trackers:resolve', 'trackers:label', 'trackers:visibility']) {
      expect(canvas.bus.hookNames()).toContain(hook);
    }
  });

  it('options.defaults viram defaults de cena', () => {
    expect(trackers.defaults().map((t) => t.name)).toEqual(['HP']);
  });
});

describe('ciclo de vida de tokens', () => {
  it('auto-aplica defaults a tokens criados quando habilitado', async () => {
    trackers.setAutoApplyDefaults(true);
    const token = await canvas.documents.create('token', { x: 50, y: 50 });
    expect(trackers.list(token.id).map((t) => t.name)).toEqual(['HP']);
    trackers.setAutoApplyDefaults(false);
    const other = await canvas.documents.create('token', { x: 150, y: 50 });
    expect(trackers.list(other.id)).toHaveLength(0);
    canvas.documents.delete('token', token.id);
    canvas.documents.delete('token', other.id);
  });

  it('teardown de cena não deixa views órfãs: mutação posterior não lança', async () => {
    const token = await canvas.documents.create('token', { x: 100, y: 100 });
    trackers.upsert(token.id, { name: 'HP', kind: 'bar', value: 5, max: 10, label: 'none' });
    canvas.bus.call('scene:teardown', {});
    trackers.setValue(token.id, trackers.list(token.id)[0].id, 7);
    expect(() => canvas.bus.emit('selection:change', { ids: [] })).not.toThrow();
    await canvas.documents.tearDownAll();
  });
});

describe('pipeline de resolução com hooks', () => {
  it('tap trackers:resolve sobrepõe o valor base', async () => {
    const token = await canvas.documents.create('token', { x: 10, y: 10 });
    trackers.upsert(token.id, { name: 'MP', kind: 'bar', value: 2, max: 10, label: 'fraction' });
    tapTrackersHooks(canvas.bus, 'test-override', {
      resolve: (p) => (p.tracker.name === 'MP' ? { ...p, value: 10 } : undefined),
    });
    const resolved = trackers.resolve(token.id).find((r) => r.tracker.name === 'MP');
    expect(resolved?.value).toBe(10);
    expect(resolved?.ratio).toBe(1);
    expect(resolved?.label).toBe('10/10');
    canvas.documents.delete('token', token.id);
  });

  it('saída de hook inválida reverte para o valor base', async () => {
    const token = await canvas.documents.create('token', { x: 20, y: 20 });
    trackers.upsert(token.id, { name: 'AC', kind: 'counter', value: 15 });
    tapTrackersHooks(canvas.bus, 'test-bad-tap', {
      label: (p) => ({ ...p, label: 42 as never }),
      visibility: (p) => ({ ...p, visible: 'yes' as never }),
    });
    const resolved = trackers.resolve(token.id).find((r) => r.tracker.name === 'AC');
    expect(resolved?.label).toBe('15');
    expect(resolved?.visible).toBe(true);
    canvas.documents.delete('token', token.id);
  });
});

describe('eventos no bus', () => {
  it('applyMathInput emite trackers:value e trackers:changed', async () => {
    const token = await canvas.documents.create('token', { x: 30, y: 30 });
    const t = trackers.upsert(token.id, { name: 'HP', kind: 'bar', value: 10, max: 12 });
    const events: Array<{ name: string; payload: any }> = [];
    const port = dynamicBusMod.dynamicBus(canvas.bus);
    const unsubA = port.on('trackers:value', (p: any) => events.push({ name: 'trackers:value', payload: p }));
    const unsubB = port.on('trackers:changed', (p: any) => events.push({ name: 'trackers:changed', payload: p }));

    trackers.applyMathInput(token.id, t.id, '-3');

    unsubA();
    unsubB();
    expect(events[0]).toEqual({
      name: 'trackers:value',
      payload: { tokenId: token.id, trackerId: t.id, name: 'HP', before: 10, after: 7 },
    });
    expect(events[1].payload).toEqual({ scope: 'token', tokenId: token.id, trackerId: t.id });
    canvas.documents.delete('token', token.id);
  });
});

describe('context menu (fábricas puras)', () => {
  const api: TrackersMenuApi = {
    list: (tokenId) => (tokenId === 't1' ? ([{ id: 'a', name: 'HP', value: 1 }] as never as Tracker[]) : []),
    get: () => undefined,
    upsert: () => ({}) as never,
    patch: () => undefined,
    reorder: () => false,
    remove: () => false,
    applyMathInput: () => ({ ok: true, value: 1, tracker: {} as never }),
    defaults: () => [{ id: 'd1', name: 'HP' }] as never as Tracker[],
    setDefaults: () => [],
    saveAsDefaults: () => false,
    applyDefaultsTo: () => 0,
    presets: () => [],
    autoApplyDefaults: false,
    setAutoApplyDefaults: () => {},
  };

  it('menu de seleção sem tokens não contribui itens', () => {
    const contribution = trackersSelectionMenu(api);
    expect(contribution.items(menuCtx([]))).toHaveLength(0);
  });

  it('menu de seleção com token lista quick rows, configure e apply defaults', () => {
    const items = trackersSelectionMenu(api).items(menuCtx([{ objectType: 'token', id: 't1' }]));
    expect(items).toHaveLength(1);
    const submenu = items[0] as { id: string; submenu?: ContextMenuItem[] };
    expect(submenu.id).toBe('trackers:menu');
    const ids: string[] = [];
    walk(submenu.submenu ?? [], (item) => ids.push(item.id));
    expect(ids).toContain('trackers:quick:a');
    expect(ids).toContain('trackers:configure');
    expect(ids).toContain('trackers:apply-defaults');
  });

  it('menu de cena expõe defaults, presets e auto-apply', () => {
    const items = trackersSceneMenu(api).items(menuCtx([]));
    const ids: string[] = [];
    walk(items, (item) => ids.push(item.id));
    expect(ids).toContain('trackers:defaults');
    expect(ids).toContain('trackers:presets');
    expect(ids).toContain('trackers:auto-apply');
  });
});
