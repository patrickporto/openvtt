import { Graphics } from 'pixi.js';
import { CanvasLayer, type CanvasLayerOptions } from './CanvasLayer';
import { GridRenderer } from '../grid';
import { CONFIG, type GridConfig, type GridType } from '../config';
import { toHex } from '../utils';

export interface GridLayerOptions extends CanvasLayerOptions {
  grid: GridConfig;
}

export class GridLayer extends CanvasLayer {
  private readonly graphics = new Graphics();
  private readonly grid: GridConfig;
  private worldWidth = 0;
  private worldHeight = 0;

  constructor(options: GridLayerOptions) {
    super({ ...options, name: options.name ?? 'grid', zIndex: options.zIndex ?? 1000 });
    this.grid = options.grid;
    this.graphics.eventMode = 'none';
    this.addChild(this.graphics);
  }

  setGrid(grid: GridConfig): void {
    Object.assign(this.grid, grid);
    this.redraw();
  }

  setSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
    this.redraw();
  }

  setType(type: GridType): void {
    this.grid.type = type;
    this.redraw();
  }

  override async draw(): Promise<void> {
    this.redraw();
  }

  override async tearDown(): Promise<void> {
    this.graphics.clear();
  }

  redraw(): void {
    GridRenderer.draw(
      this.graphics,
      this.worldWidth,
      this.worldHeight,
      this.grid.type,
      this.grid.size,
      {
        color: toHex(this.grid.color ?? CONFIG.grid.color),
        alpha: this.grid.alpha ?? CONFIG.grid.alpha,
        width: this.grid.lineWidth ?? CONFIG.grid.lineWidth,
      },
      this.grid.offsetX ?? 0,
      this.grid.offsetY ?? 0,
    );
  }

  snapToGrid(x: number, y: number): { x: number; y: number } {
    return GridRenderer.snapToGrid(x, y, this.grid.type, this.grid.size, this.grid.offsetX ?? 0, this.grid.offsetY ?? 0);
  }

  snapToIntersection(x: number, y: number): { x: number; y: number } {
    return GridRenderer.snapToIntersection(x, y, this.grid.type, this.grid.size, this.grid.offsetX ?? 0, this.grid.offsetY ?? 0);
  }

  get config(): GridConfig {
    return this.grid;
  }

  get type(): GridConfig['type'] {
    return this.grid.type;
  }
  get size(): number {
    return this.grid.size;
  }
  get offsetX(): number | undefined {
    return this.grid.offsetX;
  }
  get offsetY(): number | undefined {
    return this.grid.offsetY;
  }
}
