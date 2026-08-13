import { Tool } from './Tool';
import type { PlaceableObject } from '../placeables/PlaceableObject';
import type { Wall } from '../placeables/Wall';
import type { CanvasPointerInfo, Point } from '../input/types';
import type { HandleCorner, HandleInfo } from '../handles/HandlesLayer';
import { withPointAt, type WallPointRef } from '../layers/WallsLayer';
import type { WallSegmentData } from '../schemas';

function cursorForHandle(handle: HandleInfo): string {
  if (handle.type === 'rotate') return 'crosshair';
  if (handle.type === 'wall-point') return 'move';
  return handle.corner === 'tl' || handle.corner === 'br' ? 'nwse-resize' : 'nesw-resize';
}

/** Campos de documento que cada tipo transformável expõe para resize/rotação. */
function transformFields(obj: PlaceableObject): Record<string, unknown> {
  const doc = obj.document as Record<string, unknown>;
  if (obj.objectType === 'token') return { x: obj.x, y: obj.y, size: doc.size ?? 1, rotation: doc.rotation ?? 0 };
  return { x: obj.x, y: obj.y, width: doc.width ?? 0, height: doc.height ?? 0, rotation: doc.rotation ?? 0 };
}

interface TransformSnapshot {
  obj: PlaceableObject;
  aabb: { minX: number; minY: number; width: number; height: number };
  x: number;
  y: number;
  rotation: number;
  before: Record<string, unknown>;
}

function takeSnapshots(objects: PlaceableObject[]): TransformSnapshot[] {
  return objects.map((obj) => {
    const b = obj.getAABB();
    return {
      obj,
      aabb: { minX: b.minX, minY: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY },
      x: obj.x,
      y: obj.y,
      rotation: obj.rotation,
      before: transformFields(obj),
    };
  });
}

class SelectIdle extends Tool {
  static id = 'idle';

  override onEnter(): void {
    this.setCursor('default');
    this.preview.clear();
  }

  override onPointerMove(): void {
    const point = this.inputs.getCurrentWorldPoint();
    const handle = this.canvas.handles.pickHandle(point);
    if (handle) {
      this.setCursor(cursorForHandle(handle));
      return;
    }
    const door = this.canvas.findDoor(point, this.doorTolerance());
    this.setCursor(door ? 'pointer' : 'default');
  }

  private doorTolerance(): number {
    return 12 / (this.viewport?.scale ?? 1);
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 2) {
      if (info.ctrlKey) {
        const door = this.canvas.findDoor(info.point, this.doorTolerance());
        if (door) this.canvas.toggleSecret(door.wall, door.segmentIndex);
      }
      return;
    }
    const handle = this.canvas.handles.pickHandle(info.point);
    if (handle) {
      this.parent?.transition('pointingHandle', handle);
      return;
    }
    const door = this.canvas.findDoor(info.point, this.doorTolerance());
    if (door) {
      this.parent?.transition('pointingDoor', { door, pointer: info });
      return;
    }
    if (info.target.type === 'object') {
      this.parent?.transition('pointingObject', info);
    } else {
      this.parent?.transition('pointingCanvas', info);
    }
  }
}

class SelectPointingDoor extends Tool {
  static id = 'pointingDoor';
  private door: { wall: Wall; segmentIndex: number } | null = null;
  private pointer: CanvasPointerInfo | null = null;

  override onEnter(info?: unknown): void {
    const data = info as { door: { wall: Wall; segmentIndex: number }; pointer: CanvasPointerInfo };
    this.door = data.door;
    this.pointer = data.pointer;
  }

  override onPointerMove(): void {
    // Portas são click-to-toggle: arrastar uma porta não move a wall
    // (walls não têm position própria — os segmentos são coordenadas absolutas).
  }

  override onPointerUp(): void {
    if (this.door) this.canvas.toggleDoor(this.door.wall, this.door.segmentIndex);
    this.parent?.transition('idle');
  }
}

class SelectPointingObject extends Tool {
  static id = 'pointingObject';
  private object: PlaceableObject | null = null;

  override onEnter(info?: unknown): void {
    const pointer = info as CanvasPointerInfo;
    this.object = pointer.target.type === 'object' ? pointer.target.object : null;
  }

  override onPointerMove(): void {
    if (this.inputs.isDragging && this.object) {
      this.parent?.transition('dragging', this.object);
    }
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (this.object) this.canvas.select(this.object, info.shiftKey);
    this.parent?.transition('idle');
  }
}

