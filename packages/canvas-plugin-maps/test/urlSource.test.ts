import { describe, expect, it } from 'bun:test';
import { UrlTiledSource } from '../src/tiled/UrlTiledSource';

describe('UrlTiledSource progress', () => {
  it('reports per-tile progress including failures', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('missing', { status: 404 })) as typeof fetch;
    try {
      const seen: Array<[number, number]> = [];
      const source = new UrlTiledSource({
        url: 'https://tiles.test/{z}/{x}/{y}.png',
        width: 512,
        height: 512,
        maxLevel: 0,
        onProgress: (loaded, total) => seen.push([loaded, total]),
      });
      const first = await source.tile({ level: 0, col: 0, row: 0 });
      expect(first).toBeNull();
      expect(seen).toEqual([[1, 1]]);
      await source.tile({ level: 0, col: 0, row: 0 });
      expect(seen).toEqual([
        [1, 1],
        [2, 2],
      ]);
      await source.tile({ level: 9, col: 0, row: 0 });
      expect(seen).toHaveLength(2);
      source.destroy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects out-of-range tile coordinates without counting progress', async () => {
    const seen: Array<[number, number]> = [];
    const source = new UrlTiledSource({
      url: 'https://tiles.test/{z}/{x}/{y}.png',
      width: 256,
      height: 256,
      maxLevel: 1,
      onProgress: (loaded, total) => seen.push([loaded, total]),
    });
    await source.tile({ level: 0, col: 5, row: 5 });
    await source.tile({ level: 0, col: -1, row: 0 });
    expect(seen).toHaveLength(0);
    source.destroy();
  });
});
