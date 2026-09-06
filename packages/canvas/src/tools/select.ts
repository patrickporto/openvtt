import { Tool } from './Tool';
import type { Ticker } from 'pixi.js';
import { easeTowards } from '../utils';
import type { PlaceableObject } from '../placeables/PlaceableObject';
import type { CanvasPointerInfo, Point } from '../input/types';
import type { HandleCorner, HandleEntry, HandleInfo } from '../handles/HandlesLayer';
import type { DocumentTypeDefinition, EasedDragOptions } from '../plugins/types';

function cursorForHandle(entry: HandleEntry): string {
  if (entry.cursor) return entry.cursor;
  const info = entry.info;
  if (info.type === 'rotate') return 'crosshair';
  if (info.type === 'resize' && 'corner' in info) {
    return info.corner === 'tl' || info.corner === 'br' ? 'nwse-resize' : 'nesw-resize';
  }
  return 'move';
}

function defOf(canvas: Tool['canvas'], obj: PlaceableObject): DocumentTypeDefinition | undefined {
  return canvas.documents.definition(obj.objectType);
}

function isMovable(canvas: Tool['canvas'], obj: PlaceableObject): boolean {
  if (obj.isLocked) return false;
  return defOf(canvas, obj)?.behavior?.movable !== false;
}

function easedDragOf(canvas: Tool['canvas'], obj: PlaceableObject): EasedDragOptions | null {
  const flag = defOf(canvas, obj)?.behavior?.easedDrag;
  if (flag === undefined || flag === false) return null;
  return flag === true ? {} : flag;
}

/** Campos de documento que cada tipo transformável expõe para resize/rotação. */
function transformFields(canvas: Tool['canvas'], obj: PlaceableObject): Record<string, unknown> {
  const adapter = defOf(canvas, obj)?.transform;
  if (adapter) return adapter.snapshotFields(obj);
  const doc = obj.document as Record<string, unknown>;
  return { x: obj.x, y: obj.y, rotation: doc.rotation ?? 0 };
}

interface TransformSnapshot {
  obj: PlaceableObject;
  aabb: { minX: number; minY: number; width: number; height: number };
  x: number;
  y: number;
  rotation: number;
  before: Record<string, unknown>;
}

