import type { Texture } from 'pixi.js';
import type { TileCache } from './TileCache';

export interface TileKey {
  level: number;
  col: number;
  row: number;
}

export interface TiledSource {
  readonly tileSize: number;
  readonly maxLevel: number;
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly cache: TileCache;
  readonly error: Error | null;
  readonly ready: Promise<void>;
  tile(key: TileKey): Promise<Texture | null>;
  destroy(): void;
}

export function tileKey({ level, col, row }: TileKey): string {
  return `${level}:${col}:${row}`;
}
