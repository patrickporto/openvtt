import {
  MENU_ORDER,
  menu,
  menuWhen,
  type CanvasPlugin,
  type ContextMenuItem,
  type PluginContext,
  type PlaceablesLayer,
} from '@openvtt/canvas';
import { Wall } from './placeables/Wall';
import { WallTool } from './tools/WallTool';
import { WallDataSchema, type WallData, type WallDataInput, type WallSegmentData } from './schemas';
import { chainSegments, flattenSegment, pointToCurveDistance, rectPoints, splitSegment } from './geometry';
import {
  findCoincidentEndpoints,
  listWallPoints,
  withPointAt,
  wallPointRoles,
  type WallsLayer,
  type WallPointRef,
  type WallPointRole,
} from './layers/WallsLayer';

export interface WallToolOptions {
  door: boolean;
  mode: 'poly' | 'freehand' | 'quadratic' | 'cubic' | 'ellipse' | 'rectangle';
  tolerance: number;
  segments: number;
  sideSegments: number;
}

const DEFAULTS: WallToolOptions = { door: false, mode: 'poly', tolerance: 8, segments: 16, sideSegments: 1 };

const ICONS = {
  door: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h4A1.5 1.5 0 0 1 12 4.5V21"/><path d="M3 21h18"/><path d="M12 13a5.5 5.5 0 0 1 5.5 5.5"/><circle cx="8.5" cy="12" r=".9" fill="currentColor" stroke="none"/></svg>',
  secret: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 5.2A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a16 16 0 0 1-3.1 4.1M6.4 6.7A15.9 15.9 0 0 0 2 12s3 7 10 7a9.9 9.9 0 0 0 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  split: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.2 7.7 20 19M8.2 16.3 20 5"/></svg>',
  join: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="18.5" r="2.4"/><circle cx="18.5" cy="5.5" r="2.4"/><path d="m7.2 16.8 9.6-9.6"/></svg>',
  enclose: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9 4v2.5M15 4v2.5M9 17.5V20M15 17.5V20M4 9h2.5M4 15h2.5M17.5 9H20M17.5 15H20" opacity=".6"/></svg>',
};

function sameSegments(a: WallSegmentData[], b: WallSegmentData[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const s = a[i];
    const t = b[i];
    if (
      s.curve !== t.curve ||
      s.x1 !== t.x1 ||
      s.y1 !== t.y1 ||
      s.x2 !== t.x2 ||
      s.y2 !== t.y2 ||
      (s.cp1x ?? null) !== (t.cp1x ?? null) ||
      (s.cp1y ?? null) !== (t.cp1y ?? null) ||
      (s.cp2x ?? null) !== (t.cp2x ?? null) ||
      (s.cp2y ?? null) !== (t.cp2y ?? null)
    ) {
      return false;
    }
  }
  return true;
}

export class WallsPlugin implements CanvasPlugin {
  readonly id = 'walls';
  readonly name = 'Walls';
  private ctx!: PluginContext;
  private layer!: WallsLayer;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private dragRefs: WallPointRef[] = [];
  private dragBefore = new Map<string, WallSegmentData[]>();

