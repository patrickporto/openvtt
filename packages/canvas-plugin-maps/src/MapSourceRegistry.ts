import type { TiledSource } from './tiled/TiledSource';
import { ImageTiledSource } from './tiled/ImageTiledSource';
import { UrlTiledSource } from './tiled/UrlTiledSource';
import type { MapSource } from './schemas';

export interface MapSourceHooks {
  onProgress?: (loaded: number, total: number) => void;
}

export type MapSourceFactory = (source: MapSource, hooks?: MapSourceHooks) => TiledSource;

interface RegistryEntry {
  source: TiledSource;
  refs: number;
}

/**
 * Flyweight de fontes de mapa: placeables que compartilham a mesma fonte
 * (`src`/`url`) reutilizam um único pipeline decodificado e um único cache
 * de tiles. O refcount libera tudo quando o último consumidor sai.
 */
export class MapSourceRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  constructor(private readonly factory: MapSourceFactory = createSource) {}

  acquire(source: MapSource, hooks?: MapSourceHooks): TiledSource {
    const key = sourceKey(source);
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs++;
      return existing.source;
    }
    const created = this.factory(source, hooks);
    this.entries.set(key, { source: created, refs: 1 });
    return created;
  }

  release(source: TiledSource): void {
    for (const [key, entry] of this.entries) {
      if (entry.source !== source) continue;
      entry.refs--;
      if (entry.refs <= 0) {
        this.entries.delete(key);
        entry.source.destroy();
      }
      return;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.source.destroy();
    this.entries.clear();
  }
}

function sourceKey(source: MapSource): string {
  if (source.type === 'tiled') {
    return `tiled:${source.url}|${source.tileSize}|${source.minLevel}|${source.maxLevel}|${source.width}|${source.height}`;
  }
  return `image:${source.src}`;
}

function createSource(source: MapSource, hooks?: MapSourceHooks): TiledSource {
  if (source.type === 'tiled') {
    return new UrlTiledSource({
      url: source.url,
      width: source.width,
      height: source.height,
      maxLevel: source.maxLevel,
      minLevel: source.minLevel,
      tileSize: source.tileSize,
      onProgress: hooks?.onProgress,
    });
  }
  return new ImageTiledSource({ src: source.src, onProgress: hooks?.onProgress });
}
