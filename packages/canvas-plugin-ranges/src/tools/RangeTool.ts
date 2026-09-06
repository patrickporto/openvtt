import { Tool, type CanvasPointerInfo, type Point } from '@openvtt/canvas';
import { rangesControllerFor } from '../controller';

class RangesIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    const controller = rangesControllerFor(this.canvas);
    if (!controller) return;
    const picked = this.canvas.pick(info.point);
    const token = picked && picked.objectType === 'token' ? picked : undefined;
    const origin: Point = token ? { x: token.x, y: token.y } : this.snap(info.point);
    controller.beginDrag(origin, token?.id);
    this.parent?.transition('dragging');
  }
}

class RangesDragging extends Tool {
  static id = 'dragging';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    const controller = rangesControllerFor(this.canvas);
    if (!controller) return;
    controller.cancelDrag();
    const picked = this.canvas.pick(info.point);
    const token = picked && picked.objectType === 'token' ? picked : undefined;
    const origin: Point = token ? { x: token.x, y: token.y } : this.snap(info.point);
    controller.beginDrag(origin, token?.id);
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    rangesControllerFor(this.canvas)?.updateDrag(this.snap(info.point));
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    const controller = rangesControllerFor(this.canvas);
    if (controller) {
      controller.updateDrag(this.snap(info.point));
      controller.endDrag();
    }
    this.parent?.transition('idle');
  }

  override onPinchStart(): void {
    rangesControllerFor(this.canvas)?.cancelDrag();
    this.parent?.transition('idle');
  }

  protected override onEscape(): void {
    rangesControllerFor(this.canvas)?.cancelDrag();
    this.parent?.transition('idle');
  }
}

export class RangeTool extends Tool {
  static id = 'ranges';
  static initial = 'idle';

  static children() {
    return [RangesIdle, RangesDragging];
  }

  protected override onEscape(): void {
    if (this.current?.id === 'dragging') return;
    rangesControllerFor(this.canvas)?.clear();
    this.backToSelect();
  }

  override onExit(): void {
    rangesControllerFor(this.canvas)?.cancelDrag();
  }
}