class SelectDragging extends Tool {
  static id = 'dragging';
  private startWorld: Point = { x: 0, y: 0 };
  private startPositions = new Map<string, Point>();
  private primary: PlaceableObject | null = null;
  private measureFrom: Point | null = null;
  private moved = false;
  private committed = false;

  override onEnter(info?: unknown): void {
    this.primary = (info as PlaceableObject) ?? null;
    if (this.primary && !this.canvas.selection.has(this.primary.id)) {
      this.canvas.select(this.primary, false);
    }
    this.moved = false;
    this.committed = false;
    this.startWorld = this.inputs.getCurrentWorldPoint();
    this.startPositions.clear();
    for (const obj of this.canvas.selected) {
      if (obj.objectType === 'wall') continue;
      this.startPositions.set(obj.id, { x: obj.x, y: obj.y });
    }
    const primaryStart = this.primary ? this.startPositions.get(this.primary.id) : undefined;
    this.measureFrom = this.primary?.objectType === 'token' && primaryStart ? { ...primaryStart } : null;
    this.setCursor('grabbing');
  }

  override onPointerMove(): void {
    const current = this.inputs.getCurrentWorldPoint();
    const dx = current.x - this.startWorld.x;
    const dy = current.y - this.startWorld.y;
    if (dx !== 0 || dy !== 0) this.moved = true;

    const primaryStart = this.primary ? this.startPositions.get(this.primary.id) : undefined;
    let snapDelta: Point = { x: dx, y: dy };
    if (this.primary && primaryStart && this.primary.objectType === 'token') {
      const snapped = this.snap({ x: primaryStart.x + dx, y: primaryStart.y + dy });
      snapDelta = { x: snapped.x - primaryStart.x, y: snapped.y - primaryStart.y };
    }

    for (const obj of this.canvas.selected) {
      const start = this.startPositions.get(obj.id);
      if (!start) continue;
      const nx = start.x + snapDelta.x;
      const ny = start.y + snapDelta.y;
      if (obj.objectType === 'token' && this.canvas.isMoveBlocked({ x: obj.x, y: obj.y }, { x: nx, y: ny })) {
        continue;
      }
      obj.position.set(nx, ny);
      obj.refresh();
      this.canvas.reindex(obj);
    }
    if (this.measureFrom && this.primary) {
      const units = Math.hypot(this.primary.x - this.measureFrom.x, this.primary.y - this.measureFrom.y) / this.canvas.grid.size;
      this.preview.clear();
      this.preview.ruler(this.measureFrom.x, this.measureFrom.y, this.primary.x, this.primary.y, `${units.toFixed(1)} u`);
    }
    this.canvas.handles.refresh();
    this.canvas.fog.compose();
  }

  override onPointerUp(): void {
    this.preview.clear();
    this.committed = true;
    if (this.moved) {
      this.canvas.history.beginBatch();
      for (const obj of this.canvas.selected) {
        const start = this.startPositions.get(obj.id);
        if (!start || (start.x === obj.x && start.y === obj.y)) continue;
        this.canvas.commitMove(obj);
      }
      this.canvas.history.endBatch();
    }
    this.parent?.transition('idle');
  }

  override onExit(): void {
    this.preview.clear();
    if (this.moved && !this.committed) this.restorePositions();
  }

  protected override onEscape(): void {
    this.restorePositions();
    this.parent?.transition('idle');
  }

  private restorePositions(): void {
    for (const obj of this.canvas.selected) {
      const start = this.startPositions.get(obj.id);
      if (!start) continue;
      obj.position.set(start.x, start.y);
      obj.refresh();
      this.canvas.reindex(obj);
    }
    this.canvas.handles.refresh();
    this.canvas.fog.compose();
  }
}

class SelectPointingCanvas extends Tool {
  static id = 'pointingCanvas';

  override onPointerMove(): void {
    if (this.inputs.isDragging) this.parent?.transition('marquee');
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    if (!info.shiftKey) this.canvas.clearSelection();
    this.parent?.transition('idle');
  }
}

class SelectMarquee extends Tool {
  static id = 'marquee';
  private origin: Point = { x: 0, y: 0 };

  override onEnter(): void {
    this.origin = this.inputs.getOriginWorldPoint();
    this.setCursor('crosshair');
  }

