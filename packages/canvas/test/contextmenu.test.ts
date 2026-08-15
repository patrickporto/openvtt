import { describe, it, expect } from 'bun:test';
import { createCanvasBus } from '../src/bus';
import { MENU_ORDER, menu, menuWhen } from '../src/contextmenu/builders';
import { ContextMenuManager, normalizeItems } from '../src/contextmenu/ContextMenuManager';
import { PluginManager } from '../src/plugins/PluginManager';
import { definePlugin } from '../src/plugins/types';
import type { Canvas } from '../src/canvas';
import type { CanvasPointerInfo, PointerTarget } from '../src/input/types';
import type { ContextMenuAction, ContextMenuContext, ContextMenuItem } from '../src/contextmenu/types';

function action(id: string, order?: number): ContextMenuAction {
  return { type: 'action', id, label: id, order };
}

function separator(id: string): ContextMenuItem {
  return { type: 'separator', id };
}

function fakeObject(id: string): any {
  return { id, objectType: 'token' };
}

function fakeCanvas(): {
  canvas: Canvas;
  bus: ReturnType<typeof createCanvasBus>;
  manager: ContextMenuManager;
  selectCalls: Array<{ id: string; additive: boolean }>;
} {
  const bus = createCanvasBus();
  const selection = new Set<string>();
  const selected: any[] = [];
  const selectCalls: Array<{ id: string; additive: boolean }> = [];
  const canvas = {
    bus,
    selection,
    selected,
    grid: { size: 50 },
    select: (obj: any, additive?: boolean) => {
      selectCalls.push({ id: obj.id, additive: additive ?? false });
      selection.add(obj.id);
      selected.push(obj);
    },
    deleteSelected: () => {},
    documents: { create: () => Promise.resolve({}) },
  } as unknown as Canvas;
  const manager = new ContextMenuManager(canvas);
  (canvas as unknown as { contextMenu: ContextMenuManager }).contextMenu = manager;
  return { canvas, bus, manager, selectCalls };
}

function pointer(target: PointerTarget): CanvasPointerInfo {
  return {
    point: { x: 100, y: 200 },
    screenPoint: { x: 10, y: 20 },
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    accelKey: false,
    button: 2,
    buttons: 2,
    pointerId: -1,
    device: 'mouse',
    target,
  };
}

function menuCtx(over: Partial<ContextMenuContext> = {}): ContextMenuContext {
  return {
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    target: { type: 'canvas' },
    selection: [],
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...over,
  };
}

describe('menu builders', () => {
  it('creates frozen items of each kind with defaults', () => {
    const items = [
      menu.action('p:a', 'A'),
      menu.submenu('p:sub', 'Sub', [menu.action('p:child', 'Child')]),
      menu.toggle('p:t', 'T', { checked: true }),
      menu.separator('p:sep'),
      menu.custom('p:c', () => document.createElement('div')),
    ];
    for (const item of items) {
      expect(Object.isFrozen(item)).toBe(true);
    }
    expect(items[0]).toMatchObject({ type: 'action', id: 'p:a', label: 'A' });
    expect(Object.isFrozen((items[1] as ContextMenuAction).submenu)).toBe(true);
    expect(items[2]).toMatchObject({ type: 'toggle', checked: true });
    expect(items[3]).toMatchObject({ type: 'separator', id: 'p:sep' });
    expect(items[4]).toMatchObject({ type: 'custom' });
  });

  it('separator accepts options and generates a unique id when omitted', () => {
    const a = menu.separator();
    const b = menu.separator();
    expect(a.id).not.toBe(b.id);
    expect(menu.separator('p:s', { order: 250 })).toMatchObject({ type: 'separator', id: 'p:s', order: 250 });
  });

  it('builder options spread without mutating defaults', () => {
    const item = menu.action('p:a', 'A', { order: 250, danger: true });
    expect(item.order).toBe(250);
    expect(item.danger).toBe(true);
    expect(Object.isFrozen(item)).toBe(true);
  });
});

describe('menuWhen', () => {
  const canvasCtx = menuCtx();
  const tokenCtx = menuCtx({
    target: { type: 'object', object: fakeObject('t1') },
    selection: [fakeObject('t1')],
  });

  it('canvas matches only empty-selection canvas targets', () => {
    expect(menuWhen.canvas()(canvasCtx)).toBe(true);
    expect(menuWhen.canvas()(tokenCtx)).toBe(false);
  });

  it('target matches by object type', () => {
    expect(menuWhen.target('token')(tokenCtx)).toBe(true);
    expect(menuWhen.target('wall')(tokenCtx)).toBe(false);
    expect(menuWhen.target()(tokenCtx)).toBe(true);
    expect(menuWhen.target()(canvasCtx)).toBe(false);
  });

  it('selection matches when any selected object has the type', () => {
    expect(menuWhen.selection('token')(tokenCtx)).toBe(true);
    expect(menuWhen.selection('wall')(tokenCtx)).toBe(false);
    expect(menuWhen.selection()(canvasCtx)).toBe(false);
  });

  it('combinators all/any/not compose predicates', () => {
    const isToken = menuWhen.target('token');
    const withSelection = menuWhen.selection();
    expect(menuWhen.all(isToken, withSelection)(tokenCtx)).toBe(true);
    expect(menuWhen.all(isToken, menuWhen.not(withSelection))(tokenCtx)).toBe(false);
    expect(menuWhen.any(menuWhen.canvas(), isToken)(tokenCtx)).toBe(true);
    expect(menuWhen.not(isToken)(canvasCtx)).toBe(true);
  });
});

