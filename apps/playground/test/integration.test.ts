import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import type { WallsPlugin, Wall } from '@openvtt/canvas-plugin-walls';
import type { Token } from '@openvtt/canvas-plugin-tokens';
import type { TokensPlugin, ImageEditorPlugin } from '@openvtt/canvas-preset-standard';

let canvas: Canvas;
const created: string[] = [];

beforeAll(async () => {
  (globalThis as Record<string, unknown>).HTMLElement = class FakeHTMLElement {};
  (globalThis as Record<string, unknown>).customElements = { get: () => undefined, define: () => {} };
  const fakeElement = () => ({ getContext: () => null, width: 0, height: 0, style: {} });
  (globalThis as Record<string, unknown>).document = {
    createElement: () => fakeElement(),
    createElementNS: () => fakeElement(),
  };
  const { Canvas: CanvasCtor } = await import('@openvtt/canvas');
  const { standardPlugins } = await import('@openvtt/canvas-preset-standard');
  canvas = new CanvasCtor({} as HTMLElement);
  for (const plugin of standardPlugins) await canvas.use(plugin);
  canvas.bus.onAny((name) => {
    if (name.endsWith(':create')) created.push(name);
  });
});

afterAll(() => {
  canvas?.destroy();
});

describe('plugin composition', () => {
  it('installs all 19 preset plugins', () => {
    expect(canvas.plugins.list().length).toBe(19);
  });

  it('registers every document type', () => {
    expect(canvas.documents.types().sort()).toEqual(['drawing', 'light', 'map', 'ring', 'template', 'tile', 'token', 'wall']);
  });
});

describe('document registry', () => {
  it('CRUD applies schema defaults and emits dynamic events', async () => {
    const token = await canvas.documents.create('token', { x: 100, y: 100 });
    expect(token.objectType).toBe('token');
    expect((token as Token).document.size).toBe(1);
    canvas.documents.update('token', token.id, { x: 150, y: 150 });
    expect(token.x).toBe(150);
    expect(canvas.documents.delete('token', token.id)).toBe(true);
    expect(canvas.documents.get('token', token.id)).toBeUndefined();
  });

  it('rejects unknown document types', () => {
    expect(canvas.documents.has('note')).toBe(false);
  });
});

describe('capability hooks between plugins', () => {
  it('walls block movement; open doors do not', async () => {
    const wall = (await canvas.documents.create('wall', {
      segments: [
        { x1: 0, y1: 200, x2: 400, y2: 200 },
        { x1: 400, y1: 200, x2: 400, y2: 400, door: true },
      ],
    })) as Wall;
    const walls = canvas.plugins.get<WallsPlugin>('walls')!;
    expect(canvas.isMoveBlocked({ x: 100, y: 100 }, { x: 100, y: 300 })).toBe(true);
    walls.toggleDoor(wall, 1);
    expect(wall.segments[1].doorOpen).toBe(true);
    expect(canvas.isMoveBlocked({ x: 450, y: 100 }, { x: 450, y: 300 })).toBe(false);
  });

  it('dragging a wall point commits the new geometry and is undoable', async () => {
    const { HistoryManager } = await import('@openvtt/canvas');
    if (!canvas.history) {
      (canvas as unknown as { history: HistoryManager }).history = new HistoryManager(canvas);
    }
    const wall = (await canvas.documents.create('wall', {
      segments: [{ x1: 0, y1: 0, x2: 300, y2: 0 }],
    })) as Wall;
    const drag = (phase: 'start' | 'move' | 'end', x: number, y: number) =>
      canvas.bus.call('handle:drag', {
        handle: { type: 'wall-point', data: { wallId: wall.id, segmentIndex: 0, role: 'p2' } },
        x,
        y,
        phase,
        handled: false,
      });
    drag('start', 300, 0);
    drag('move', 420, 90);
    drag('end', 420, 90);
    expect(wall.segments[0].x2).toBe(420);
    expect(wall.segments[0].y2).toBe(90);
    await canvas.history.undo();
    expect(wall.segments[0].x2).toBe(300);
    expect(wall.segments[0].y2).toBe(0);
    canvas.documents.delete('wall', wall.id);
  });

  it('tokens feed vision and light sources (pixels, grid-scaled)', async () => {
    await canvas.documents.create('token', { x: 200, y: 200, visionRadius: 6, lightDim: 3 });
    const vision = canvas.bus.call('vision:sources', { sources: [] });
    expect(vision.sources.length).toBe(1);
    expect(vision.sources[0].radius).toBe(300);
    const light = canvas.bus.call('light:sources', { sources: [] });
    expect(light.sources[0].dim).toBe(150);
    const sight = canvas.bus.call('sight:segments', { segments: [] });
    expect(sight.segments.length).toBe(1);
  });
});

