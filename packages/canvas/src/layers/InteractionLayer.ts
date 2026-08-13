import { CanvasLayer, type CanvasLayerOptions } from './CanvasLayer';

export interface InteractionLayerOptions extends CanvasLayerOptions {
  interactive?: boolean;
}

export class InteractionLayer extends CanvasLayer {
  constructor(options: InteractionLayerOptions) {
    super({ ...options, interactive: true });
    this.eventMode = 'static';
    this.sortableChildren = true;
  }

  override activate(): void {
    super.activate();
    this.interactive = true;
  }

  override deactivate(): void {
    super.deactivate();
    this.interactive = false;
  }
}
