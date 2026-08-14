import { Tool, CONFIG, type CanvasPointerInfo, type Point } from '@openvtt/canvas';
import { chainSegments, ellipsePoints, flattenSegment, rdpSimplify, rectPoints, type SegmentSpec } from '../geometry';
import type { WallSegmentData } from '../schemas';
import type { WallToolOptions } from '../plugin';

class WallIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const p = this.snapIntersection(info.point);
    this.preview.clear();
    this.preview.ghostSegment(p.x, p.y, p.x, p.y);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 2) return;
    const mode = this.opts().mode;
    if (mode === 'freehand') {
      this.parent?.transition('freehand', info.point);
    } else if (mode === 'quadratic' || mode === 'cubic') {
      this.parent?.transition('curve', [this.snapIntersection(info.point)]);
    } else if (mode === 'ellipse' || mode === 'rectangle') {
      this.parent?.transition('shaping', { origin: info.point, mode });
    } else {
      this.parent?.transition('drawing', this.snapIntersection(info.point));
    }
  }

  private opts(): WallToolOptions {
    return this.toolOptions<WallToolOptions>('wall');
  }
}

class WallDrawing extends Tool {
  static id = 'drawing';
  private points: Point[] = [];

  override onEnter(info?: unknown): void {
    this.points = [info as Point];
  }

  private redraw(cursor?: Point): void {
    this.preview.clear();
    for (let i = 0; i + 1 < this.points.length; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      this.preview.ghostSegment(a.x, a.y, b.x, b.y);
    }
    if (cursor && this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      this.preview.ghostSegment(last.x, last.y, cursor.x, cursor.y);
    }
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.redraw(this.snapIntersection(info.point));
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 2) {
      this.cancel();
      return;
    }
    this.points.push(this.snapIntersection(info.point));
    this.redraw();
  }

  override onDoubleClick(): void {
    this.finish();
  }

  override onKeyDown(info: { key: string }): void {
    if (info.key === 'Enter') this.finish();
    else if (info.key === 'Escape') this.cancel();
  }

  private finish(): void {
    const points = this.points.filter((p, i) => i === 0 || p.x !== this.points[i - 1].x || p.y !== this.points[i - 1].y);
    if (points.length >= 2) {
      void this.canvas.documents.create('wall', { segments: chainSegments(points, { door: this.opts().door }) });
    }
    this.points = [];
    this.preview.clear();
    this.parent?.transition('idle');
  }

  private cancel(): void {
    this.points = [];
    this.preview.clear();
    this.parent?.transition('idle');
  }

  private opts(): WallToolOptions {
    return this.toolOptions<WallToolOptions>('wall');
  }
}

class WallFreehand extends Tool {
  static id = 'freehand';
  private points: Point[] = [];

  override onEnter(info?: unknown): void {
    this.points = [info as Point];
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const last = this.points[this.points.length - 1];
    if (Math.hypot(info.point.x - last.x, info.point.y - last.y) < 4) return;
    this.points.push({ ...info.point });
    this.preview.clear();
    this.preview.ghostPolyline(this.points);
  }

  override onPointerUp(): void {
    const simplified = rdpSimplify(this.points, this.opts().tolerance);
    if (simplified.length >= 2) {
      void this.canvas.documents.create('wall', { segments: chainSegments(simplified, { door: this.opts().door }) });
    }
    this.points = [];
    this.preview.clear();
    this.parent?.transition('idle');
  }

  protected override onEscape(): void {
    this.points = [];
    this.preview.clear();
    this.parent?.transition('idle');
  }

  private opts(): WallToolOptions {
    return this.toolOptions<WallToolOptions>('wall');
  }
}

class WallCurve extends Tool {
  static id = 'curve';
  private points: Point[] = [];

  private get required(): number {
    return this.opts().mode === 'cubic' ? 4 : 3;
  }

  override onEnter(info?: unknown): void {
    this.points = (info as Point[]) ?? [];
  }

