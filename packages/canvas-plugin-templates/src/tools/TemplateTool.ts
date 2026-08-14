import { Tool, type CanvasPointerInfo, type Point } from '@openvtt/canvas';
import type { TemplateToolOptions } from '../plugin';
import { conePoints, rayPoints } from '../templates/geometry';

export class TemplateTool extends Tool {
  static id = 'template';
  static initial = 'idle';
  static children() {
    return [TemplateIdle, TemplatePlacing];
  }

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onExit(): void {
    this.preview.clear();
  }
}

class TemplateIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.preview.clear();
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    drawTemplatePreview(this, info.point, this.toolOptions<TemplateToolOptions>('template').distance, 0);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('placing', { origin: info.point });
  }
}

class TemplatePlacing extends Tool {
  static id = 'placing';
  private origin: Point = { x: 0, y: 0 };
  private distance = 1;
  private direction = 0;

  override onEnter(info?: unknown): void {
    const data = info as { origin: Point };
    this.origin = data.origin;
    this.distance = this.toolOptions<TemplateToolOptions>('template').distance;
    this.direction = 0;
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const dx = info.point.x - this.origin.x;
    const dy = info.point.y - this.origin.y;
    const drag = Math.hypot(dx, dy);
    if (drag > 4) {
      const cell = this.canvas.grid.size;
      this.distance = Math.max(0.5, Math.round((drag / cell) * 2) / 2);
      this.direction = Math.atan2(dy, dx);
    }
    drawTemplatePreview(this, this.origin, this.distance, this.direction);
  }

  override onPointerUp(): void {
    const opts = this.toolOptions<TemplateToolOptions>('template');
    void this.canvas.documents.create('template', {
      shape: opts.shape,
      x: this.origin.x,
      y: this.origin.y,
      direction: this.direction,
      distance: this.distance,
      width: opts.width,
      color: opts.color,
      fillAlpha: opts.fillAlpha,
    });
    this.preview.clear();
    this.parent?.transition('idle');
  }

  protected override onEscape(): void {
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

function drawTemplatePreview(tool: Tool, origin: Point, distanceCells: number, direction: number): void {
  const opts = tool.toolOptions<TemplateToolOptions>('template');
  const cell = tool.canvas.grid.size;
  const length = distanceCells * cell;
  const color = typeof opts.color === 'number' ? opts.color : 0x4fc3f7;
  const preview = tool.preview;
  preview.clear();
  if (opts.shape === 'circle') {
    preview.ghostToken(origin.x, origin.y, length, color);
  } else {
    const points =
      opts.shape === 'cone'
        ? conePoints(origin, direction, length)
        : rayPoints(origin, direction, length, opts.width * cell);
    preview.ghostPolygon(points, color);
  }
}
