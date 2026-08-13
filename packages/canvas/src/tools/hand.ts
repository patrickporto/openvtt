import { Tool } from './Tool';

class HandIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('grab');
    if (this.inputs.isPointing) this.parent?.transition('panning');
  }

  override onPointerDown(): void {
    this.parent?.transition('panning');
  }
}

class HandPanning extends Tool {
  static id = 'panning';

  override onEnter(): void {
    this.setCursor('grabbing');
  }

  override onPointerMove(): void {
    const current = this.inputs.getCurrentScreenPoint();
    const previous = this.inputs.getPreviousScreenPoint();
    this.viewport?.panBy(current.x - previous.x, current.y - previous.y);
  }

  override onPointerUp(): void {
    this.parent?.transition('idle');
  }
}

export class HandTool extends Tool {
  static id = 'hand';
  static initial = 'idle';
  static children() {
    return [HandIdle, HandPanning];
  }
}
