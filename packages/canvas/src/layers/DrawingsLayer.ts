import { PlaceablesLayer } from './PlaceablesLayer';
import type { CanvasLike } from '../placeables/PlaceableObject';
import { Drawing } from '../placeables/Drawing';
import type { DrawingData, DrawingDataInput } from '../schemas';
import type { CanvasBus } from '../bus';

export class DrawingsLayer extends PlaceablesLayer<DrawingData, Drawing, DrawingDataInput> {
  constructor(canvas: CanvasLike) {
    super({ name: 'drawings', zIndex: 20, objectClass: Drawing, canvas });
    this.sortableChildren = true;
  }

  protected override emitCreate(document: DrawingData & { id: string }): void {
    (this.canvas.bus as CanvasBus).emit('drawing:create', { ...document, id: document.id });
  }
  protected override emitDelete(id: string): void {
    (this.canvas.bus as CanvasBus).emit('drawing:delete', { id });
  }
}
