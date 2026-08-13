import { Container } from 'pixi.js';

export interface CanvasLayerOptions {
  name: string;
  zIndex?: number;
  interactive?: boolean;
}

export class CanvasLayer extends Container {
  readonly layerName: string;
  readonly options: CanvasLayerOptions;
  protected _active = false;
  protected _disabled = false;

  constructor(options: CanvasLayerOptions) {
    super();
    this.options = options;
    this.layerName = options.name;
    this.label = options.name;
    if (options.zIndex !== undefined) this.zIndex = options.zIndex;
    this.eventMode = options.interactive ? 'passive' : 'none';
  }

  get active(): boolean {
    return this._active;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  activate(): void {
    this._active = true;
  }

  deactivate(): void {
    this._active = false;
  }

  disable(): void {
    this._disabled = true;
    this.visible = false;
  }

  enable(): void {
    this._disabled = false;
    this.visible = true;
  }

  async draw(): Promise<void> {
    return;
  }

  async tearDown(): Promise<void> {
    this.removeChildren().forEach((child) => child.destroy({ children: true }));
  }
}