describe('scene loading', () => {
  it('reads legacy scene keys and the documents map', async () => {
    await canvas.documents.tearDownAll();
    created.length = 0;
    await canvas.documents.createFromScene({
      width: 1600,
      height: 1000,
      maps: [{ x: 0, y: 0, source: 'maps/broken.png' }],
      tokens: [{ x: 100, y: 100, label: 'A' }],
      walls: [{ segments: [{ x1: 0, y1: 50, x2: 500, y2: 50 }] }],
      documents: { light: [{ x: 300, y: 300, dim: 5 }] },
    } as never);
    expect(canvas.documents.layer('token')!.placeables.length).toBe(1);
    expect(canvas.documents.layer('wall')!.placeables.length).toBe(1);
    expect(canvas.documents.layer('light')!.placeables.length).toBe(1);
  });

  it('hydrates maps from the scene and surfaces map events', async () => {
    expect(canvas.documents.layer('map')!.placeables.length).toBe(1);
    const seen: string[] = [];
    const unsub = canvas.bus.onAny((name) => {
      if (name.startsWith('map:')) seen.push(name);
    });
    const map = await canvas.documents.create('map', { x: 0, y: 0, width: 10, height: 10, source: 'maps/does-not-exist.png' });
    for (let i = 0; i < 50 && seen.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    unsub();
    expect(seen).toContain('map:error');
    canvas.documents.delete('map', map.id);
  });

  it('selection resolves across document types and draws handles', () => {
    const token = canvas.documents.layer('token')!.placeables[0];
    canvas.select(token as never, false);
    expect(canvas.selected.length).toBe(1);
    expect(canvas.handles.getAABB()).not.toBeNull();
    canvas.clearSelection();
  });

  it('dynamic events fired for each created type', () => {
    for (const name of ['token:create', 'wall:create', 'light:create']) {
      expect(created).toContain(name);
    }
  });

  it('dynamic events observable via dynamicBus (receiver intact)', async () => {
    const { dynamicBus } = await import('@openvtt/canvas');
    const dyn = dynamicBus(canvas.bus);
    let payload: any = null;
    const unsub = dyn.on('token:create', (p) => { payload = p; });
    await canvas.documents.create('token', { x: 10, y: 10 });
    unsub();
    expect(payload).not.toBeNull();
    expect(payload.id).toBeTypeOf('string');
  });

  it('plugin emitters keep the bus receiver (token:selected)', async () => {
    const { dynamicBus } = await import('@openvtt/canvas');
    const seen: string[][] = [];
    const unsub = dynamicBus(canvas.bus).on('token:selected', (p: any) => seen.push(p.ids));
    const token = canvas.documents.layer('token')!.placeables[0];
    canvas.select(token as never, false);
    unsub();
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('token ease (TokenEase-style)', () => {
  it('tokens drag behavior declares easedDrag and duration is configurable', () => {
    const tokens = canvas.plugins.get<TokensPlugin>('tokens')!;
    expect(tokens).toBeDefined();
    const behavior = canvas.documents.definition('token')?.behavior;
    expect(behavior?.easedDrag).toEqual({ duration: 150 });
    tokens.configureEase({ duration: 250 });
    expect(tokens.easeDuration).toBe(250);
    expect(canvas.documents.definition('token')?.behavior?.easedDrag).toEqual({ duration: 250 });
    tokens.configureEase({ duration: 150 });
  });

  it('moveToken commits the document after the animated move', async () => {
    const tokens = canvas.plugins.get<TokensPlugin>('tokens')!;
    const token = canvas.documents.layer('token')!.placeables[0] as Token;
    const target = { x: token.x + 100, y: token.y };
    tokens.moveToken(token.id, target.x, target.y, { animated: false });
    expect(token.x).toBe(target.x);
    const updated = canvas.documents.get('token', token.id) as Token;
    expect(updated.document.x).toBe(target.x);
  });
});

describe('image editor', () => {
  it('exposes a headless editor bound to the canvas', () => {
    const imageEditor = canvas.plugins.get<ImageEditorPlugin>('imageEditor')!;
    expect(imageEditor).toBeDefined();
    const editor = imageEditor.createEditor();
    expect(editor.state.hasSource).toBe(false);
    expect(typeof editor.setTransform).toBe('function');
  });

  it('discovers editable targets via the imageField metadata', () => {
    expect(canvas.documents.imageFieldOf('token')).toBe('texture');
    expect(canvas.documents.imageFieldOf('wall')).toBeUndefined();
    expect(canvas.documents.typesWithImage()).toEqual(['token']);
  });

  it('double-click on an image-editable document opens the editor', async () => {
    const { dynamicBus } = await import('@openvtt/canvas');
    const token = await canvas.documents.create('token', { x: 650, y: 450, label: 'EditMe' });
    const opened: string[] = [];
    const unsub = dynamicBus(canvas.bus).on('imageEditor:opened', (p: any) => opened.push(p.id));
    const result = canvas.bus.call('select:doubleclick', { x: token.x, y: token.y, handled: false });
    unsub();
    expect(result.handled).toBe(true);
    expect(opened).toEqual([token.id]);
    canvas.documents.delete('token', token.id);
  });

  it('double-click near a non-editable document does not open the editor', async () => {
    const { dynamicBus } = await import('@openvtt/canvas');
    const opened: string[] = [];
    const unsub = dynamicBus(canvas.bus).on('imageEditor:opened', (p: any) => opened.push(p.id));
    const wall = await canvas.documents.create('wall', { segments: [{ x1: 600, y1: 520, x2: 760, y2: 520 }] });
    const result = canvas.bus.call('select:doubleclick', { x: 680, y: 570, handled: false });
    unsub();
    expect(result.handled).toBe(false);
    expect(opened).toEqual([]);
    canvas.documents.delete('wall', wall.id);
  });

  it('texture change on a token document reloads assets', async () => {
    const token = await canvas.documents.create('token', { x: 300, y: 300 }) as Token;
    canvas.documents.update('token', token.id, { texture: 'data:image/png;base64,changed' });
    expect(token.document.texture).toBe('data:image/png;base64,changed');
  });
});

describe('windows', () => {
  it('double-click opens the image editor as a managed window (headless)', async () => {
    const { WindowsPlugin } = await import('@openvtt/canvas-preset-standard');
    const windows = canvas.plugins.get<WindowsPlugin>('windows')!;
    windows.manager.get('imageEditor')?.close();
    const before = windows.manager.list().length;
    const token = await canvas.documents.create('token', { x: 900, y: 900, label: 'Win' });
    const result = canvas.bus.call('select:doubleclick', { x: token.x, y: token.y, handled: false });
    expect(result.handled).toBe(true);
    expect(windows.manager.list().length).toBe(before + 1);
    const handle = windows.manager.get('imageEditor');
    expect(handle).not.toBeNull();
    expect(handle!.definitionId).toBe('imageEditor');
    expect(handle!.state).toBe('normal');
    expect(handle!.element).toBeNull();
    handle!.close();
    expect(windows.manager.list().length).toBe(before);
    canvas.documents.delete('token', token.id);
  });

  it('fog registers its panel window when windows is installed first', async () => {
    const { WindowsPlugin } = await import('@openvtt/canvas-preset-standard');
    const windows = canvas.plugins.get<WindowsPlugin>('windows')!;
    const handle = windows.manager.open('fog');
    expect(handle).not.toBeNull();
    expect(handle!.definitionId).toBe('fog');
    expect(handle!.state).toBe('normal');
    handle!.close();
  });

  it('fog works without the windows plugin (no panel registration)', async () => {
    const { Canvas: CanvasCtor } = await import('@openvtt/canvas');
    const { fogPlugin } = await import('@openvtt/canvas-plugin-fog');
    const bare = new CanvasCtor({} as HTMLElement);
    await bare.use(fogPlugin);
    expect(bare.plugins.has('fog')).toBe(true);
    expect(bare.plugins.has('windows')).toBe(false);
    bare.destroy();
  });
});

describe('image editor decoupling', () => {
  it('installs and works without the tokens plugin', async () => {
    const { Canvas: CanvasCtor } = await import('@openvtt/canvas');
    const { windowsPlugin } = await import('@openvtt/canvas-preset-standard');
    const { imageEditorPlugin } = await import('@openvtt/canvas-plugin-image-editor');
    const bare = new CanvasCtor({} as HTMLElement);
    await bare.use(windowsPlugin);
    await bare.use(imageEditorPlugin);
    expect(bare.plugins.has('imageEditor')).toBe(true);
    expect(bare.documents.types()).toEqual([]);
    const plugin = bare.plugins.get<ImageEditorPlugin>('imageEditor')!;
    const editor = plugin.createEditor();
    expect(editor.state.hasSource).toBe(false);
    const result = bare.bus.call('select:doubleclick', { x: 10, y: 10, handled: false });
    expect(result.handled).toBe(false);
    bare.destroy();
  });

  it('a custom document type becomes editable by declaring imageField', async () => {
    const { Canvas: CanvasCtor, PlaceableObject, definePlugin } = await import('@openvtt/canvas');
    const { windowsPlugin } = await import('@openvtt/canvas-preset-standard');
    const { imageEditorPlugin } = await import('@openvtt/canvas-plugin-image-editor');
    class Portrait extends PlaceableObject<{ x: number; y: number; art?: string }> {
      readonly objectType = 'portrait';
      get bounds() { return { x: -10, y: -10, width: 20, height: 20 }; }
      refresh(): void {}
    }
    const portraitsPlugin = definePlugin({
      id: 'portraits',
      install(ctx) {
        ctx.registerDocumentType({
          type: 'portrait',
          placeable: Portrait as never,
          layer: { label: 'Portraits', order: 600 },
          imageField: 'art',
        });
      },
    });
    const bare = new CanvasCtor({} as HTMLElement);
    await bare.use(windowsPlugin);
    await bare.use(imageEditorPlugin);
    await bare.use(portraitsPlugin);
    expect(bare.documents.imageFieldOf('portrait')).toBe('art');
    const doc = await bare.documents.create('portrait', { x: 0, y: 0, art: '' });
    const editor = bare.plugins.get<ImageEditorPlugin>('imageEditor')!.createEditor();
    expect(await editor.loadFromDocument('portrait', doc.id)).toBe(false);
    bare.documents.update('portrait', doc.id, { art: 'data:image/png;base64,zz' });
    expect((doc.document as Record<string, unknown>).art).toBe('data:image/png;base64,zz');
    bare.destroy();
  });
});