  install(ctx: PluginContext): void {
    this.ctx = ctx;
    this.layer = ctx.registerDocumentType<WallData, WallDataInput>({
      type: 'wall',
      schema: WallDataSchema,
      placeable: Wall,
      layer: { label: 'Walls', order: 300 },
      sceneKey: 'walls',
      behavior: { movable: false },
    }) as PlaceablesLayer<WallData, Wall, WallDataInput>;

    ctx.registerTool({ tool: WallTool, hotkey: 'w', defaults: { ...DEFAULTS } });

    ctx.bus.tap('movement:segments', 'walls', (payload) => {
      this.pushBlockers(payload.segments, 'movement');
      return payload;
    });

    ctx.bus.tap('sight:segments', 'walls', (payload) => {
      this.pushBlockers(payload.segments, 'sight');
      return payload;
    });

    ctx.bus.tap('scene:setup', 'walls', (payload) => {
      this.sceneWidth = payload.width;
      this.sceneHeight = payload.height;
    });

    ctx.bus.tap('select:pointerdown', 'walls', (payload) => {
      if (payload.handled) return;
      const tolerance = this.doorTolerance();
      if (payload.ctrlKey && payload.button === 2) {
        const door = this.findDoor({ x: payload.x, y: payload.y }, tolerance);
        if (door) {
          this.toggleSecret(door.wall, door.segmentIndex);
          return { ...payload, handled: true };
        }
        return;
      }
      if (payload.button === 0) {
        const door = this.findDoor({ x: payload.x, y: payload.y }, tolerance);
        if (door) {
          this.toggleDoor(door.wall, door.segmentIndex);
          return { ...payload, handled: true };
        }
      }
      return;
    });

    ctx.bus.tap('contextmenu:before', 'walls', (payload) => {
      if (ctx.canvas.getCurrentToolId() === 'wall') return { ...payload, handled: true };
      return;
    });

    this.registerContextMenuItems(ctx);

    ctx.bus.tap('select:hovercursor', 'walls', (payload) => {
      if (payload.cursor) return;
      if (this.findDoor({ x: payload.x, y: payload.y }, this.doorTolerance())) {
        return { ...payload, cursor: 'pointer' };
      }
      return;
    });

    ctx.bus.tap('select:doubleclick', 'walls', (payload) => {
      const hit = this.findSegmentAt({ x: payload.x, y: payload.y }, 6);
      if (!hit) return;
      void this.splitWall(hit.wall, hit.segmentIndex, { x: payload.x, y: payload.y });
      return { ...payload, handled: true };
    });

    ctx.bus.tap('handles:collect', 'walls', (payload) => {
      for (const obj of ctx.canvas.selected) {
        if (obj.objectType !== 'wall') continue;
        const wall = obj as Wall;
        wall.segments.forEach((seg, segmentIndex) => {
          for (const role of wallPointRoles(seg)) {
            const x = role === 'p1'
              ? seg.x1
              : role === 'p2'
                ? seg.x2
                : role === 'cp1'
                  ? (seg.cp1x ?? seg.x1)
                  : (seg.cp2x ?? seg.x2);
            const y = role === 'p1'
              ? seg.y1
              : role === 'p2'
                ? seg.y2
                : role === 'cp1'
                  ? (seg.cp1y ?? seg.y1)
                  : (seg.cp2y ?? seg.y2);
            payload.handles.push({
              type: 'wall-point',
              x,
              y,
              cursor: 'move',
              shape: role === 'p1' || role === 'p2' ? 'circle' : 'square',
              data: { wallId: wall.id, segmentIndex, role },
            });
          }
        });
      }
      return payload;
    });

    ctx.bus.tap('handle:drag', 'walls', (payload) => {
      if (payload.handle.type !== 'wall-point') return;
      const data = payload.handle.data as { wallId?: unknown; segmentIndex?: unknown; role?: unknown } | undefined;
      if (!data || typeof data.wallId !== 'string' || typeof data.segmentIndex !== 'number' || typeof data.role !== 'string') return;
      if (payload.phase === 'start') {
        this.beginPointDrag(data.wallId, data.segmentIndex, data.role as WallPointRole, payload.x, payload.y);
      } else if (payload.phase === 'move') {
        this.movePointDrag(payload.x, payload.y);
      } else {
        this.endPointDrag();
      }
      return { ...payload, handled: true };
    });
  }

