import { PlaceablesLayer } from './PlaceablesLayer';
import type { CanvasLike } from '../placeables/PlaceableObject';
import { Tile } from '../placeables/Tile';
import type { TileData, TileDataInput } from '../schemas';
import type { CanvasBus } from '../bus';

export class TileLayer extends PlaceablesLayer<TileData, Tile, TileDataInput> {
  constructor(canvas: CanvasLike) {
    super({ name: 'tiles', zIndex: 0, objectClass: Tile, canvas });
    this.sortableChildren = true;
  }

  protected override emitCreate(document: TileData & { id: string }): void {
    (this.canvas.bus as CanvasBus).emit('tile:create', { ...document, id: document.id });
  }
  protected override emitUpdate(document: TileData): void {
    (this.canvas.bus as CanvasBus).emit('tile:update', document as TileData);
  }
  protected override emitDelete(id: string): void {
    (this.canvas.bus as CanvasBus).emit('tile:delete', { id });
  }
}
