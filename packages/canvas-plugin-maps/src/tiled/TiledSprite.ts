import { Container, Sprite } from 'pixi.js';
import { chooseLevel, clampIndex, levelSizeAt, tilesAcross } from './lod';
import { tileKey, type TiledSource } from './TiledSource';

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VIEW_EPSILON = 0.5;

/**
 * Renderiza uma `TiledSource` com culling por viewport: escolhe o LOD pela
 * escala, solicita apenas os tiles visíveis (índice espacial implícito da
 * grade regular), exibe tiles grosseiros como fallback progressivo e remove
 * da cena os tiles fora de vista.
 */
export class TiledSprite extends Container {
  worldWidth: number;
  worldHeight: number;

  private readonly source: TiledSource;
  private readonly sprites = new Map<string, Sprite>();
  private readonly pending = new Set<string>();
  private lastView: ViewportRect | null = null;
  private lastScale = 0;
  private dirty = true;
  private destroyedFlag = false;
  private _renderLevel = -1;

  constructor(source: TiledSource, worldWidth?: number, worldHeight?: number) {
    super();
    this.source = source;
    this.worldWidth = worldWidth ?? source.baseWidth;
    this.worldHeight = worldHeight ?? source.baseHeight;
    this.eventMode = 'none';
  }

  get renderLevel(): number {
    return this._renderLevel;
  }

  get renderedTiles(): string[] {
    return [...this.sprites.keys()];
  }

  updateView(view: ViewportRect, scale: number): void {
    if (this.destroyedFlag || this.worldWidth <= 0 || this.worldHeight <= 0) return;
    if (!this.dirty && this.sameView(view, scale)) return;
    this.lastView = { ...view };
    this.lastScale = scale;
    this.dirty = false;

    const overlap = this.overlap(view);
    if (!overlap) {
      this.prune(new Set());
      this._renderLevel = -1;
      return;
    }

    const level = chooseLevel(this.source.baseWidth, this.worldWidth, scale, this.source.maxLevel);
    this._renderLevel = level;
    const size = levelSizeAt(level, this.source.baseWidth, this.source.baseHeight);
    const tilesX = tilesAcross(size.width, this.source.tileSize);
    const tilesY = tilesAcross(size.height, this.source.tileSize);
    const scaleX = size.width / this.worldWidth;
    const scaleY = size.height / this.worldHeight;
    const px = overlap.x * scaleX;
    const py = overlap.y * scaleY;
    const pw = overlap.width * scaleX;
    const ph = overlap.height * scaleY;
    const t = this.source.tileSize;
    const c0 = clampIndex(Math.floor(px / t), tilesX - 1);
    const c1 = clampIndex(Math.floor((px + pw) / t), tilesX - 1);
    const r0 = clampIndex(Math.floor(py / t), tilesY - 1);
    const r1 = clampIndex(Math.floor((py + ph) / t), tilesY - 1);

    const needed = new Set<string>();
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const key = tileKey({ level, col, row });
        needed.add(key);
        this.ensureTile(level, col, row, needed);
      }
    }
    this.prune(needed);
  }

  invalidate(): void {
    this.dirty = true;
    if (this.lastView) this.updateView(this.lastView, this.lastScale);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    if (this.destroyedFlag) return;
    this.destroyedFlag = true;
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.pending.clear();
    super.destroy(options);
  }

  private ensureTile(level: number, col: number, row: number, needed: Set<string>): void {
    const key = tileKey({ level, col, row });
    if (this.sprites.has(key)) {
      this.source.cache.get(key);
      return;
    }
    const cached = this.source.cache.get(key);
    if (cached) {
      this.addSprite(key, cached.texture, level, col, row);
      return;
    }
    this.showFallback(level, col, row, needed);
    if (this.pending.has(key)) return;
    this.pending.add(key);
    this.source
      .tile({ level, col, row })
      .then((texture) => {
        this.pending.delete(key);
        if (this.destroyedFlag || !texture) return;
        if (!this.sprites.has(key)) this.addSprite(key, texture, level, col, row);
        this.invalidate();
      })
      .catch(() => {
        this.pending.delete(key);
      });
  }

  private showFallback(level: number, col: number, row: number, needed: Set<string>): void {
    for (let l = level + 1; l <= this.source.maxLevel; l++) {
      const divisor = 2 ** (l - level);
      const ancestorCol = Math.floor(col / divisor);
      const ancestorRow = Math.floor(row / divisor);
      const ancestorKey = tileKey({ level: l, col: ancestorCol, row: ancestorRow });
      if (this.sprites.has(ancestorKey)) {
        needed.add(ancestorKey);
        return;
      }
      const cached = this.source.cache.get(ancestorKey);
      if (cached) {
        this.addSprite(ancestorKey, cached.texture, l, ancestorCol, ancestorRow);
        needed.add(ancestorKey);
        return;
      }
    }
  }

  private addSprite(key: string, texture: Sprite['texture'], level: number, col: number, row: number): void {
    const size = levelSizeAt(level, this.source.baseWidth, this.source.baseHeight);
    const sx = col * this.source.tileSize;
    const sy = row * this.source.tileSize;
    const sw = Math.min(this.source.tileSize, size.width - sx);
    const sh = Math.min(this.source.tileSize, size.height - sy);
    const kx = this.worldWidth / size.width;
    const ky = this.worldHeight / size.height;
    const sprite = new Sprite(texture);
    sprite.position.set(sx * kx, sy * ky);
    sprite.width = sw * kx;
    sprite.height = sh * ky;
    sprite.eventMode = 'none';
    this.addChild(sprite);
    this.sprites.set(key, sprite);
  }

  private prune(keep: Set<string>): void {
    for (const [key, sprite] of this.sprites) {
      if (keep.has(key)) continue;
      this.removeChild(sprite);
      sprite.destroy();
      this.sprites.delete(key);
    }
  }

  private overlap(view: ViewportRect): ViewportRect | null {
    const x0 = Math.max(0, view.x);
    const y0 = Math.max(0, view.y);
    const x1 = Math.min(this.worldWidth, view.x + view.width);
    const y1 = Math.min(this.worldHeight, view.y + view.height);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  private sameView(view: ViewportRect, scale: number): boolean {
    if (!this.lastView) return false;
    const a = this.lastView;
    return (
      this.lastScale === scale &&
      Math.abs(a.x - view.x) < VIEW_EPSILON &&
      Math.abs(a.y - view.y) < VIEW_EPSILON &&
      Math.abs(a.width - view.width) < VIEW_EPSILON &&
      Math.abs(a.height - view.height) < VIEW_EPSILON
    );
  }
}