  private registerContextMenuItems(ctx: PluginContext): void {
    ctx.registerContextMenu({
      id: 'walls:context',
      when: menuWhen.selection('wall'),
      items: (menuCtx) => {
        const items: ContextMenuItem[] = [];
        const door = this.findDoor({ x: menuCtx.x, y: menuCtx.y }, this.doorTolerance() * 2);
        if (door) {
          const isOpen = door.wall.segments[door.segmentIndex]?.doorOpen ?? false;
          items.push(
            menu.action('walls:door-toggle', isOpen ? 'Close door' : 'Open door', {
              icon: ICONS.door,
              order: MENU_ORDER.state,
              onClick: () => this.toggleDoor(door.wall, door.segmentIndex),
            }),
            menu.action('walls:door-secret', 'Toggle secret door', {
              icon: ICONS.secret,
              order: MENU_ORDER.state,
              onClick: () => this.toggleSecret(door.wall, door.segmentIndex),
            }),
          );
        }
        const hit = this.segmentAt({ x: menuCtx.x, y: menuCtx.y }, 6);
        if (hit) {
          items.push(
            menu.action('walls:split', 'Split wall here', {
              icon: ICONS.split,
              order: MENU_ORDER.edit,
              onClick: () => void this.splitWall(hit.wall, hit.segmentIndex, { x: menuCtx.x, y: menuCtx.y }),
            }),
          );
        }
        return items;
      },
    });

    ctx.registerContextMenu({
      id: 'walls:scene',
      when: menuWhen.canvas(),
      items: () => {
        const hasOpenDoors = this.layer.placeables.some((wall) =>
          wall.segments.some((seg) => (seg.door ?? false) && (seg.doorOpen ?? false)),
        );
        return [
          menu.action('walls:close-doors', 'Close all doors', {
            icon: ICONS.door,
            order: MENU_ORDER.canvas,
            disabled: !hasOpenDoors,
            onClick: () => this.closeAllDoors(),
          }),
          menu.action('walls:join', 'Join endpoints', {
            icon: ICONS.join,
            order: MENU_ORDER.canvas,
            onClick: () => this.joinWallEndpoints(8),
          }),
          menu.action('walls:enclose', 'Enclose scene', {
            icon: ICONS.enclose,
            order: MENU_ORDER.canvas,
            onClick: () => this.encloseScene(),
          }),
        ];
      },
    });
  }

  findDoor(point: { x: number; y: number }, tolerance: number): { wall: Wall; segmentIndex: number } | null {
    if (!this.ctx.canvas.layers.isInteractive(this.layer)) return null;
    let best: { wall: Wall; segmentIndex: number; distance: number } | null = null;
    for (const wall of this.layer.placeables) {
      for (let segmentIndex = 0; segmentIndex < wall.segments.length; segmentIndex++) {
        const seg = wall.segments[segmentIndex];
        if (!(seg.door ?? false)) continue;
        const hit = pointToCurveDistance(point, seg);
        if (hit.distance <= tolerance && (best === null || hit.distance < best.distance)) {
          best = { wall, segmentIndex, distance: hit.distance };
        }
      }
    }
    return best === null ? null : { wall: best.wall, segmentIndex: best.segmentIndex };
  }

  segmentAt(point: { x: number; y: number }, tolerance: number): { wall: Wall; segmentIndex: number } | null {
    return this.findSegmentAt(point, tolerance);
  }

  toggleDoor(wall: Wall, segmentIndex: number): void {
    const seg = wall.segments[segmentIndex];
    if (!seg || !(seg.door ?? false)) return;
    const segments = wall.segments.map((s, i) => (i === segmentIndex ? { ...s, doorOpen: !(s.doorOpen ?? false) } : s));
    this.layer.update(wall.id, { segments });
    this.ctx.bus.call('scene:refresh', {});
  }

  toggleSecret(wall: Wall, segmentIndex: number): void {
    const seg = wall.segments[segmentIndex];
    if (!seg || !(seg.door ?? false)) return;
    const segments = wall.segments.map((s, i) => (i === segmentIndex ? { ...s, secret: !(s.secret ?? false) } : s));
    this.layer.update(wall.id, { segments });
  }