  private spec(cursor: Point): SegmentSpec {
    const [p1, p2, cp1, cp2] = this.points;
    if (!p2) return { x1: p1.x, y1: p1.y, x2: cursor.x, y2: cursor.y };
    if (this.opts().mode === 'cubic') {
      const c1 = cp1 ?? cursor;
      const c2 = cp2 ?? cursor;
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, curve: 'cubic', cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y };
    }
    const c1 = cp1 ?? cursor;
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, curve: 'quadratic', cp1x: c1.x, cp1y: c1.y };
  }

  private segment(spec: SegmentSpec): WallSegmentData {
    return {
      door: false,
      doorOpen: false,
      secret: false,
      movement: true,
      sight: true,
      sound: false,
      ...spec,
      curve: spec.curve ?? 'linear',
    };
  }

  private ghost(spec: SegmentSpec): void {
    this.preview.clear();
    this.preview.ghostPolylineRaw(flattenSegment(this.segment(spec), 24), CONFIG.wall.color, CONFIG.wall.width, false);
    const g = this.preview.graphics;
    g.circle(spec.x1, spec.y1, 4).fill({ color: CONFIG.wall.color, alpha: 0.9 });
    g.circle(spec.x2, spec.y2, 4).fill({ color: CONFIG.wall.color, alpha: 0.9 });
    const controls: { x: number; y: number; fromX: number; fromY: number }[] = [];
    if (spec.cp1x !== undefined && spec.cp1y !== undefined) {
      controls.push({ x: spec.cp1x, y: spec.cp1y, fromX: spec.x1, fromY: spec.y1 });
    }
    if (spec.curve === 'cubic' && spec.cp2x !== undefined && spec.cp2y !== undefined) {
      controls.push({ x: spec.cp2x, y: spec.cp2y, fromX: spec.x2, fromY: spec.y2 });
    }
    for (const cp of controls) {
      g.moveTo(cp.fromX, cp.fromY).lineTo(cp.x, cp.y).stroke({ color: 0x4fc3f7, width: 1, alpha: 0.7 });
      g.rect(cp.x - 4, cp.y - 4, 8, 8).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ color: 0x4fc3f7, width: 1 });
    }
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    if (this.points.length === 0) return;
    this.ghost(this.spec(this.snapIntersection(info.point)));
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 2) {
      this.cancel();
      return;
    }
    this.points.push(this.snapIntersection(info.point));
    if (this.points.length >= this.required) {
      const spec = this.spec(this.points[this.points.length - 1]);
      void this.canvas.documents.create('wall', { segments: [{ ...spec, door: this.opts().door }] });
      this.preview.clear();
      this.parent?.transition('idle');
      return;
    }
    this.ghost(this.spec(this.points[this.points.length - 1]));
  }

  protected override onEscape(): void {
    this.cancel();
  }

  private cancel(): void {
    this.points = [];
    this.preview.clear();
    this.parent?.transition('idle');
  }

  private opts(): WallToolOptions {
    return this.toolOptions<WallToolOptions>('wall');
  }
}

class WallShaping extends Tool {
  static id = 'shaping';
  private origin: Point = { x: 0, y: 0 };
  private mode: 'ellipse' | 'rectangle' = 'ellipse';

  override onEnter(info?: unknown): void {
    const data = info as { origin: Point; mode: 'ellipse' | 'rectangle' };
    this.origin = data.origin;
    this.mode = data.mode;
  }

  private frame(current: Point, alt: boolean, ctrl: boolean): { cx: number; cy: number; rx: number; ry: number } {
    const dx = current.x - this.origin.x;
    const dy = current.y - this.origin.y;
    let w = Math.abs(dx);
    let h = Math.abs(dy);
    if (alt) w = h = Math.max(w, h);
    const rx = ctrl ? w : w / 2;
    const ry = ctrl ? h : h / 2;
    return {
      cx: ctrl ? this.origin.x : this.origin.x + Math.sign(dx || 1) * rx,
      cy: ctrl ? this.origin.y : this.origin.y + Math.sign(dy || 1) * ry,
      rx,
      ry,
    };
  }

  private pointsFor(current: Point, alt: boolean, ctrl: boolean): Point[] {
    const { cx, cy, rx, ry } = this.frame(current, alt, ctrl);
    const options = this.opts();
    if (this.mode === 'ellipse') return ellipsePoints(cx, cy, rx, ry, Math.max(4, options.segments));
    return rectPoints(cx - rx, cy - ry, rx * 2, ry * 2, Math.max(1, options.sideSegments));
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    this.preview.ghostPolyline(this.pointsFor(info.point, info.altKey, info.ctrlKey));
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    const { rx, ry } = this.frame(info.point, info.altKey, info.ctrlKey);
    if (rx >= 4 && ry >= 4) {
      const points = this.pointsFor(info.point, info.altKey, info.ctrlKey);
      void this.canvas.documents.create('wall', { segments: chainSegments(points, { door: this.opts().door }) });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }

  protected override onEscape(): void {
    this.preview.clear();
    this.parent?.transition('idle');
  }

  private opts(): WallToolOptions {
    return this.toolOptions<WallToolOptions>('wall');
  }
}

export class WallTool extends Tool {
  static id = 'wall';
  static initial = 'idle';
  static children() {
    return [WallIdle, WallDrawing, WallFreehand, WallCurve, WallShaping];
  }

  override onExit(): void {
    this.preview.clear();
  }
}
