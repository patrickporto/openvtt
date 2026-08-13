import { Tool } from './Tool';
import type { CanvasPointerInfo, Point } from '../input/types';
import { chainSegments, ellipsePoints, rdpSimplify, rectPoints, type SegmentSpec } from '../geometry';
import type { WallSegmentDataInput } from '../schemas';

function normalizeRect(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/* ------------------------------- Token ------------------------------- */

export class TokenTool extends Tool {
  static id = 'token';

  private ghost(info: CanvasPointerInfo): void {
    const p = this.snap(info.point);
    const radius = (this.options.token.size * this.canvas.grid.size) / 2;
    this.preview.clear();
    this.preview.ghostToken(p.x, p.y, radius);
  }

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onExit(): void {
    this.preview.clear();
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.ghost(info);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    const p = this.snap(info.point);
    const { size, texture, label, tint } = this.options.token;
    void this.canvas.tokens.create({ x: p.x, y: p.y, size, texture, label, tint });
    this.ghost(info);
  }
}

/* -------------------------------- Wall ------------------------------- */

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
    const mode = this.options.wall.mode;
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
    if (cursor && this.points.length) {
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
      const door = this.options.wall.door;
      void this.canvas.walls.create({ segments: chainSegments(points, { door }) as WallSegmentDataInput[] });
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
}

/** Monk's Wall Enhancement: desenho livre simplificado (RDP) ao soltar. */
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
    const simplified = rdpSimplify(this.points, this.options.wall.tolerance);
    if (simplified.length >= 2) {
      const door = this.options.wall.door;
      void this.canvas.walls.create({ segments: chainSegments(simplified, { door }) as WallSegmentDataInput[] });
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
}

/** DF Curvy Walls: curvas bezier quadrática (3 cliques) e cúbica (4 cliques). */
class WallCurve extends Tool {
  static id = 'curve';
  private points: Point[] = [];

  private get required(): number {
    return this.options.wall.mode === 'cubic' ? 4 : 3;
  }

  override onEnter(info?: unknown): void {
    this.points = (info as Point[]) ?? [];
  }

  private spec(cursor: Point): SegmentSpec {
    const [p1, p2, cp1, cp2] = this.points;
    if (!p2) return { x1: p1.x, y1: p1.y, x2: cursor.x, y2: cursor.y };
    if (this.options.wall.mode === 'cubic') {
      const c1 = cp1 ?? cursor;
      const c2 = cp2 ?? cursor;
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, curve: 'cubic', cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y };
    }
    const c1 = cp1 ?? cursor;
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, curve: 'quadratic', cp1x: c1.x, cp1y: c1.y };
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    if (this.points.length === 0) return;
    this.preview.ghostCurve(this.spec(this.snapIntersection(info.point)));
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 2) {
      this.cancel();
      return;
    }
    this.points.push(this.snapIntersection(info.point));
    if (this.points.length >= this.required) {
      const spec = this.spec(this.points[this.points.length - 1]);
      void this.canvas.walls.create({ segments: [{ ...spec, door: this.options.wall.door } as WallSegmentDataInput] });
      this.preview.clear();
      this.parent?.transition('idle');
      return;
    }
    this.preview.clear();
    this.preview.ghostCurve(this.spec(this.points[this.points.length - 1]));
  }

  protected override onEscape(): void {
    this.cancel();
  }

  private cancel(): void {
    this.points = [];
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

/** DF Curvy Walls: elipse (N cordas) e retângulo (segmentos por lado). Alt = quadrado/círculo, Ctrl = a partir do centro. */
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
    if (this.mode === 'ellipse') return ellipsePoints(cx, cy, rx, ry, Math.max(4, this.options.wall.segments));
    return rectPoints(cx - rx, cy - ry, rx * 2, ry * 2, Math.max(1, this.options.wall.sideSegments));
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.preview.clear();
    this.preview.ghostPolyline(this.pointsFor(info.point, info.altKey, info.ctrlKey));
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    const { rx, ry } = this.frame(info.point, info.altKey, info.ctrlKey);
    if (rx >= 4 && ry >= 4) {
      const door = this.options.wall.door;
      const points = this.pointsFor(info.point, info.altKey, info.ctrlKey);
      void this.canvas.walls.create({ segments: chainSegments(points, { door }) as WallSegmentDataInput[] });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }

  protected override onEscape(): void {
    this.preview.clear();
    this.parent?.transition('idle');
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

/* -------------------------------- Tile ------------------------------- */

class TileIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('dragging', this.snapIntersection(info.point));
  }
}