  override onPointerMove(): void {
    const current = this.inputs.getCurrentWorldPoint();
    const x = Math.min(this.origin.x, current.x);
    const y = Math.min(this.origin.y, current.y);
    const width = Math.abs(current.x - this.origin.x);
    const height = Math.abs(current.y - this.origin.y);
    this.preview.clear();
    this.preview.marquee(x, y, width, height);
  }

  override onPointerUp(info: CanvasPointerInfo): void {
    const current = this.inputs.getCurrentWorldPoint();
    const rect = {
      x: Math.min(this.origin.x, current.x),
      y: Math.min(this.origin.y, current.y),
      width: Math.abs(current.x - this.origin.x),
      height: Math.abs(current.y - this.origin.y),
    };
    const hits = this.canvas.pickRect(rect);
    if (!info.shiftKey) this.canvas.clearSelection();
    for (const obj of hits) this.canvas.select(obj, true);
    this.preview.clear();
    this.parent?.transition('idle');
  }
}

class SelectPointingHandle extends Tool {
  static id = 'pointingHandle';
  private handle: HandleInfo | null = null;

  override onEnter(info?: unknown): void {
    this.handle = (info as HandleInfo) ?? null;
    if (this.handle) this.setCursor(cursorForHandle(this.handle));
  }

  override onPointerMove(): void {
    if (this.inputs.isDragging && this.handle) {
      if (this.handle.type === 'resize') this.parent?.transition('resizing', this.handle);
      else if (this.handle.type === 'rotate') this.parent?.transition('rotating', this.handle);
      else this.parent?.transition('draggingWallPoint', this.handle);
    }
  }

  override onPointerUp(): void {
    this.parent?.transition('idle');
  }
}

const MIN_SCALE = 0.02;

class SelectResizing extends Tool {
  static id = 'resizing';
  private anchor: Point = { x: 0, y: 0 };
  private start = { width: 1, height: 1 };
  private snapshots: TransformSnapshot[] = [];
  private changed = false;
  private committed = false;

  override onEnter(info?: unknown): void {
    const handle = info as { type: 'resize'; corner: HandleCorner };
    const aabb = this.canvas.handles.getAABB();
    if (!aabb) {
      this.parent?.transition('idle');
      return;
    }
    this.start = { width: Math.max(1, aabb.maxX - aabb.minX), height: Math.max(1, aabb.maxY - aabb.minY) };
    this.anchor = {
      x: handle.corner === 'tl' || handle.corner === 'bl' ? aabb.maxX : aabb.minX,
      y: handle.corner === 'tl' || handle.corner === 'tr' ? aabb.maxY : aabb.minY,
    };
    this.snapshots = takeSnapshots(this.canvas.selected.filter((obj) => obj.objectType !== 'wall'));
    this.changed = false;
    this.committed = false;
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const point = this.inputs.getCurrentWorldPoint();
    let fx = (point.x - this.anchor.x) / this.start.width;
    let fy = (point.y - this.anchor.y) / this.start.height;
    fx = Math.max(MIN_SCALE, fx);
    fy = Math.max(MIN_SCALE, fy);
    if (info.shiftKey) {
      const s = Math.max(fx, fy);
      fx = s;
      fy = s;
    }

    for (const snap of this.snapshots) {
      const minX = this.anchor.x + (snap.aabb.minX - this.anchor.x) * fx;
      const minY = this.anchor.y + (snap.aabb.minY - this.anchor.y) * fy;
      const width = snap.aabb.width * fx;
      const height = snap.aabb.height * fy;
      if (snap.obj.objectType === 'token') {
        const cx = this.anchor.x + (snap.aabb.minX + snap.aabb.width / 2 - this.anchor.x) * fx;
        const cy = this.anchor.y + (snap.aabb.minY + snap.aabb.height / 2 - this.anchor.y) * fy;
        const diameter = snap.aabb.width * ((fx + fy) / 2);
        snap.obj.update({ x: cx, y: cy, size: diameter / this.canvas.grid.size });
      } else {
        snap.obj.update({ x: minX, y: minY, width, height });
      }
      this.canvas.reindex(snap.obj);
      this.changed = true;
    }
    this.canvas.handles.refresh();
  }

  override onPointerUp(): void {
    this.committed = true;
    if (this.changed) {
      this.canvas.history.beginBatch();
      for (const snap of this.snapshots) {
        const after = transformFields(snap.obj);
        delete after.rotation;
        this.canvas.commitTransform(snap.obj, after, pickResizeBefore(snap.before));
      }
      this.canvas.history.endBatch();
    }
    this.parent?.transition('idle');
  }

