import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import type { WallsPlugin, Wall } from '@openvtt/canvas-plugin-walls';
import type { Token } from '@openvtt/canvas-plugin-tokens';

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
  it('installs all 9 preset plugins', () => {
    expect(canvas.plugins.list().length).toBe(9);
  });

  it('registers every document type', () => {
    expect(canvas.documents.types().sort()).toEqual(['drawing', 'light', 'template', 'tile', 'token', 'wall']);
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
      tokens: [{ x: 100, y: 100, label: 'A' }],
      walls: [{ segments: [{ x1: 0, y1: 50, x2: 500, y2: 50 }] }],
      documents: { light: [{ x: 300, y: 300, dim: 5 }] },
    } as never);
    expect(canvas.documents.layer('token')!.placeables.length).toBe(1);
    expect(canvas.documents.layer('wall')!.placeables.length).toBe(1);
    expect(canvas.documents.layer('light')!.placeables.length).toBe(1);
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
