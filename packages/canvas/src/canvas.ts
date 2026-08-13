import { Application, BlurFilter, Container, Graphics } from 'pixi.js';
import { type EventMeta, type EventPayload } from '@openvtt/events';
import { CONFIG, type GridConfig } from './config';
import { createCanvasBus, type CanvasBus, type CanvasEventMap } from './bus';
import { CanvasViewport } from './viewport';
import { CanvasAnimation, Easing } from './animation';
import { InputsManager } from './input/InputsManager';
import type { CanvasPointerInfo, Point } from './input/types';
import { ToolManager } from './tools/ToolManager';
import type { ToolOptions } from './tools/Tool';
import type { StateEventName } from './state/StateNode';
import { PreviewLayer } from './preview/PreviewLayer';
import { HandlesLayer } from './handles/HandlesLayer';
import { HistoryManager } from './history/HistoryManager';
import { FogOfWarLayer } from './fog/FogOfWarLayer';
import { LightingFxLayer } from './lighting/LightingFxLayer';
import { LayerManager } from './layers/LayerManager';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { GridLayer } from './layers/GridLayer';
import { TileLayer } from './layers/TileLayer';
import { DrawingsLayer } from './layers/DrawingsLayer';
import { WallsLayer } from './layers/WallsLayer';
import { TokenLayer } from './layers/TokenLayer';
import { LightsLayer } from './layers/LightsLayer';
import { TemplatesLayer } from './layers/TemplatesLayer';
import type { PlaceablesLayer } from './layers/PlaceablesLayer';
import type { PlaceableObject, CanvasLike } from './placeables/PlaceableObject';
import type { Wall } from './placeables/Wall';
import { parseScene, type SceneData, type SceneDataInput, type WallDataInput, type WallSegmentData } from './schemas';
import { segmentsIntersect, toHex } from './utils';
import { chainSegments, ellipsePoints, flattenSegment, pointToCurveDistance, rectPoints, splitSegment } from './geometry';
import { withPointAt, type WallPointRef } from './layers/WallsLayer';

export interface CanvasOptions {
  background?: number | string;
  minScale?: number;
  maxScale?: number;
  resolution?: number;
  antialias?: boolean;
  tools?: Partial<ToolOptions>;
}

type AnyPlaceablesLayer = PlaceablesLayer<any, PlaceableObject<any>, any>;

export class Canvas implements CanvasLike {
  static instance: Canvas | null = null;

  readonly app: Application;
  readonly bus: CanvasBus;
  readonly animation: CanvasAnimation;
  readonly stage: Container;

  viewport: CanvasViewport | null = null;
  inputs!: InputsManager;
  tools!: ToolManager;

  background: BackgroundLayer;
  grid: GridLayer;
  tiles: TileLayer;
  drawings: DrawingsLayer;
  walls: WallsLayer;
  tokens: TokenLayer;
  lights: LightsLayer;
  templates: TemplatesLayer;
  preview: PreviewLayer;
  handles: HandlesLayer;
  fog: FogOfWarLayer;
  lighting: LightingFxLayer;
  layers: LayerManager;
  history!: HistoryManager;

  private readonly container: HTMLElement;
  private readonly options: CanvasOptions;
  private readonly _selection = new Set<string>();
  private scene: SceneData | null = null;
  private _interactionDisabled = false;
  private _blurred = false;
  private _resizeObserver?: ResizeObserver;
  private initialized = false;
  private blurFilter: BlurFilter | null = null;
  private lastToolId = 'select';