describe('normalizeItems purity', () => {
  it('does not mutate the input array or its items, accepting frozen values', () => {
    const items: ContextMenuItem[] = Object.freeze([
      Object.freeze(action('b', 20)),
      Object.freeze(action('a', 10)),
      Object.freeze({ ...separator('s'), order: 15 }),
      Object.freeze(action('c', 5)),
    ]);
    const snapshot = JSON.stringify(items.map((item) => [item.id, item.order]));
    const result = normalizeItems(items, menuCtx());
    expect(result.map((item) => item.id)).toEqual(['c', 'a', 's', 'b']);
    expect(JSON.stringify(items.map((item) => [item.id, item.order]))).toBe(snapshot);
    expect(items).not.toBe(result);
  });
});

describe('normalizeItems', () => {
  it('filters items hidden by when, including throwing predicates', () => {
    const items: ContextMenuItem[] = [
      action('visible'),
      { ...action('hidden'), when: () => false },
      { ...action('broken'), when: () => { throw new Error('boom'); } },
    ];
    expect(normalizeItems(items, menuCtx()).map((item) => item.id)).toEqual(['visible']);
  });

  it('stable-sorts by order keeping registration sequence on ties', () => {
    const items: ContextMenuItem[] = [action('first', 10), action('low', 5), action('second', 10), action('default')];
    expect(normalizeItems(items, menuCtx()).map((item) => item.id)).toEqual(['default', 'low', 'first', 'second']);
  });

  it('drops leading/trailing separators and collapses consecutive ones', () => {
    const items: ContextMenuItem[] = [
      separator('s1'),
      action('a'),
      separator('s2'),
      separator('s3'),
      action('b'),
      separator('s4'),
    ];
    expect(normalizeItems(items, menuCtx()).map((item) => item.id)).toEqual(['a', 's2', 'b']);
  });

  it('drops actions whose submenu normalizes to empty and freezes kept spreads', () => {
    const empty: ContextMenuItem = { ...action('empty'), submenu: [{ ...action('gone'), when: () => false }] };
    const full: ContextMenuItem = { ...action('full'), submenu: [action('child')] };
    const result = normalizeItems([empty, full], menuCtx());
    expect(result.map((item) => item.id)).toEqual(['full']);
    const kept = result[0] as ContextMenuAction;
    expect(kept.submenu).toHaveLength(1);
    expect(Object.isFrozen(kept)).toBe(true);
    expect(Object.isFrozen(kept.submenu)).toBe(true);
  });
});