function takeSnapshots(canvas: Tool['canvas'], objects: PlaceableObject[]): TransformSnapshot[] {
  return objects.map((obj) => {
    const b = obj.getAABB();
    return {
      obj,
      aabb: { minX: b.minX, minY: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY },
      x: obj.x,
      y: obj.y,
      rotation: obj.rotation,
      before: transformFields(canvas, obj),
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
    const hover = this.canvas.bus.call('select:hovercursor', { x: point.x, y: point.y, cursor: null });
    this.setCursor(hover.cursor ?? 'default');
  }

  override onPointerDown(info: CanvasPointerInfo): void {
    const intercepted = this.canvas.bus.call('select:pointerdown', {
      x: info.point.x,
      y: info.point.y,
      button: info.button,
      shiftKey: info.shiftKey,
      ctrlKey: info.ctrlKey,
      handled: false,
    });
    if (intercepted.handled || info.button === 2) return;

    const handle = this.canvas.handles.pickHandle(info.point);
    if (handle) {
      this.parent?.transition('pointingHandle', handle);
      return;
    }
    if (info.target.type === 'object') {
      this.parent?.transition('pointingObject', info);
    } else {
      this.parent?.transition('pointingCanvas', info);
    }
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
    if (this.inputs.isDragging && this.object && isMovable(this.canvas, this.object)) {
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
  private easeTargets = new Map<string, Point>();
  private easeFn: ((ticker: Ticker) => void) | null = null;
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
    this.easeTargets.clear();
    for (const obj of this.canvas.selected) {
      if (!isMovable(this.canvas, obj)) continue;
      this.startPositions.set(obj.id, { x: obj.x, y: obj.y });
    }
    const primaryStart = this.primary ? this.startPositions.get(this.primary.id) : undefined;
    const wantsRuler = this.primary ? defOf(this.canvas, this.primary)?.behavior?.rulerOnDrag === true : false;
    this.measureFrom = wantsRuler && primaryStart ? { ...primaryStart } : null;
    this.setCursor('grabbing');
  }

  override onPointerMove(): void {
    const current = this.inputs.getCurrentWorldPoint();
    const dx = current.x - this.startWorld.x;
    const dy = current.y - this.startWorld.y;
    if (dx !== 0 || dy !== 0) this.moved = true;

    const primaryStart = this.primary ? this.startPositions.get(this.primary.id) : undefined;
    let snapDelta: Point = { x: dx, y: dy };
    if (this.primary && primaryStart && defOf(this.canvas, this.primary)?.behavior?.snapToGrid) {
      const snapped = this.snap({ x: primaryStart.x + dx, y: primaryStart.y + dy });
      snapDelta = { x: snapped.x - primaryStart.x, y: snapped.y - primaryStart.y };
    }

    let anyEased = false;
    for (const obj of this.canvas.selected) {
      const start = this.startPositions.get(obj.id);
      if (!start) continue;
      const nx = start.x + snapDelta.x;
      const ny = start.y + snapDelta.y;
      if (defOf(this.canvas, obj)?.behavior?.collides && this.canvas.isMoveBlocked({ x: obj.x, y: obj.y }, { x: nx, y: ny })) {
        continue;
      }
      if (easedDragOf(this.canvas, obj)) {
        this.easeTargets.set(obj.id, { x: nx, y: ny });
        anyEased = true;
        continue;
      }
      obj.position.set(nx, ny);
      obj.refresh();
      this.canvas.reindex(obj);
    }
    if (anyEased) this.startEaseTicker();
    if (this.measureFrom && this.primary) {
      const units = Math.hypot(this.primary.x - this.measureFrom.x, this.primary.y - this.measureFrom.y) / this.canvas.grid.size;
      this.preview.clear();
      this.preview.ruler(this.measureFrom.x, this.measureFrom.y, this.primary.x, this.primary.y, `${units.toFixed(1)} u`);
    }
    this.canvas.handles.refresh();
    this.canvas.bus.call('scene:refresh', {});
  }

  private startEaseTicker(): void {
    if (this.easeFn) return;
    this.easeFn = (ticker: Ticker) => this.stepEase(ticker.deltaMS);
    this.canvas.app.ticker.add(this.easeFn);
  }

  private stepEase(dtMs: number): void {
    for (const obj of this.canvas.selected) {
      const target = this.easeTargets.get(obj.id);
      if (!target) continue;
      const ease = easedDragOf(this.canvas, obj);
      if (!ease) continue;
      const next = easeTowards({ x: obj.x, y: obj.y }, target, dtMs, ease.duration ?? 150);
      obj.position.set(next.x, next.y);
      obj.refresh();
      this.canvas.reindex(obj);
    }
    this.canvas.handles.refresh();
  }

  private stopEase(finalize: boolean): void {
    if (this.easeFn) {
      this.canvas.app.ticker.remove(this.easeFn);
      this.easeFn = null;
    }
    if (finalize) {
      for (const obj of this.canvas.selected) {
        const target = this.easeTargets.get(obj.id);
        if (!target) continue;
        obj.position.set(target.x, target.y);
        obj.refresh();
        this.canvas.reindex(obj);
      }
    }
    this.easeTargets.clear();
  }

  override onPointerUp(): void {
    this.preview.clear();
    this.committed = true;
    this.stopEase(true);
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
    this.stopEase(false);
    if (this.moved && !this.committed) this.restorePositions();
  }

  protected override onEscape(): void {
    this.stopEase(false);
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
    this.canvas.bus.call('scene:refresh', {});
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
  private handle: HandleEntry | null = null;

  override onEnter(info?: unknown): void {
    this.handle = (info as HandleEntry) ?? null;
    if (this.handle) this.setCursor(cursorForHandle(this.handle));
  }

  override onPointerMove(): void {
    if (this.inputs.isDragging && this.handle) {
      if (this.handle.info.type === 'resize') this.parent?.transition('resizing', this.handle);
      else if (this.handle.info.type === 'rotate') this.parent?.transition('rotating', this.handle);
      else this.parent?.transition('draggingCustomHandle', this.handle);
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
    const handle = info as HandleEntry;
    const corner = 'corner' in handle.info ? (handle.info.corner as HandleCorner) : undefined;
    const aabb = this.canvas.handles.getAABB();
    if (!corner || !aabb) {
      this.parent?.transition('idle');
      return;
    }
    this.start = { width: Math.max(1, aabb.maxX - aabb.minX), height: Math.max(1, aabb.maxY - aabb.minY) };
    this.anchor = {
      x: corner === 'tl' || corner === 'bl' ? aabb.maxX : aabb.minX,
      y: corner === 'tl' || corner === 'tr' ? aabb.maxY : aabb.minY,
    };
    this.snapshots = takeSnapshots(
      this.canvas,
      this.canvas.selected.filter((obj) => !obj.isLocked && defOf(this.canvas, obj)?.transform !== undefined),
    );
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
      const rect = {
        x: this.anchor.x + (snap.aabb.minX - this.anchor.x) * fx,
        y: this.anchor.y + (snap.aabb.minY - this.anchor.y) * fy,
        width: snap.aabb.width * fx,
        height: snap.aabb.height * fy,
      };
      const changes = defOf(this.canvas, snap.obj)?.transform?.applyResize(snap.obj, rect);
      if (!changes) continue;
      snap.obj.update(changes);
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
        const after = transformFields(this.canvas, snap.obj);
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
    this.canvas.bus.call('scene:refresh', {});
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
    this.snapshots = takeSnapshots(
      this.canvas,
      this.canvas.selected.filter((obj) => isMovable(this.canvas, obj)),
    );
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
    this.canvas.bus.call('scene:refresh', {});
  }
}

/**
 * Drag de handle customizado (contribuído por plugins via `handles:collect`).
 * Delega o gesto ao plugin dono pelo hook `handle:drag` (fases start/move/end).
 */
class SelectDraggingCustomHandle extends Tool {
  static id = 'draggingCustomHandle';
  private handle: HandleInfo | null = null;

  override onEnter(info?: unknown): void {
    this.handle = (info as HandleEntry)?.info ?? null;
    if (!this.handle) {
      this.parent?.transition('idle');
      return;
    }
    const point = this.inputs.getCurrentWorldPoint();
    this.drag(point, 'start', false);
  }

  override onPointerMove(info: CanvasPointerInfo): void {
    const point = this.inputs.getCurrentWorldPoint();
    this.drag(point, 'move', info.shiftKey);
  }

  override onPointerUp(): void {
    const point = this.inputs.getCurrentWorldPoint();
    this.drag(point, 'end', false);
    this.canvas.handles.refresh();
    this.canvas.bus.call('scene:refresh', {});
    this.parent?.transition('idle');
  }

  private drag(point: Point, phase: 'start' | 'move' | 'end', shiftKey: boolean): void {
    if (!this.handle) return;
    this.canvas.bus.call('handle:drag', {
      handle: { type: this.handle.type, data: (this.handle as { data?: Record<string, unknown> }).data },
      x: point.x,
      y: point.y,
      phase,
      shiftKey,
      handled: false,
    });
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
      SelectDraggingCustomHandle,
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
    const movable = this.canvas.selected.filter(
      (obj) => isMovable(this.canvas, obj) && defOf(this.canvas, obj)?.behavior?.snapToGrid,
    );
    if (movable.length === 0) return;
    const step = this.canvas.grid.size;
    this.canvas.history.beginBatch();
    for (const obj of movable) {
      const from = { x: obj.x, y: obj.y };
      const to = { x: obj.x + dir.x * step, y: obj.y + dir.y * step };
      if (defOf(this.canvas, obj)?.behavior?.collides && this.canvas.isMoveBlocked(from, to)) continue;
      obj.position.set(to.x, to.y);
      obj.refresh();
      this.canvas.reindex(obj);
      this.canvas.commitMove(obj);
    }
    this.canvas.history.endBatch();
    this.canvas.handles.refresh();
    this.canvas.bus.call('scene:refresh', {});
  }

  override onDoubleClick(info: CanvasPointerInfo): void {
    const result = this.canvas.bus.call('select:doubleclick', {
      x: info.point.x,
      y: info.point.y,
      handled: false,
    });
    if (result.handled) return;
    if (info.target.type === 'object') this.canvas.select(info.target.object, false);
  }
}
