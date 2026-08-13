import { PlaceablesLayer } from './PlaceablesLayer';
import type { CanvasLike } from '../placeables/PlaceableObject';
import { Token } from '../placeables/Token';
import type { TokenData, TokenDataInput } from '../schemas';
import type { CanvasBus } from '../bus';

export class TokenLayer extends PlaceablesLayer<TokenData, Token, TokenDataInput> {
  constructor(canvas: CanvasLike) {
    super({
      name: 'tokens',
      zIndex: 50,
      objectClass: Token,
      canvas,
    });
    this.sortableChildren = true;
  }

  protected override emitCreate(document: TokenData & { id: string }): void {
    (this.canvas.bus as CanvasBus).emit('token:create', { ...document, id: document.id });
  }
  protected override emitUpdate(document: TokenData): void {
    (this.canvas.bus as CanvasBus).emit('token:update', document as TokenData);
  }
  protected override emitDelete(id: string): void {
    (this.canvas.bus as CanvasBus).emit('token:delete', { id });
  }
}
