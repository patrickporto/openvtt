import { PlaceablesLayer } from './PlaceablesLayer';
import type { CanvasLike } from '../placeables/PlaceableObject';
import { AmbientLight } from '../placeables/AmbientLight';
import type { LightData, LightDataInput } from '../schemas';
import type { CanvasBus } from '../bus';

export class LightsLayer extends PlaceablesLayer<LightData, AmbientLight, LightDataInput> {
  constructor(canvas: CanvasLike) {
    super({ name: 'lights', zIndex: 70, objectClass: AmbientLight, canvas });
  }

  protected override emitCreate(document: LightData & { id: string }): void {
    (this.canvas.bus as CanvasBus).emit('light:create', { ...document, id: document.id });
  }
  protected override emitUpdate(document: LightData): void {
    (this.canvas.bus as CanvasBus).emit('light:update', { ...document });
  }
  protected override emitDelete(id: string): void {
    (this.canvas.bus as CanvasBus).emit('light:delete', { id });
  }
}