  constructor(container: HTMLElement, options: CanvasOptions = {}) {
    this.container = container;
    this.options = options;
    this.app = new Application();
    this.bus = createCanvasBus();
    this.stage = new Container();
    this.stage.label = 'openvtt-canvas';
    this.background = new BackgroundLayer({
      name: 'background',
      zIndex: -1000,
      backgroundColor: options.background ?? CONFIG.background,
    });
    this.grid = new GridLayer({ name: 'grid', zIndex: 1000, grid: this.defaultGrid() });
    this.tiles = new TileLayer(this);
    this.drawings = new DrawingsLayer(this);
    this.walls = new WallsLayer(this);
    this.tokens = new TokenLayer(this);
    this.lights = new LightsLayer(this);
    this.templates = new TemplatesLayer(this);
    this.preview = new PreviewLayer({ name: 'preview', zIndex: 5000 }, this);
    this.handles = new HandlesLayer(this);
    this.fog = new FogOfWarLayer(this);
    this.lighting = new LightingFxLayer(this);
    this.layers = new LayerManager(this);
    this.animation = new CanvasAnimation(this.app.ticker);
    Canvas.instance = this;
  }

  private defaultGrid(): GridConfig {
    return {
      type: 'square',
      size: 50,
      color: CONFIG.grid.color,
      alpha: CONFIG.grid.alpha,
      lineWidth: CONFIG.grid.lineWidth,
    };
  }

  get selection(): Set<string> {
    return this._selection;
  }

  get interactionDisabled(): boolean {
    return this._interactionDisabled;
  }

  snapToGrid(x: number, y: number): { x: number; y: number } {
    return this.grid.snapToGrid(x, y);
  }

  snapToIntersection(x: number, y: number): { x: number; y: number } {
    return this.grid.snapToIntersection(x, y);
  }

  select(obj: PlaceableObject<any>, additive: boolean): void {
    if (!additive) this.clearSelection();
    if (this._selection.has(obj.id) && additive) this._selection.delete(obj.id);
    else this._selection.add(obj.id);
    this.refreshSelection();
    if (obj.objectType === 'token') this.bus.emit('token:selected', { ids: [...this._selection] });
  }

  clearSelection(): void {
    this._selection.clear();
    this.refreshSelection();
  }

  refreshSelection(): void {
    for (const layer of [this.tokens, this.tiles, this.drawings, this.walls, this.lights, this.templates]) {
      for (const obj of layer.placeables) obj.refresh();
    }
    this.handles?.refresh();
  }

  get selected(): PlaceableObject[] {
    const result: PlaceableObject[] = [];
    for (const id of this._selection) {
      const obj = this.tokens.get(id)
        ?? this.lights.get(id)
        ?? this.templates.get(id)
        ?? this.tiles.get(id)
        ?? this.drawings.get(id)
        ?? this.walls.get(id);
      if (obj) result.push(obj);
    }
    return result;
  }

  setInteractionDisabled(disabled: boolean): void {
    this._interactionDisabled = disabled;
  }

  setCursor(cursor: string): void {
    this.app.canvas.style.cursor = cursor;
  }

  setCurrentTool(id: string): void {
    if (!this.tools) return;
    this.tools.setCurrentTool(id);
    this.notifyToolChanged();
  }

  getCurrentToolId(): string {
    return this.tools?.getCurrentToolId() ?? 'select';
  }

  undo(): void {
    void this.history?.undo();
  }

  redo(): void {
    void this.history?.redo();
  }

  /* --------------------------- hit-testing --------------------------- */

  private placeableLayers(): AnyPlaceablesLayer[] {
    return [this.tokens, this.lights, this.templates, this.drawings, this.walls, this.tiles] as unknown as AnyPlaceablesLayer[];
  }

  pick(point: Point): PlaceableObject | undefined {
    for (const layer of this.placeableLayers()) {
      if (!this.layers.isInteractive(layer)) continue;
      const obj = layer.pick(point);
      if (obj && obj.isSelectable) return obj;
    }
    return undefined;
  }

  pickRect(rect: { x: number; y: number; width: number; height: number }): PlaceableObject[] {
    const seen = new Set<string>();
    const result: PlaceableObject[] = [];
    for (const layer of this.placeableLayers()) {
      if (!this.layers.isInteractive(layer)) continue;
      for (const obj of layer.pickRect(rect)) {
        if (!seen.has(obj.id) && obj.isSelectable) {
          seen.add(obj.id);
          result.push(obj);
        }
      }
    }
    return result;
  }

