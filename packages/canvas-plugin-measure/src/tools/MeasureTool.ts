import { Tool, dynamicBus, type CanvasPointerInfo, type Point } from '@openvtt/canvas';
import { buildMeasurePayload, formatMetrics, pathLength, resolveMeasureOptions } from '../resolve';

class MeasureIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('pointing', this.snap(info.point));
  }
}

class MeasurePointing extends Tool {
  static id = 'pointing';
  private start: Point = { x: 0, y: 0 };

  override onEnter(info?: unknown): void {
    this.start = info as Point;
  }

  override onPointerMove(): void {
    if (this.inputs.isDragging) this.parent?.transition('measuring', this.start);
  }

  override onPointerUp(): void {
    this.parent?.transition('waypoints', [this.start]);
  }
}

class MeasureMeasuring extends Tool {
  static id = 'measuring';
  private start: Point = { x: 0, y: 0 };

  override onEnter(info?: unknown): void {
    this.start = info as Point;
    this.preview.clear();
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const end = this.snap(info.point);
    this.preview.clear();
    this.preview.ruler(this.start.x, this.start.y, end.x, end.y, this.labelFor(end));
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    const end = this.snap(info.point);
    this.preview.clear();
    emitMeasure(this, [this.start, end]);
    this.parent?.transition('idle');
  }

  private labelFor(end: Point): string {
    const cells = Math.hypot(end.x - this.start.x, end.y - this.start.y) / this.canvas.grid.size;
    return formatMetrics(resolveMeasureOptions(this.toolOptions('measure')), cells);
  }
}

class MeasureWaypoints extends Tool {
  static id = 'waypoints';
  private points: Point[] = [];

  override onEnter(info?: unknown): void {
    this.points = (info as Point[]) ?? [];
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.points.push(this.snap(info.point));
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.render(this.snap(info.point));
  }

  override onDoubleClick(): void {
    this.finish();
  }

  override onKeyDown(info: { key: string }): void {
    if (info.key === 'Enter') {
      this.finish();
      return;
    }
    super.onKeyDown(info);
  }

  private finish(): void {
    if (this.points.length >= 2) emitMeasure(this, this.points);
    this.preview.clear();
    this.parent?.transition('idle');
  }

  private render(cursor: Point): void {
    this.preview.clear();
    if (this.points.length === 0) return;
    const options = resolveMeasureOptions(this.toolOptions('measure'));
    const path = [...this.points, cursor];
    this.preview.ghostPolyline(path);
    const total = pathLength(path) / this.canvas.grid.size;
    const last = pathLength(this.points.length >= 2 ? this.points.slice(-2) : [this.points[0], cursor]) / this.canvas.grid.size;
    const label =
      this.points.length >= 2
        ? `${formatMetrics(options, total)} (+${formatMetrics(options, last)})`
        : formatMetrics(options, total);
    this.preview.showLabel(label, cursor.x + 12, cursor.y - 24);
  }

  protected override onEscape(): void {
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

function emitMeasure(tool: Tool, points: Point[]): void {
  const options = resolveMeasureOptions(tool.toolOptions('measure'));
  dynamicBus(tool.canvas.bus).emit('measure', buildMeasurePayload(options, points, tool.canvas.grid.size));
}

export class MeasureTool extends Tool {
  static id = 'measure';
  static initial = 'idle';
  static children() {
    return [MeasureIdle, MeasurePointing, MeasureMeasuring, MeasureWaypoints];
  }

  protected override onEscape(): void {
    this.preview.clear();
    this.backToSelect();
  }

  override onExit(): void {
    this.preview.clear();
  }
}
