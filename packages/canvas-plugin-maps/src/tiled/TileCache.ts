import type { Texture } from 'pixi.js';

export interface TileCacheEntry {
  texture: Texture;
  dispose?: () => void;
}

/** Cache LRU de tiles: textos de GPU e bitmaps de origem são liberados na evicção. */
export class TileCache {
  private readonly entries = new Map<string, TileCacheEntry>();

  constructor(private readonly capacity = 256) {}

  get(key: string): TileCacheEntry | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  set(key: string, entry: TileCacheEntry): void {
    const existing = this.entries.get(key);
    if (existing) this.disposeEntry(existing);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      const evicted = this.entries.get(oldest);
      this.entries.delete(oldest);
      if (evicted) this.disposeEntry(evicted);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) this.disposeEntry(entry);
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private disposeEntry(entry: TileCacheEntry): void {
    entry.dispose?.();
    entry.texture.destroy(true);
  }
}