  reindex(obj: PlaceableObject): void {
    this.layerForType(obj.objectType)?.reindex(obj);
  }

  private layerForType(type: string): AnyPlaceablesLayer | undefined {
    switch (type) {
      case 'token':
        return this.tokens as unknown as AnyPlaceablesLayer;
      case 'tile':
        return this.tiles as unknown as AnyPlaceablesLayer;
      case 'drawing':
        return this.drawings as unknown as AnyPlaceablesLayer;
      case 'wall':
        return this.walls as unknown as AnyPlaceablesLayer;
      case 'light':
        return this.lights as unknown as AnyPlaceablesLayer;
      case 'template':
        return this.templates as unknown as AnyPlaceablesLayer;
      default:
        return undefined;
    }
  }

  commitMove(obj: PlaceableObject): void {
    this.layerForType(obj.objectType)?.update(obj.id, { x: obj.x, y: obj.y });
    if (obj.objectType === 'token') this.bus.emit('token:moved', { id: obj.id, x: obj.x, y: obj.y });
    this.handles?.refresh();
  }

  /**
   * Commit de resize/rotação: grava no histórico com o snapshot `before`
   * capturado no início do gesto (o doc já foi mutado durante o arraste).
   */
  commitTransform(obj: PlaceableObject, changes: Record<string, unknown>, before: Record<string, unknown>): void {
    this.layerForType(obj.objectType)?.update(obj.id, changes, { before });
    this.handles?.refresh();
  }

  deleteObject(obj: PlaceableObject): boolean {
    this._selection.delete(obj.id);
    const deleted = this.layerForType(obj.objectType)?.delete(obj.id) ?? false;
    this.refreshSelection();
    return deleted;
  }

  deleteSelected(): void {
    for (const obj of this.selected) this.deleteObject(obj);
    this.clearSelection();
  }

  /* --------------------- portas e colisão (estilo Foundry) --------------------- */

  /** Porta (wall + índice do segmento) próxima ao ponto, dentro da tolerância. */
  findDoor(point: Point, tolerance: number): { wall: Wall; segmentIndex: number } | null {
    let best: { wall: Wall; segmentIndex: number; dist: number } | null = null;
    for (const wall of this.walls.placeables) {
      if (!this.layers.isInteractive(this.walls)) continue;
      wall.segments.forEach((seg, index) => {
        if (!seg.door) return;
        const dist = pointToCurveDistance(point, seg).distance;
        if (dist <= tolerance && (!best || dist < best.dist)) best = { wall, segmentIndex: index, dist };
      });
    }
    return best;
  }

  /** Abre/fecha uma porta. Grava no histórico e atualiza fog/iluminação via wall:update. */
  toggleDoor(wall: Wall, segmentIndex: number): void {
    const segments = wall.segments.map((seg, i) =>
      i === segmentIndex ? { ...seg, doorOpen: !(seg.doorOpen ?? false) } : seg,
    );
    this.walls.update(wall.id, { segments });
  }

  /** Marca/desmarca uma porta como secreta (Monk's Wall Enhancement: ctrl+right-click). */
  toggleSecret(wall: Wall, segmentIndex: number): void {
    const segments = wall.segments.map((seg, i) =>
      i === segmentIndex && seg.door ? { ...seg, secret: !(seg.secret ?? false) } : seg,
    );
    this.walls.update(wall.id, { segments });
  }

  /** Fecha todas as portas da cena em uma única entrada de histórico. */
  closeAllDoors(): void {
    this.history.beginBatch();
    for (const wall of this.walls.placeables) {
      if (!wall.segments.some((seg) => seg.door && seg.doorOpen)) continue;
      const segments = wall.segments.map((seg) => (seg.door ? { ...seg, doorOpen: false } : seg));
      this.walls.update(wall.id, { segments });
    }
    this.history.endBatch();
  }