  closeAllDoors(): void {
    const targets: { wall: Wall; segments: WallSegmentData[] }[] = [];
    for (const wall of this.layer.placeables) {
      if (!wall.segments.some((s) => (s.door ?? false) && (s.doorOpen ?? false))) continue;
      targets.push({
        wall,
        segments: wall.segments.map((s) => ((s.door ?? false) && (s.doorOpen ?? false) ? { ...s, doorOpen: false } : { ...s })),
      });
    }
    if (targets.length === 0) return;
    this.ctx.canvas.history.beginBatch();
    for (const target of targets) this.layer.update(target.wall.id, { segments: target.segments });
    this.ctx.canvas.history.endBatch();
    this.ctx.bus.call('scene:refresh', {});
  }

  async splitWall(wall: Wall, segmentIndex: number, point: { x: number; y: number }): Promise<void> {
    const seg = wall.segments[segmentIndex];
    if (!seg) return;
    const { t } = pointToCurveDistance(point, seg);
    if (t <= 0.01 || t >= 0.99) return;
    const [head, tail] = splitSegment(seg, t);
    const { id: _id, ...shared } = wall.document;
    const headSegments = [...wall.segments.slice(0, segmentIndex), head];
    const tailSegments = [tail, ...wall.segments.slice(segmentIndex + 1)];
    this.ctx.canvas.history.beginBatch();
    this.layer.delete(wall.id);
    await this.layer.create({ ...shared, segments: headSegments });
    await this.layer.create({ ...shared, segments: tailSegments });
    this.ctx.canvas.history.endBatch();
  }

  joinWallEndpoints(tolerance = 8): number {
    const endpoints = listWallPoints(this.layer).filter((r) => r.role === 'p1' || r.role === 'p2');
    const byWall = new Map<string, Map<number, { p1?: { x: number; y: number }; p2?: { x: number; y: number } }>>();
    const merged = new Set<string>();
    let joined = 0;
    const keyOf = (ref: WallPointRef) => `${ref.wallId}:${ref.segmentIndex}:${ref.role}`;
    for (const anchor of endpoints) {
      if (merged.has(keyOf(anchor))) continue;
      const cluster = [anchor];
      for (const other of endpoints) {
        if (other === anchor || merged.has(keyOf(other))) continue;
        if (Math.hypot(anchor.x - other.x, anchor.y - other.y) > tolerance) continue;
        cluster.push(other);
      }
      if (cluster.length < 2) continue;
      const target = {
        x: cluster.reduce((sum, r) => sum + r.x, 0) / cluster.length,
        y: cluster.reduce((sum, r) => sum + r.y, 0) / cluster.length,
      };
      for (const ref of cluster) {
        merged.add(keyOf(ref));
        let segments = byWall.get(ref.wallId);
        if (!segments) {
          segments = new Map();
          byWall.set(ref.wallId, segments);
        }
        const edit = segments.get(ref.segmentIndex) ?? {};
        if (ref.role === 'p1') edit.p1 = target;
        if (ref.role === 'p2') edit.p2 = target;
        segments.set(ref.segmentIndex, edit);
      }
      joined += cluster.length - 1;
    }
    if (byWall.size === 0) return 0;
    this.ctx.canvas.history.beginBatch();
    for (const [wallId, segments] of byWall) {
      const wall = this.layer.get(wallId);
      if (!wall) continue;
      const next = wall.segments.map((seg, index) => {
        const edit = segments.get(index);
        if (!edit) return seg;
        let out = seg;
        if (edit.p1) out = withPointAt(out, 'p1', edit.p1.x, edit.p1.y);
        if (edit.p2) out = withPointAt(out, 'p2', edit.p2.x, edit.p2.y);
        return out;
      });
      this.layer.update(wallId, { segments: next });
    }
    this.ctx.canvas.history.endBatch();
    this.ctx.bus.call('scene:refresh', {});
    return joined;
  }

