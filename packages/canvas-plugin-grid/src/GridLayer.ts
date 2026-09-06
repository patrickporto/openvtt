import { Graphics } from 'pixi.js';
import { CanvasLayer, CONFIG, GridRenderer, toHex } from '@openvtt/canvas';
import type { CanvasLayerOptions, GridConfig, GridType } from '@openvtt/canvas';

export interface GridLayerOptions extends CanvasLayerOptions {
  grid: GridConfig;
}

/**
 * Layer de renderização do grid. Mudanças de estilo chegam em rajada (sliders
 * do context menu disparam por evento de input), então o redesenho — que
 * re-traça a cena inteira — é coalescido para no máximo um por frame via
 * requestAnimationFrame.
 */
export class GridLayer extends CanvasLayer {
  private readonly graphics = new Graphics();
  private readonly grid: GridConfig;
  private worldWidth = 0;
  private worldHeight = 0;
  private redrawHandle: number | null = null;

  constructor(options: GridLayerOptions) {
    super({ ...options, name: options.name ?? 'grid', zIndex: options.zIndex ?? 950 });
    this.grid = options.grid;
    this.graphics.eventMode = 'none';
    this.addChild(this.graphics);
  }

  setGrid(grid: GridConfig): void {
    Object.assign(this.grid, grid);
    this.scheduleRedraw();
  }

  setSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
    this.scheduleRedraw();
  }

  setType(type: GridType): void {
    this.grid.type = type;
    this.scheduleRedraw();
  }

  get worldSize(): { width: number; height: number } {
    return { width: this.worldWidth, height: this.worldHeight };
  }

  override async draw(): Promise<void> {
    this.redrawNow();
  }

  override async tearDown(): Promise<void> {
    this.cancelRedraw();
    this.graphics.clear();
  }

  redraw(): void {
    this.scheduleRedraw();
  }

  private scheduleRedraw(): void {
    if (this.redrawHandle !== null) return;
    this.redrawHandle = requestAnimationFrame(() => {
      this.redrawHandle = null;
      this.redrawNow();
    });
  }

  private cancelRedraw(): void {
    if (this.redrawHandle !== null) {
      cancelAnimationFrame(this.redrawHandle);
      this.redrawHandle = null;
    }
  }

  private redrawNow(): void {
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
}