  /** Divide uma wall em duas no ponto mais próximo do clique (De Casteljau para curvas). */
  splitWall(wall: Wall, segmentIndex: number, point: Point): void {
    const seg = wall.segments[segmentIndex];
    if (!seg) return;
    const { t } = pointToCurveDistance(point, seg);
    if (t <= 0.02 || t >= 0.98) return;
    const [first, second] = splitSegment(seg, t);
    const before = wall.segments.slice(0, segmentIndex);
    const after = wall.segments.slice(segmentIndex + 1);
    this._selection.delete(wall.id);
    this.refreshSelection();
    this.history.beginBatch();
    void (async () => {
      try {
        this.walls.delete(wall.id);
        const head = [...before, first];
        const tail = [second, ...after];
        if (head.length > 0) await this.walls.create({ segments: head });
        if (tail.length > 0) await this.walls.create({ segments: tail });
      } finally {
        this.history.endBatch();
      }
    })();
  }

  /**
   * Aproxima junções próximas: agrupa endpoints dentro da tolerância e os move
   * para o centroide do grupo (Monk's Wall Enhancement: Join Points).
   */
  joinWallEndpoints(tolerance = 8): number {
    const selected = new Set(this._selection);
    const refs = this.walls
      .listPoints(selected.size > 0 ? selected : undefined)
      .filter((ref) => ref.role === 'p1' || ref.role === 'p2');
    const parent = refs.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        if (Math.hypot(refs[i].x - refs[j].x, refs[i].y - refs[j].y) <= tolerance) {
          parent[find(i)] = find(j);
        }
      }
    }
    const clusters = new Map<number, WallPointRef[]>();
    refs.forEach((ref, i) => {
      const root = find(i);
      const cluster = clusters.get(root) ?? [];
      cluster.push(ref);
      clusters.set(root, cluster);
    });
    const targets = new Map<string, { x: number; y: number }>();
    let joined = 0;
    for (const cluster of clusters.values()) {
      const distinct = new Set(cluster.map((ref) => `${Math.round(ref.x)},${Math.round(ref.y)}`));
      if (distinct.size < 2) continue;
      const cx = cluster.reduce((sum, ref) => sum + ref.x, 0) / cluster.length;
      const cy = cluster.reduce((sum, ref) => sum + ref.y, 0) / cluster.length;
      for (const ref of cluster) targets.set(`${ref.wallId}:${ref.segmentIndex}:${ref.role}`, { x: cx, y: cy });
      joined += cluster.length;
    }
    if (targets.size === 0) return 0;
    this.history.beginBatch();
    for (const wall of this.walls.placeables) {
      const before = wall.segments.map((seg) => ({ ...seg }));
      let changed = false;
      const segments = wall.segments.map((seg, segmentIndex) => {
        let next = seg;
        for (const role of ['p1', 'p2'] as const) {
          const target = targets.get(`${wall.id}:${segmentIndex}:${role}`);
          if (target) {
            next = withPointAt(next, role, target.x, target.y);
            changed = true;
          }
        }
        return next;
      });
      if (changed) this.walls.update(wall.id, { segments }, { before: { segments: before } });
    }
    this.history.endBatch();
    return joined;
  }

  /** Cria walls ao redor das bordas da cena (Monk's Wall Enhancement: Wall Off Scene). */
  encloseScene(): void {
    if (!this.scene) return;
    const points = rectPoints(0, 0, this.scene.width, this.scene.height, 1);
    void this.walls.create({ segments: chainSegments(points) as WallDataInput['segments'] });
  }

  /** Converte drawings selecionados (rect/ellipse) em walls e remove os drawings. */
  convertDrawingsToWalls(): number {
    const drawings = this.selected.filter((obj) => obj.objectType === 'drawing');
    if (drawings.length === 0) return 0;
    this.history.beginBatch();
    void (async () => {
      try {
        for (const obj of drawings) {
          const doc = obj.document as { type?: string; x?: number; y?: number; width?: number; height?: number };
          const x = doc.x ?? 0;
          const y = doc.y ?? 0;
          const width = doc.width ?? 0;
          const height = doc.height ?? 0;
          let segments: WallDataInput['segments'] = [];
          if (doc.type === 'rect') {
            segments = chainSegments(rectPoints(x, y, width, height, 1)) as WallDataInput['segments'];
          } else if (doc.type === 'ellipse') {
            const points = ellipsePoints(x + width / 2, y + height / 2, width / 2, height / 2, CONFIG.wall.curveSegments);
            segments = chainSegments(points) as WallDataInput['segments'];
          }
          if (segments.length === 0) continue;
          this._selection.delete(obj.id);
          await this.walls.create({ segments });
          this.drawings.delete(obj.id);
        }
        this.refreshSelection();
      } finally {
        this.history.endBatch();
      }
    })();
    return drawings.length;
  }

  /** Aplica novas posições a um conjunto de pontos de wall, com snapshot para undo. */
  commitWallPoints(before: Map<string, WallSegmentData[]>): void {
    this.history.beginBatch();
    for (const [wallId, segmentsBefore] of before) {
      const wall = this.walls.get(wallId);
      if (!wall) continue;
      const after = wall.segments.map((seg) => ({ ...seg }));
      if (JSON.stringify(after) === JSON.stringify(segmentsBefore)) continue;
      this.walls.update(wallId, { segments: after }, { before: { segments: segmentsBefore } });
    }
    this.history.endBatch();
    this.handles?.refresh();
    this.fog.compose();
    this.lighting.compose();
  }

  private movementSegments(): { a: Point; b: Point }[] {
    const segments: { a: Point; b: Point }[] = [];
    for (const wall of this.walls.placeables) {
      for (const seg of wall.segments) {
        if (seg.movement === false) continue;
        if (seg.door && seg.doorOpen) continue;
        if (seg.curve && seg.curve !== 'linear') {
          const points = flattenSegment(seg, 12);
          for (let i = 1; i < points.length; i++) segments.push({ a: points[i - 1], b: points[i] });
        } else {
          segments.push({ a: { x: seg.x1, y: seg.y1 }, b: { x: seg.x2, y: seg.y2 } });
        }
      }
    }
    return segments;
  }

  /** true se o caminho from→to cruza alguma wall que bloqueia movimento. */
  isMoveBlocked(from: Point, to: Point): boolean {
    if (from.x === to.x && from.y === to.y) return false;
    for (const seg of this.movementSegments()) {
      if (segmentsIntersect(from, to, seg.a, seg.b)) return true;
    }
    return false;
  }

  /* ------------------------------- ping ------------------------------- */

  ping(x: number, y: number): void {
    const g = new Graphics();
    g.eventMode = 'none';
    this.preview.addChild(g);
    const color = CONFIG.selection.color;
    this.animation.animate({
      duration: 900,
      ease: Easing.outCubic,
      onUpdate: (_progress, eased) => {
        const radius = 8 + eased * 90;
        g.clear();
        g.circle(x, y, radius).stroke({ color, width: 3, alpha: 0.9 * (1 - eased) });
        g.circle(x, y, 5).fill({ color, alpha: 1 - eased * 0.5 });
      },
      onComplete: () => g.destroy(),
    });
    this.bus.emit('ping', { x, y });
  }

  /* --------------------------- ciclo de vida --------------------------- */

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    await this.app.init({
      background: this.background.backgroundColor,
      width,
      height,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    this.container.appendChild(this.app.canvas);

    this.viewport = new CanvasViewport(this.app, { width, height }, {
      minScale: CONFIG.minScale,
      maxScale: CONFIG.maxScale,
      onMoved: (state) => this.bus.emit('pan', { x: state.x, y: state.y }),
      onZoomed: (state) => this.bus.emit('zoom', { scale: state.scale }),
    });
    this.app.stage.addChild(this.viewport.pixi);
    this.viewport.pixi.addChild(this.stage);
    this.stage.sortableChildren = true;

    for (const layer of [this.background, this.grid, this.tiles, this.drawings, this.walls, this.templates, this.tokens, this.lights, this.lighting, this.fog, this.preview, this.handles]) {
      this.stage.addChild(layer);
    }

    this.layers.register('background', 'Background', this.background);
    this.layers.register('tiles', 'Tiles', this.tiles);
    this.layers.register('drawings', 'Drawings', this.drawings);
    this.layers.register('walls', 'Walls', this.walls);
    this.layers.register('templates', 'Templates', this.templates);
    this.layers.register('tokens', 'Tokens', this.tokens);
    this.layers.register('lights', 'Lights', this.lights);
    this.layers.register('grid', 'Grid', this.grid);
    this.layers.register('lighting', 'Lighting', this.lighting, { visible: false });
    this.layers.register('fog', 'Fog of War', this.fog, { visible: false });
    this.fog.attach();
    this.lighting.attach();

    this._resizeObserver = new ResizeObserver(() => {
      this.viewport?.resize(this.container.clientWidth, this.container.clientHeight);
    });
    this._resizeObserver.observe(this.container);

    this.tools = new ToolManager(this, this.options.tools);
    this.history = new HistoryManager(this);
    this.inputs = new InputsManager({
      element: this.app.canvas,
      toWorld: (p) => this.viewport?.toLocal(p) ?? p,
      toScreen: (p) => this.viewport?.toScreen(p) ?? p,
      pick: (world) => this.pick(world),
      dispatch: (name, info) => this.dispatchInput(name, info),
      isEnabled: () => !this._interactionDisabled,
    });
    this.app.ticker.add(this.tickInputs, this);

    this.initialized = true;
    this.bus.emit('ready', { width, height });
  }

  private tickInputs(): void {
    this.inputs.tick();
  }

  private dispatchInput(name: StateEventName, info?: unknown): void {
    this.tools.handleEvent(name, info);
    this.notifyToolChanged();
    const pointer = info as CanvasPointerInfo | undefined;
    if (!pointer) return;
    if (name === 'pointerdown') {
      this.bus.emit('pointerdown', {
        x: pointer.point.x,
        y: pointer.point.y,
        button: pointer.button,
        shiftKey: pointer.shiftKey,
        ctrlKey: pointer.ctrlKey,
      });
    } else if (name === 'pointermove') {
      this.bus.emit('pointermove', { x: pointer.point.x, y: pointer.point.y });
    } else if (name === 'pointerup') {
      this.bus.emit('pointerup', { x: pointer.point.x, y: pointer.point.y });
    }
  }

  private notifyToolChanged(): void {
    if (!this.tools) return;
    const id = this.tools.getCurrentToolId();
    if (id !== this.lastToolId) {
      this.lastToolId = id;
      this.bus.emit('tool:changed', { id, path: this.tools.path });
      this.handles?.refresh();
    }
  }

  async draw(sceneInput: SceneDataInput): Promise<void> {
    const prepared = this.bus.call('beforeDraw', { scene: sceneInput });
    const scene = parseScene(prepared.scene);
    this.scene = scene;

    if (scene.backgroundColor !== undefined) this.app.renderer.background.color = toHex(scene.backgroundColor);

    await this.tearDown();

    const grid = scene.grid ?? { type: 'square' as const, size: 50 };
    this.grid.setGrid({ ...this.defaultGrid(), ...grid });
    this.grid.setSize(scene.width, scene.height);

    if (scene.background) await this.background.setBackground(scene.background, scene.backgroundColor);

    this.viewport?.setWorld(scene.width, scene.height);
    this.viewport?.fit(scene.width, scene.height);
    this.fog.setup(scene.width, scene.height);
    this.lighting.setup(scene.width, scene.height);

    for (const tile of scene.tiles ?? []) await this.tiles.create(tile);
    for (const drawing of scene.drawings ?? []) await this.drawings.create(drawing);
    for (const wall of scene.walls ?? []) await this.walls.create(wall);
    for (const token of scene.tokens ?? []) await this.tokens.create(token);
    for (const light of scene.lights ?? []) await this.lights.create(light);
    for (const template of scene.templates ?? []) await this.templates.create(template);

    await Promise.all([this.background.draw(), this.grid.draw()]);
  }

  private async tearDown(): Promise<void> {
    await Promise.all([
      this.tokens.tearDown(),
      this.tiles.tearDown(),
      this.drawings.tearDown(),
      this.walls.tearDown(),
      this.lights.tearDown(),
      this.templates.tearDown(),
      this.background.tearDown(),
      this.grid.tearDown(),
    ]);
    this.preview.clear();
    this.handles?.clear();
    this._selection.clear();
    this.history?.clear();
  }

  pan(x: number, y: number, scale?: number): void {
    this.viewport?.pan(x, y, scale);
  }

  animatePan(options: { x?: number; y?: number; scale?: number; duration?: number }): Promise<void> {
    if (!this.viewport) return Promise.resolve();
    return this.viewport.animatePan(options);
  }

  zoom(scale: number): void {
    const vp = this.viewport;
    if (!vp) return;
    const center = { x: vp.state.screenWidth / 2, y: vp.state.screenHeight / 2 };
    vp.zoomAt(center, scale / vp.scale);
  }

  centerOn(x: number, y: number): void {
    this.viewport?.centerOn(x, y);
  }

  fit(): void {
    if (!this.scene || !this.viewport) return;
    this.viewport.fit(this.scene.width, this.scene.height);
  }

  blur(strength = 8): void {
    if (this._blurred) return;
    this._blurred = true;
    this.blurFilter = new BlurFilter({ strength });
    this.app.stage.filters = [this.blurFilter];
    this.bus.emit('blur', {});
  }

  unblur(): void {
    if (!this._blurred) return;
    this._blurred = false;
    this.app.stage.filters = null;
    this.blurFilter = null;
    this.bus.emit('unblur', {});
  }

  on<K extends string & keyof CanvasEventMap>(
    name: K,
    handler: (payload: EventPayload<CanvasEventMap, K>, meta: EventMeta) => void,
  ): () => void {
    return this.bus.on(name, handler);
  }

  once<K extends string & keyof CanvasEventMap>(
    name: K,
    handler: (payload: EventPayload<CanvasEventMap, K>, meta: EventMeta) => void,
  ): () => void {
    return this.bus.once(name, handler);
  }

  off<K extends string & keyof CanvasEventMap>(
    name: K,
    handler: (payload: EventPayload<CanvasEventMap, K>, meta: EventMeta) => void,
  ): void {
    this.bus.off(name, handler);
  }

  toScreen(x: number, y: number): { x: number; y: number } {
    return this.viewport?.toScreen({ x, y }) ?? { x, y };
  }

  toWorld(x: number, y: number): { x: number; y: number } {
    return this.viewport?.toLocal({ x, y }) ?? { x, y };
  }

  destroy(): void {
    this._resizeObserver?.disconnect();
    this.app.ticker.remove(this.tickInputs, this);
    this.inputs?.destroy();
    void this.fog?.tearDown();
    void this.lighting?.tearDown();
    this.animation.cancelAll();
    this.bus.emit('destroy', {});
    this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    this.bus.destroy();
    if (Canvas.instance === this) Canvas.instance = null;
    this.initialized = false;
  }
}

export type { CanvasLike };
