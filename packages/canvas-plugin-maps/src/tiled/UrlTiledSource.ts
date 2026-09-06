import { Texture, TextureSource } from 'pixi.js';
import { clampIndex, levelSizeAt, tilesAcross } from './lod';
import { TileCache } from './TileCache';
import { tileKey, type TiledSource, type TileKey } from './TiledSource';

export interface UrlTiledSourceOptions {
  url: string;
  width: number;
  height: number;
  maxLevel: number;
  tileSize?: number;
  minLevel?: number;
  maxCacheTiles?: number;
  /** Progresso por tile da viewport: (tiles concluídos, tiles solicitados). */
  onProgress?: (loaded: number, total: number) => void;
}

/**
 * Fonte de tiles pré-renderizadas por servidor, no template
 * `{z}/{x}/{y}` (zoom/coluna/linha). Carrega apenas os tiles do LOD
 * escolhido — streaming real para mapas gigantes sem decodificar a
 * imagem inteira. Cada fetch concluído (sucesso ou falha) reporta
 * progresso em tiles da viewport corrente.
 */
export class UrlTiledSource implements TiledSource {
  readonly tileSize: number;
  readonly maxLevel: number;
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly cache: TileCache;
  readonly error: Error | null = null;
  readonly ready = Promise.resolve();

  private readonly options: UrlTiledSourceOptions;
  private tilesRequested = 0;
  private tilesCompleted = 0;

  constructor(options: UrlTiledSourceOptions) {
    this.options = options;
    this.tileSize = options.tileSize ?? 256;
    this.maxLevel = options.maxLevel;
    this.baseWidth = options.width;
    this.baseHeight = options.height;
    this.cache = new TileCache(options.maxCacheTiles ?? 256);
  }

  async tile({ level, col, row }: TileKey): Promise<Texture | null> {
    if (level < 0 || level > this.maxLevel) return null;
    const size = levelSizeAt(level, this.baseWidth, this.baseHeight);
    const tilesX = tilesAcross(size.width, this.tileSize);
    const tilesY = tilesAcross(size.height, this.tileSize);
    if (clampIndex(col, tilesX - 1) !== col || clampIndex(row, tilesY - 1) !== row) return null;
    const key = tileKey({ level, col, row });
    if (this.cache.has(key)) return this.cache.get(key)?.texture ?? null;
    const url = this.options.url
      .replace('{z}', String(level))
      .replace('{x}', String(col))
      .replace('{y}', String(row));
    this.tilesRequested++;
    try {
      const response = await fetch(url);
      if (!response.ok) return this.report(null);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const texture = new Texture({ source: new TextureSource({ resource: bitmap }) });
      this.cache.set(key, {
        texture,
        dispose: () => bitmap.close(),
      });
      return this.report(texture);
    } catch {
      return this.report(null);
    }
  }

  destroy(): void {
    this.cache.clear();
  }

  private report<T>(value: T): T {
    this.tilesCompleted++;
    this.options.onProgress?.(this.tilesCompleted, this.tilesRequested);
    return value;
  }
}
