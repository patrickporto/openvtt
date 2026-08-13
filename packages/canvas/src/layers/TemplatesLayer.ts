import { PlaceablesLayer } from './PlaceablesLayer';
import type { CanvasLike } from '../placeables/PlaceableObject';
import { AoETemplate } from '../placeables/AoETemplate';
import type { TemplateData, TemplateDataInput } from '../schemas';
import type { CanvasBus } from '../bus';

export class TemplatesLayer extends PlaceablesLayer<TemplateData, AoETemplate, TemplateDataInput> {
  constructor(canvas: CanvasLike) {
    super({ name: 'templates', zIndex: 45, objectClass: AoETemplate, canvas });
  }

  protected override emitCreate(document: TemplateData & { id: string }): void {
    (this.canvas.bus as CanvasBus).emit('template:create', { ...document, id: document.id });
  }
  protected override emitUpdate(document: TemplateData): void {
    (this.canvas.bus as CanvasBus).emit('template:update', { ...document });
  }
  protected override emitDelete(id: string): void {
    (this.canvas.bus as CanvasBus).emit('template:delete', { id });
  }
}