describe('ContextMenuManager', () => {
  it('collects static, factory and when-filtered contributions', () => {
    const { manager } = fakeCanvas();
    manager.register({ id: 'static', items: [action('s1')] });
    manager.register({
      id: 'factory',
      items: (ctx) => [action(ctx.target.type === 'canvas' ? 'from-canvas' : 'from-object')],
    });
    manager.register({ id: 'filtered', items: [action('never')], when: () => false });

    expect(manager.collect(menuCtx()).map((item) => item.id)).toEqual(['s1', 'from-canvas']);
    expect(
      manager.collect(menuCtx({ target: { type: 'object', object: fakeObject('t1') } })).map((item) => item.id),
    ).toEqual(['s1', 'from-object']);
  });

  it('re-registering the same id replaces and unregister removes', () => {
    const { manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('v1')] });
    manager.register({ id: 'c', items: [action('v2')] });
    expect(manager.collect(menuCtx()).map((item) => item.id)).toEqual(['v2']);
    manager.unregister('c');
    expect(manager.collect(menuCtx())).toEqual([]);
  });

  it('includes items pushed by the contextmenu:items waterfall hook', () => {
    const { bus, manager } = fakeCanvas();
    bus.tap('contextmenu:items', 'test', (payload) => {
      payload.items.push(action('hooked'));
      return payload;
    });
    expect(manager.collect(menuCtx()).map((item) => item.id)).toEqual(['hooked']);
  });

  it('appends core duplicate/delete only with a non-empty selection', () => {
    const { manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('mine')] });
    expect(manager.collect(menuCtx()).map((item) => item.id)).toEqual(['mine']);
    expect(manager.collect(menuCtx({ selection: [fakeObject('t1')] })).map((item) => item.id)).toEqual([
      'mine',
      'core:duplicate',
      'core:delete',
    ]);
  });

  it('a contextmenu:before veto suppresses the open event', () => {
    const { bus, manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('only')] });
    const opens: any[] = [];
    bus.on('contextmenu:open', (payload) => opens.push(payload));
    bus.tap('contextmenu:before', 'vetoer', (payload) => ({ ...payload, handled: true }));
    manager.openFromPointer(pointer({ type: 'canvas' }));
    expect(opens).toHaveLength(0);
  });

  it('emits contextmenu:open and contextmenu:close with the right payloads', () => {
    const { bus, manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('only')] });
    const opens: any[] = [];
    const closes: any[] = [];
    bus.on('contextmenu:open', (payload) => opens.push(payload));
    bus.on('contextmenu:close', (payload) => closes.push(payload));

    manager.openFromPointer(pointer({ type: 'canvas' }));
    expect(opens).toHaveLength(1);
    expect(opens[0]).toEqual({
      x: 100,
      y: 200,
      screenX: 10,
      screenY: 20,
      target: { type: 'canvas' },
      selectionCount: 0,
      itemCount: 1,
    });

    manager.close('outside');
    expect(closes).toEqual([{ reason: 'outside' }]);

    manager.close('outside');
    expect(closes).toHaveLength(1);

    manager.openFromPointer(pointer({ type: 'canvas' }));
    expect(opens).toHaveLength(2);
    manager.close('replace');
    expect(closes).toEqual([{ reason: 'outside' }, { reason: 'replace' }]);
  });

  it('emits no open event when the menu would be empty', () => {
    const { bus, manager } = fakeCanvas();
    const opens: any[] = [];
    bus.on('contextmenu:open', (payload) => opens.push(payload));
    manager.openFromPointer(pointer({ type: 'canvas' }));
    expect(opens).toHaveLength(0);
  });

  it('selects an unselected right-clicked target and keeps an existing selection', () => {
    const { canvas, bus, manager, selectCalls } = fakeCanvas();
    manager.register({ id: 'c', items: [action('only')] });
    const token = fakeObject('t1');
    (canvas as unknown as { selected: any[] }).selected = [token];
    (canvas as unknown as { selection: Set<string> }).selection = new Set(['t1']);

    manager.openFromPointer(pointer({ type: 'object', object: token }));
    expect(selectCalls).toHaveLength(0);

    const other = fakeObject('t2');
    manager.openFromPointer(pointer({ type: 'object', object: other }));
    expect(selectCalls).toEqual([{ id: 't2', additive: false }]);

    const additivePointer = { ...pointer({ type: 'object', object: fakeObject('t3') }), ctrlKey: true };
    manager.openFromPointer(additivePointer);
    expect(selectCalls[1]).toEqual({ id: 't3', additive: true });
  });

  it('skips opening while a pointer drag is in progress', () => {
    const { canvas, bus, manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('only')] });
    (canvas as unknown as { inputs: { isDragging: boolean } }).inputs = { isDragging: true };
    const opens: any[] = [];
    bus.on('contextmenu:open', (payload) => opens.push(payload));
    manager.openFromPointer(pointer({ type: 'canvas' }));
    expect(opens).toHaveLength(0);
  });

  it('a throwing contextmenu:items tap falls back to the collected items', () => {
    const { bus, manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('mine')] });
    bus.tap('contextmenu:items', 'broken', () => {
      throw new Error('boom');
    });
    expect(manager.collect(menuCtx()).map((item) => item.id)).toEqual(['mine']);
  });

  it('a throwing contextmenu:before tap does not block the menu', () => {
    const { bus, manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('only')] });
    bus.tap('contextmenu:before', 'broken', () => {
      throw new Error('boom');
    });
    const opens: any[] = [];
    bus.on('contextmenu:open', (payload) => opens.push(payload));
    manager.openFromPointer(pointer({ type: 'canvas' }));
    expect(opens).toHaveLength(1);
  });

  it('destroy closes an open menu and clears contributions', () => {
    const { bus, manager } = fakeCanvas();
    manager.register({ id: 'c', items: [action('only')] });
    const closes: any[] = [];
    bus.on('contextmenu:close', (payload) => closes.push(payload));
    manager.openFromPointer(pointer({ type: 'canvas' }));
    manager.destroy();
    expect(closes).toEqual([{ reason: 'destroy' }]);
    expect(manager.collect(menuCtx())).toEqual([]);
  });

  it('plugin contributions are collected and disposed with the plugin', async () => {
    const { canvas, bus, manager } = fakeCanvas();
    const plugins = new PluginManager(canvas);
    const registered: string[] = [];
    bus.on('plugin:registered', (payload) => registered.push(payload.id));

    const plugin = definePlugin({
      id: 'p1',
      install: (ctx) => {
        ctx.registerContextMenu({ id: 'p1:menu', items: [action('p1:act')] });
      },
    });

    await plugins.use(plugin);
    expect(registered).toEqual(['p1']);
    expect(manager.collect(menuCtx()).map((item) => item.id)).toEqual(['p1:act']);

    await plugins.unuse('p1');
    expect(manager.collect(menuCtx())).toEqual([]);
  });
});
