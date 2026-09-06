import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import { dynamicBus } from '@openvtt/canvas';
import { Texture } from 'pixi.js';
import { MapsPlugin } from '../src/plugin';
import { MapSourceRegistry } from '../src/MapSourceRegistry';
import type { MapSourceHooks } from '../src/MapSourceRegistry';
import { TileCache } from '../src/tiled/TileCache';
import type { TiledSource, TileKey } from '../src/tiled/TiledSource';

class FakeMapSource implements TiledSource {
  readonly tileSize = 512;
  readonly maxLevel = 0;
  readonly baseWidth = 3;
  readonly baseHeight = 2;
  readonly error: Error | null = null;
  readonly ready = Promise.resolve();
  readonly cache = new TileCache(8);

  constructor(hooks?: MapSourceHooks) {
    hooks?.onProgress?.(1, 2);
    hooks?.onProgress?.(2, 2);
  }

  async tile(_key: TileKey): Promise<Texture | null> {
    return null;
  }

  destroy(): void {
    this.cache.clear();
  }
}

class BrokenMapSource implements TiledSource {
  readonly tileSize = 512;
  readonly maxLevel = 0;
  readonly baseWidth = 0;
  readonly baseHeight = 0;
  readonly error = new Error('boom');
  readonly ready = Promise.resolve();
  readonly cache = new TileCache(8);

  async tile(_key: TileKey): Promise<Texture | null> {
    return null;
  }

  destroy(): void {
    this.cache.clear();
  }
}

let CanvasCtor: typeof Canvas;
let canvas: Canvas;
let plugin: MapsPlugin;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
  const registry = new MapSourceRegistry((source, hooks) => {
    if (source.type === 'image' && source.src.startsWith('data:text')) return new BrokenMapSource();
    return new FakeMapSource(hooks);
  });
  canvas = new CanvasCtor({} as HTMLElement);
  plugin = new MapsPlugin(registry);
  await canvas.use(plugin);
});

afterAll(() => {
  canvas?.destroy();
});

describe('MapsPlugin install', () => {
  it('registers the map document type and events', () => {
    expect(canvas.documents.has('map')).toBe(true);
    expect(canvas.bus.hasEvent('map:progress')).toBe(true);
    expect(canvas.bus.hasEvent('map:loaded')).toBe(true);
    expect(canvas.bus.hasEvent('map:error')).toBe(true);
  });
});

describe('map loading', () => {
  it('adopts the natural size and emits progress + loaded', async () => {
    const loaded: Record<string, unknown>[] = [];
    const progress: Record<string, unknown>[] = [];
    const port = dynamicBus(canvas.bus);
    const unsubs = [
      port.on('map:loaded', (p) => loaded.push(p as Record<string, unknown>)),
      port.on('map:progress', (p) => progress.push(p as Record<string, unknown>)),
    ];
    const map = await canvas.documents.create('map', { x: 0, y: 0, source: 'maps/castle.webp' });
    unsubs.forEach((unsub) => unsub());
    expect(map.document.source).toEqual({ type: 'image', src: 'maps/castle.webp' });
    expect(map.document.width).toBe(3);
    expect(map.document.height).toBe(2);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ id: map.id, src: 'maps/castle.webp', width: 3, height: 2, levels: 1 });
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0]).toMatchObject({ src: 'maps/castle.webp', loaded: 1, total: 2 });
    canvas.documents.delete('map', map.id);
  });

  it('emits map:error for broken sources instead of throwing', async () => {
    const errors: Record<string, unknown>[] = [];
    const unsub = dynamicBus(canvas.bus).on('map:error', (p) => errors.push(p as Record<string, unknown>));
    const map = await canvas.documents.create('map', {
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      source: 'data:text/plain,not-an-image',
    });
    unsub();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ id: map.id, src: 'data:text/plain,not-an-image', message: 'boom' });
    canvas.documents.delete('map', map.id);
  });
});

describe('flyweight source sharing', () => {
  it('reuses one source for equal descriptors and releases it with the last consumer', async () => {
    const before = plugin.registry!.size;
    const a = await canvas.documents.create('map', { x: 0, y: 0, source: 'maps/shared.webp' });
    const b = await canvas.documents.create('map', { x: 50, y: 0, source: 'maps/shared.webp' });
    expect(plugin.registry!.size).toBe(before + 1);
    canvas.documents.delete('map', a.id);
    expect(plugin.registry!.size).toBe(before + 1);
    canvas.documents.delete('map', b.id);
    expect(plugin.registry!.size).toBe(before);
  });
});

describe('scene loading', () => {
  it('hydrates maps from the legacy scene key', async () => {
    await canvas.documents.tearDownAll();
    await canvas.documents.createFromScene({
      width: 800,
      height: 600,
      maps: [{ x: 0, y: 0, source: 'maps/scene.webp' }],
    } as never);
    const layer = canvas.documents.layer('map')!;
    expect(layer.placeables.length).toBe(1);
    expect(layer.placeables[0].document.source).toEqual({ type: 'image', src: 'maps/scene.webp' });
  });
});