  encloseScene(): void {
    if (this.sceneWidth <= 0 || this.sceneHeight <= 0) return;
    const points = rectPoints(0, 0, this.sceneWidth, this.sceneHeight, 1);
    void this.layer.create({ segments: chainSegments(points) });
  }

  commitWallPoints(before: Map<string, WallSegmentData[]>): void {
    this.ctx.canvas.history.beginBatch();
    for (const [wallId, segments] of before) {
      const wall = this.layer.get(wallId);
      if (!wall || sameSegments(segments, wall.segments)) continue;
      this.layer.update(wallId, { segments }, { before: { segments } });
    }
    this.ctx.canvas.history.endBatch();
    this.ctx.bus.call('scene:refresh', {});
  }

  private pushBlockers(segments: { a: { x: number; y: number }; b: { x: number; y: number } }[], flag: 'movement' | 'sight'): void {
    for (const wall of this.layer.placeables) {
      for (const seg of wall.segments) {
        if (seg[flag] === false) continue;
        if ((seg.door ?? false) && (seg.doorOpen ?? false)) continue;
        const curve = seg.curve ?? 'linear';
        if (curve === 'linear') {
          segments.push({ a: { x: seg.x1, y: seg.y1 }, b: { x: seg.x2, y: seg.y2 } });
        } else {
          const points = flattenSegment({ ...seg, curve }, 12);
          for (let i = 1; i < points.length; i++) {
            segments.push({ a: { x: points[i - 1].x, y: points[i - 1].y }, b: { x: points[i].x, y: points[i].y } });
          }
        }
      }
    }
  }

  private doorTolerance(): number {
    return 12 / (this.ctx.canvas.viewport?.scale ?? 1);
  }

  private findSegmentAt(point: { x: number; y: number }, tolerance: number): { wall: Wall; segmentIndex: number } | null {
    if (!this.ctx.canvas.layers.isInteractive(this.layer)) return null;
    let best: { wall: Wall; segmentIndex: number; distance: number } | null = null;
    for (const wall of this.layer.placeables) {
      for (let segmentIndex = 0; segmentIndex < wall.segments.length; segmentIndex++) {
        const hit = pointToCurveDistance(point, wall.segments[segmentIndex]);
        if (hit.distance <= tolerance && (best === null || hit.distance < best.distance)) {
          best = { wall, segmentIndex, distance: hit.distance };
        }
      }
    }
    return best === null ? null : { wall: best.wall, segmentIndex: best.segmentIndex };
  }

  private beginPointDrag(wallId: string, segmentIndex: number, role: WallPointRole, x: number, y: number): void {
    const ref: WallPointRef = { wallId, segmentIndex, role, x, y };
    this.dragRefs = [ref];
    if (role === 'p1' || role === 'p2') {
      this.dragRefs.push(...findCoincidentEndpoints(this.layer, x, y, 1, ref));
    }
    this.dragBefore = new Map();
    for (const r of this.dragRefs) {
      if (this.dragBefore.has(r.wallId)) continue;
      const wall = this.layer.get(r.wallId);
      if (wall) this.dragBefore.set(r.wallId, wall.segments.map((s) => ({ ...s })));
    }
  }

  private movePointDrag(x: number, y: number): void {
    for (const ref of this.dragRefs) {
      const wall = this.layer.get(ref.wallId);
      if (!wall) continue;
      if (!wall.segments[ref.segmentIndex]) continue;
      const segments = wall.segments.map((s, i) => (i === ref.segmentIndex ? withPointAt(s, ref.role, x, y) : s));
      wall.update({ segments });
      this.ctx.canvas.documents.layer('wall')?.reindex(wall);
    }
    this.ctx.canvas.handles?.refresh();
  }

  private endPointDrag(): void {
    this.commitWallPoints(this.dragBefore);
    this.dragRefs = [];
    this.dragBefore = new Map();
  }
}

export const wallsPlugin = new WallsPlugin();