class TileDragging extends Tool {
  static id = 'dragging';
  private start: Point = { x: 0, y: 0 };

  override onEnter(info?: unknown): void {
    this.start = info as Point;
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const rect = normalizeRect(this.start, this.snapIntersection(info.point));
    this.preview.clear();
    this.preview.ghostRect(rect.x, rect.y, rect.width, rect.height);
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    const rect = normalizeRect(this.start, this.snapIntersection(info.point));
    const texture = this.options.tile.texture;
    if (rect.width < 4 && rect.height < 4) {
      const size = this.canvas.grid.size;
      void this.canvas.tiles.create({
        x: this.start.x,
        y: this.start.y,
        width: this.options.tile.width * size,
        height: this.options.tile.height * size,
        texture,
      });
    } else {
      void this.canvas.tiles.create({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, texture });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

export class TileTool extends Tool {
  static id = 'tile';
  static initial = 'idle';
  static children() {
    return [TileIdle, TileDragging];
  }

  override onExit(): void {
    this.preview.clear();
  }
}

/* -------------------------------- Draw ------------------------------- */

class DrawIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('drawing', info.point);
  }
}

class DrawDrawing extends Tool {
  static id = 'drawing';
  private points: number[] = [];

  override onEnter(info?: unknown): void {
    const p = info as Point;
    this.points = [p.x, p.y];
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    this.points.push(info.point.x, info.point.y);
    const g = this.preview.graphics;
    g.clear();
    if (this.points.length >= 4) {
      g.moveTo(this.points[0], this.points[1]);
      for (let i = 2; i < this.points.length; i += 2) g.lineTo(this.points[i], this.points[i + 1]);
      g.stroke({ color: this.asHex(this.options.draw.color), width: this.options.draw.width, alpha: 0.9 });
    }
  }

  override onPointerUp(): void {
    if (this.points.length >= 4) {
      void this.canvas.drawings.create({
        type: 'brush',
        x: 0,
        y: 0,
        points: [...this.points],
        strokeColor: this.options.draw.color,
        strokeWidth: this.options.draw.width,
      });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }

  private asHex(color: number | string): number {
    return typeof color === 'number' ? color : parseInt(color.replace('#', ''), 16);
  }
}

export class DrawTool extends Tool {
  static id = 'draw';
  static initial = 'idle';
  static children() {
    return [DrawIdle, DrawDrawing];
  }

  override onExit(): void {
    this.preview.clear();
  }
}

/* -------------------------------- Shape ------------------------------ */

class ShapeIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('crosshair');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    this.parent?.transition('dragging', this.snapIntersection(info.point));
  }
}

class ShapeDragging extends Tool {
  static id = 'dragging';
  private start: Point = { x: 0, y: 0 };

  override onEnter(info?: unknown): void {
    this.start = info as Point;
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const rect = normalizeRect(this.start, this.snapIntersection(info.point));
    this.preview.clear();
    this.preview.ghostRect(rect.x, rect.y, rect.width, rect.height);
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    const rect = normalizeRect(this.start, this.snapIntersection(info.point));
    if (rect.width >= 4 && rect.height >= 4) {
      const { kind, color, fillAlpha, strokeWidth } = this.options.shape;
      void this.canvas.drawings.create({
        type: kind,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fillColor: color,
        fillAlpha,
        strokeColor: color,
        strokeWidth,
      });
    }
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

export class ShapeTool extends Tool {
  static id = 'shape';
  static initial = 'idle';
  static children() {
    return [ShapeIdle, ShapeDragging];
  }

  override onExit(): void {
    this.preview.clear();
  }
}
