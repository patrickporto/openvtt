import { GridRenderer, Tool, type CanvasPointerInfo, type CanvasWheelInfo, type Point } from '@openvtt/canvas';
import type { TemplateToolOptions } from '../plugin';
import { conePoints, rayPoints } from '../templates/geometry';
import { affectedCells, footprintOf } from '../templates/cells';

const WHEEL_NOTCH = 100;
const ROTATE_STEP_SNAP = Math.PI / 12;
const ROTATE_STEP_FREE = Math.PI / 90;
const DISTANCE_STEP_SNAP = 0.5;
const DISTANCE_STEP_FREE = 0.1;

function snapEnabled(tool: Tool, shiftKey: boolean): boolean {
  return (tool.toolOptions<TemplateToolOptions>('template').snap ?? true) !== shiftKey;
}

function originFor(tool: Tool, info: CanvasPointerInfo): Point {
  return snapEnabled(tool, info.shiftKey) ? tool.snapIntersection(info.point) : info.point;
}

function formatDistance(distance: number): string {
  return Number.isInteger(distance) ? String(distance) : distance.toFixed(1);
}

function drawTemplatePreview(tool: Tool, draft: Point & { direction: number; distance: number }, pointer?: Point): void {
  const opts = tool.toolOptions<TemplateToolOptions>('template');
  const cell = tool.canvas.grid.size;
  const length = draft.distance * cell;
  const color = typeof opts.color === 'number' ? opts.color : 0x4fc3f7;
  const preview = tool.preview;
  preview.clear();

  const footprint = footprintOf({ shape: opts.shape, x: draft.x, y: draft.y, direction: draft.direction, distance: draft.distance, width: opts.width }, cell);
  const grid = tool.canvas.grid;
  for (const center of affectedCells(footprint, grid)) {
    const shape = GridRenderer.getCellShape(center.x, center.y, grid.type, cell, grid.offsetX ?? 0, grid.offsetY ?? 0);
    if (shape) preview.ghostCell(shape, color);
  }

  if (opts.shape === 'circle') {
    preview.ghostToken(draft.x, draft.y, length, color);
  } else {
    const points =
      opts.shape === 'cone'
        ? conePoints(draft, draft.direction, length)
        : rayPoints(draft, draft.direction, length, opts.width * cell);
    preview.ghostPolygon(points, color);
  }

  const at = pointer ?? draft;
  preview.showLabel(`${formatDistance(draft.distance)} u`, at.x + 12, at.y - 24);
}

export class TemplateTool extends Tool {
  static id = 'template';
  static initial = 'idle';
  static children() {
    return [TemplateIdle, TemplateAdjusting];
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
    const origin = originFor(this, info);
    drawTemplatePreview(this, { x: origin.x, y: origin.y, direction: 0, distance: this.toolOptions<TemplateToolOptions>('template').distance }, info.point);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    this.parent?.transition('adjusting', { origin: originFor(this, info) });
  }
}

class TemplateAdjusting extends Tool {
  static id = 'adjusting';
  private origin: Point = { x: 0, y: 0 };
  private distance = 1;
  private direction = 0;
  private wheelRemainder = 0;

  override onEnter(info?: unknown): void {
    const data = info as { origin: Point };
    this.origin = data.origin;
    this.distance = this.toolOptions<TemplateToolOptions>('template').distance;
    this.direction = 0;
    this.wheelRemainder = 0;
    drawTemplatePreview(this, { ...this.origin, direction: this.direction, distance: this.distance });
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const dx = info.point.x - this.origin.x;
    const dy = info.point.y - this.origin.y;
    const drag = Math.hypot(dx, dy);
    if (drag > 4) {
      const cell = this.canvas.grid.size;
      const ratio = drag / cell;
      this.distance = snapEnabled(this, info.shiftKey)
        ? Math.max(DISTANCE_STEP_SNAP, Math.round(ratio / DISTANCE_STEP_SNAP) * DISTANCE_STEP_SNAP)
        : Math.max(DISTANCE_STEP_FREE, Math.round(ratio / DISTANCE_STEP_FREE) * DISTANCE_STEP_FREE);
      this.direction = Math.atan2(dy, dx);
    }
    drawTemplatePreview(this, { ...this.origin, direction: this.direction, distance: this.distance }, info.point);
  }

  override onWheel(info: CanvasWheelInfo): void {
    this.wheelRemainder += info.delta.y;
    const notches = Math.trunc(this.wheelRemainder / WHEEL_NOTCH);
    if (notches === 0) return;
    this.wheelRemainder -= notches * WHEEL_NOTCH;

    const sign = notches > 0 ? 1 : -1;
    const snap = snapEnabled(this, info.shiftKey);
    const shape = this.toolOptions<TemplateToolOptions>('template').shape;
    if (shape === 'circle') {
      const step = snap ? DISTANCE_STEP_SNAP : DISTANCE_STEP_FREE;
      this.distance = Math.max(step, Math.round((this.distance + sign * step) * 10) / 10);
    } else {
      const step = snap ? ROTATE_STEP_SNAP : ROTATE_STEP_FREE;
      this.direction = Math.round(this.direction / step) * step + sign * step;
    }
    drawTemplatePreview(this, { ...this.origin, direction: this.direction, distance: this.distance }, info.point);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 2) {
      this.preview.clear();
      this.parent?.transition('idle');
      return;
    }
    if (info.button !== 0) return;
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

  override onExit(): void {
    this.preview.clear();
  }

  protected override onEscape(): void {
    this.preview.clear();
    this.parent?.transition('idle');
  }
}
