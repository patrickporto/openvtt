import { describe, expect, it } from 'bun:test';
import { Texture, TextureSource } from 'pixi.js';
import { TiledSprite } from '../src/tiled/TiledSprite';
import { TileCache } from '../src/tiled/TileCache';
import { tileKey, type TiledSource, type TileKey } from '../src/tiled/TiledSource';

class FakeSource implements TiledSource {
  tileSize = 100;
  maxLevel = 2;
  baseWidth = 800;
  baseHeight = 600;
  error: Error | null = null;
  ready = Promise.resolve();
  cache = new TileCache(128);
  requested: string[] = [];
  private readonly shared = new TextureSource({ width: 8, height: 8 });
  private readonly fail = new Set<string>();
  private gate: { promise: Promise<void>; release: () => void } | null = null;

  failTile(key: string): void {
    this.fail.add(key);
  }

  holdTiles(): void {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gate = { promise, release };
  }

  releaseTiles(): void {
    this.gate?.release();
    this.gate = null;
  }

  async tile(key: TileKey): Promise<Texture | null> {
    this.requested.push(tileKey(key));
    if (this.fail.has(tileKey(key))) return null;
    if (this.gate) await this.gate.promise;
    const texture = new Texture({ source: this.shared });
    this.cache.set(tileKey(key), { texture });
    return texture;
  }

  destroy(): void {
    this.cache.clear();
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('TiledSprite culling', () => {
  it('requests only the tiles intersecting the viewport at level 0', async () => {
    const source = new FakeSource();
    const sprite = new TiledSprite(source, 800, 600);
    sprite.updateView({ x: 150, y: 50, width: 250, height: 200 }, 1);
    await settle();
    expect(sprite.renderLevel).toBe(0);
    expect(source.requested).toHaveLength(12);
    expect(sprite.renderedTiles).toHaveLength(12);
    sprite.destroy();
  });

  it('switches to a coarse level when zoomed out', async () => {
    const source = new FakeSource();
    const sprite = new TiledSprite(source, 800, 600);
    sprite.updateView({ x: 0, y: 0, width: 800, height: 600 }, 0.25);
    await settle();
    expect(sprite.renderLevel).toBe(2);
    expect(source.requested.every((key) => key.startsWith('2:'))).toBe(true);
    expect(source.requested).toHaveLength(4);
    sprite.destroy();
  });

  it('shows a cached coarse ancestor while fine tiles stream in', async () => {
    const source = new FakeSource();
    const sprite = new TiledSprite(source, 800, 600);
    const coarse = new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
    source.cache.set('2:0:0', { texture: coarse });
    source.holdTiles();
    sprite.updateView({ x: 0, y: 0, width: 200, height: 150 }, 1);
    expect(sprite.renderedTiles).toContain('2:0:0');
    source.releaseTiles();
    await settle();
    expect(sprite.renderLevel).toBe(0);
    expect(sprite.renderedTiles.some((key) => key.startsWith('0:'))).toBe(true);
    expect(sprite.renderedTiles).not.toContain('2:0:0');
    sprite.destroy();
  });

  it('prunes every tile when the viewport leaves the map', async () => {
    const source = new FakeSource();
    const sprite = new TiledSprite(source, 800, 600);
    sprite.updateView({ x: 0, y: 0, width: 400, height: 300 }, 1);
    await settle();
    expect(sprite.renderedTiles.length).toBeGreaterThan(0);
    sprite.updateView({ x: 5000, y: 5000, width: 100, height: 100 }, 1);
    expect(sprite.renderedTiles).toHaveLength(0);
    expect(sprite.renderLevel).toBe(-1);
    sprite.destroy();
  });

  it('skips work when the view is unchanged', async () => {
    const source = new FakeSource();
    const sprite = new TiledSprite(source, 800, 600);
    sprite.updateView({ x: 0, y: 0, width: 400, height: 300 }, 1);
    await settle();
    const requested = source.requested.length;
    sprite.updateView({ x: 0, y: 0, width: 400, height: 300 }, 1);
    sprite.updateView({ x: 0.1, y: 0.1, width: 400, height: 300 }, 1);
    expect(source.requested.length).toBe(requested);
    sprite.destroy();
  });

  it('keeps failed tiles from breaking the render', async () => {
    const source = new FakeSource();
    source.failTile('0:0:0');
    source.failTile('0:1:0');
    source.failTile('0:0:1');
    source.failTile('0:1:1');
    const sprite = new TiledSprite(source, 800, 600);
    sprite.updateView({ x: 0, y: 0, width: 100, height: 100 }, 1);
    await settle();
    expect(sprite.renderedTiles).toHaveLength(0);
    expect(sprite.renderLevel).toBe(0);
    sprite.destroy();
  });
});
