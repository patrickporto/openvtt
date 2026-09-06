import { Texture, TextureSource } from 'pixi.js';
import { clampIndex, levelSizeAt, maxLevelFor, tilesAcross } from './lod';
import { TileCache } from './TileCache';
import { tileKey, type TiledSource, type TileKey } from './TiledSource';

export interface ImageTiledSourceOptions {
  src: string;
  tileSize?: number;
  maxCacheTiles?: number;
  onProgress?: (loaded: number, total: number) => void;
}

/**
 * Pirâmide de mipmaps construída no cliente a partir de uma única imagem.
 * O bitmap decodificado é fatiado sob demanda (`createImageBitmap` com crop):
 * cada tile vira um `TextureSource` próprio, então a memória de GPU fica
 * limitada aos tiles visíveis e o LRU pode liberar o resto.
 */
export class ImageTiledSource implements TiledSource {
  readonly tileSize: number;
  maxLevel = 0;
  baseWidth = 0;
  baseHeight = 0;
  readonly cache: TileCache;
  error: Error | null = null;
  readonly ready: Promise<void>;

  private readonly options: ImageTiledSourceOptions;
  private levels: ImageBitmap[] = [];
  private destroyed = false;

  constructor(options: ImageTiledSourceOptions) {
    this.options = options;
    this.tileSize = options.tileSize ?? 512;
    this.cache = new TileCache(options.maxCacheTiles ?? 256);
    this.ready = this.load().catch((error: unknown) => {
      this.error = error instanceof Error ? error : new Error(String(error));
    });
  }

  async tile({ level, col, row }: TileKey): Promise<Texture | null> {
    if (this.destroyed) return null;
    await this.ready;
    const bitmap = this.levels[level];
    if (!bitmap || this.destroyed) return null;
    const size = levelSizeAt(level, this.baseWidth, this.baseHeight);
    const tilesX = tilesAcross(size.width, this.tileSize);
    const tilesY = tilesAcross(size.height, this.tileSize);
    if (clampIndex(col, tilesX - 1) !== col || clampIndex(row, tilesY - 1) !== row) return null;
    const sx = col * this.tileSize;
    const sy = row * this.tileSize;
    const sw = Math.min(this.tileSize, size.width - sx);
    const sh = Math.min(this.tileSize, size.height - sy);
    if (sw <= 0 || sh <= 0) return null;
    try {
      const tileBitmap = await createImageBitmap(bitmap, sx, sy, sw, sh);
      if (this.destroyed) {
        tileBitmap.close();
        return null;
      }
      const texture = new Texture({ source: new TextureSource({ resource: tileBitmap }) });
      this.cache.set(tileKey({ level, col, row }), {
        texture,
        dispose: () => tileBitmap.close(),
      });
      return texture;
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cache.clear();
    for (const level of this.levels) level.close();
    this.levels = [];
  }

  private async load(): Promise<void> {
    if (typeof createImageBitmap !== 'function') {
      throw new Error('[maps] createImageBitmap is not available in this environment');
    }
    const blob = await this.fetchBlob();
    const master = await createImageBitmap(blob);
    if (this.destroyed) {
      master.close();
      return;
    }
    this.levels = [master];
    this.baseWidth = master.width;
    this.baseHeight = master.height;
    this.maxLevel = maxLevelFor(master.width, master.height, this.tileSize);
    for (let level = 1; level <= this.maxLevel; level++) {
      const size = levelSizeAt(level, this.baseWidth, this.baseHeight);
      try {
        const downsampled = await createImageBitmap(this.levels[level - 1], {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'medium',
        });
        if (this.destroyed) {
          downsampled.close();
          return;
        }
        this.levels.push(downsampled);
      } catch {
        this.maxLevel = level - 1;
        return;
      }
    }
  }

  private async fetchBlob(): Promise<Blob> {
    const response = await fetch(this.options.src);
    if (!response.ok) throw new Error(`[maps] failed to fetch map image (${response.status})`);
    const total = Number(response.headers.get('content-length') ?? 0);
    if (!response.body || !total) {
      const blob = await response.blob();
      this.options.onProgress?.(blob.size, blob.size);
      return blob;
    }
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value.slice().buffer as ArrayBuffer);
      loaded += value.byteLength;
      this.options.onProgress?.(loaded, total);
    }
    return new Blob(chunks);
  }
}