  override onExit(): void {
    if (this.changed && !this.committed) this.restoreSnapshots();
  }

  protected override onEscape(): void {
    this.restoreSnapshots();
    this.parent?.transition('idle');
  }

  private restoreSnapshots(): void {
    for (const snap of this.snapshots) {
      snap.obj.update({ ...snap.before });
      this.canvas.reindex(snap.obj);
    }
    this.canvas.handles.refresh();
    this.canvas.fog.compose();
  }
}

function pickResizeBefore(before: Record<string, unknown>): Record<string, unknown> {
  const out = { ...before };
  delete out.rotation;
  return out;
}

class SelectRotating extends Tool {
  static id = 'rotating';
  private center: Point = { x: 0, y: 0 };
  private startAngle = 0;
  private snapshots: TransformSnapshot[] = [];
  private changed = false;
  private committed = false;

  override onEnter(): void {
    const aabb = this.canvas.handles.getAABB();
    if (!aabb) {
      this.parent?.transition('idle');
      return;
    }
    this.center = { x: (aabb.minX + aabb.maxX) / 2, y: (aabb.minY + aabb.maxY) / 2 };
    const point = this.inputs.getCurrentWorldPoint();
    this.startAngle = Math.atan2(point.y - this.center.y, point.x - this.center.x);
    this.snapshots = takeSnapshots(this.canvas.selected.filter((obj) => obj.objectType !== 'wall'));
    this.changed = false;
    this.committed = false;
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const point = this.inputs.getCurrentWorldPoint();
    let angle = Math.atan2(point.y - this.center.y, point.x - this.center.x) - this.startAngle;
    if (info.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const snap of this.snapshots) {
      const dx = snap.x - this.center.x;
      const dy = snap.y - this.center.y;
      snap.obj.update({
        x: this.center.x + dx * cos - dy * sin,
        y: this.center.y + dx * sin + dy * cos,
        rotation: snap.rotation + angle,
      });
      this.canvas.reindex(snap.obj);
      this.changed = true;
    }
    this.canvas.handles.refresh();
  }

  override onPointerUp(): void {
    this.committed = true;
    if (this.changed) {
      this.canvas.history.beginBatch();
      for (const snap of this.snapshots) {
        const after = { x: snap.obj.x, y: snap.obj.y, rotation: snap.obj.rotation };
        const before = { x: snap.before.x, y: snap.before.y, rotation: snap.before.rotation };
        this.canvas.commitTransform(snap.obj, after, before);
      }
      this.canvas.history.endBatch();
    }
    this.parent?.transition('idle');
  }

  override onExit(): void {
    if (this.changed && !this.committed) this.restoreSnapshots();
  }

  protected override onEscape(): void {
    this.restoreSnapshots();
    this.parent?.transition('idle');
  }

  private restoreSnapshots(): void {
    for (const snap of this.snapshots) {
      snap.obj.update({ ...snap.before });
      this.canvas.reindex(snap.obj);
    }
    this.canvas.handles.refresh();
    this.canvas.fog.compose();
  }
}

class SelectDraggingWallPoint extends Tool {
  static id = 'draggingWallPoint';
  private refs: WallPointRef[] = [];
  private before = new Map<string, WallSegmentData[]>();
  private moved = false;
  private committed = false;

  override onEnter(info?: unknown): void {
    const handle = info as { type: 'wall-point'; wallId: string; segmentIndex: number; role: WallPointRef['role'] };
    const dragged: WallPointRef = { ...handle, x: 0, y: 0 };
    const wall = this.canvas.walls.get(handle.wallId);
    const seg = wall?.segments[handle.segmentIndex];
    if (!wall || !seg) {
      this.parent?.transition('idle');
      return;
    }
    dragged.x = handle.role === 'p1' ? seg.x1 : handle.role === 'p2' ? seg.x2 : handle.role === 'cp1' ? (seg.cp1x ?? seg.x1) : (seg.cp2x ?? seg.x2);
    dragged.y = handle.role === 'p1' ? seg.y1 : handle.role === 'p2' ? seg.y2 : handle.role === 'cp1' ? (seg.cp1y ?? seg.y1) : (seg.cp2y ?? seg.y2);
    this.refs = [dragged];
    if (dragged.role === 'p1' || dragged.role === 'p2') {
      this.refs.push(...this.canvas.walls.findCoincidentEndpoints(dragged.x, dragged.y, 1, dragged));
    }
    this.before.clear();
    for (const ref of this.refs) {
      if (this.before.has(ref.wallId)) continue;
      const target = this.canvas.walls.get(ref.wallId);
      if (target) this.before.set(ref.wallId, target.segments.map((s) => ({ ...s })));
    }
    this.moved = false;
    this.committed = false;
    this.setCursor('move');
  }

  override onPointerMove(): void {
    const raw = this.inputs.getCurrentWorldPoint();
    for (const ref of this.refs) {
      const wall = this.canvas.walls.get(ref.wallId);
      if (!wall) continue;
      const point = ref.role === 'p1' || ref.role === 'p2' ? this.snapIntersection(raw) : raw;
      const seg = wall.segments[ref.segmentIndex];
      const cur = ref.role === 'p1' ? { x: seg.x1, y: seg.y1 } : ref.role === 'p2' ? { x: seg.x2, y: seg.y2 } : ref.role === 'cp1' ? { x: seg.cp1x ?? seg.x1, y: seg.cp1y ?? seg.y1 } : { x: seg.cp2x ?? seg.x2, y: seg.cp2y ?? seg.y2 };
      if (cur.x !== point.x || cur.y !== point.y) this.moved = true;
      wall.update({
        segments: wall.segments.map((s, i) => (i === ref.segmentIndex ? withPointAt(s, ref.role, point.x, point.y) : s)),
      });
      this.canvas.reindex(wall);
    }
    this.canvas.handles.refresh();
    this.canvas.fog.compose();
    this.canvas.lighting.compose();
  }

  override onPointerUp(): void {
    this.committed = true;
    if (this.moved) this.canvas.commitWallPoints(this.before);
    this.parent?.transition('idle');
  }

  override onExit(): void {
    if (this.moved && !this.committed) this.restore();
  }

  protected override onEscape(): void {
    this.restore();
    this.parent?.transition('idle');
  }

  private restore(): void {
    for (const [wallId, segments] of this.before) {
      const wall = this.canvas.walls.get(wallId);
      if (!wall) continue;
      wall.update({ segments: segments.map((s) => ({ ...s })) });
      this.canvas.reindex(wall);
    }
    this.canvas.handles.refresh();
    this.canvas.fog.compose();
    this.canvas.lighting.compose();
  }
}

export class SelectTool extends Tool {
  static id = 'select';
  static initial = 'idle';
  static children() {
    return [
      SelectIdle,
      SelectPointingObject,
      SelectDragging,
      SelectPointingCanvas,
      SelectMarquee,
      SelectPointingHandle,
      SelectResizing,
      SelectRotating,
      SelectPointingDoor,
      SelectDraggingWallPoint,
    ];
  }

  override onEnter(): void {
    this.setCursor('default');
  }

  override onKeyDown(info: { key: string; accelKey: boolean }): void {
    if (info.key === 'Delete' || info.key === 'Backspace') {
      this.canvas.deleteSelected();
      return;
    }
    const arrows: Record<string, Point> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const dir = arrows[info.key];
    if (!dir) return;
    const tokens = this.canvas.selected.filter((obj) => obj.objectType === 'token');
    if (tokens.length === 0) return;
    const step = this.canvas.grid.size;
    this.canvas.history.beginBatch();
    for (const obj of tokens) {
      const from = { x: obj.x, y: obj.y };
      const to = { x: obj.x + dir.x * step, y: obj.y + dir.y * step };
      if (this.canvas.isMoveBlocked(from, to)) continue;
      obj.position.set(to.x, to.y);
      obj.refresh();
      this.canvas.reindex(obj);
      this.canvas.commitMove(obj);
    }
    this.canvas.history.endBatch();
    this.canvas.handles.refresh();
    this.canvas.fog.compose();
  }

  override onDoubleClick(info: CanvasPointerInfo): void {
    if (info.target.type === 'object' && info.target.object.objectType === 'wall') {
      const tolerance = 12 / (this.viewport?.scale ?? 1);
      const hit = this.canvas.walls.findSegmentAt(info.point, tolerance);
      if (hit && hit.wall === info.target.object) {
        this.canvas.splitWall(hit.wall, hit.segmentIndex, info.point);
        return;
      }
    }
    if (info.target.type === 'object') this.canvas.select(info.target.object, false);
  }
}
