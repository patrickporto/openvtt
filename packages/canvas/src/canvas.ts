import { Application, BlurFilter, Container, Graphics } from 'pixi.js';
import { type EventMeta, type EventPayload } from '@openvtt/events';
import { createHotkeyManager, type HotkeyManager } from '@openvtt/hotkeys';
import { CONFIG } from './config';
import { createCanvasBus, type CanvasBus, type CanvasEventMap } from './bus';
import { CanvasViewport } from './viewport';
import { CanvasAnimation, Easing } from './animation';
import { InputsManager } from './input/InputsManager';
import type { CanvasPointerInfo, Point } from './input/types';
import { ToolManager, type ToolOptions } from './tools/ToolManager';
import type { StateEventName } from './state/StateNode';
import { PreviewLayer } from './preview/PreviewLayer';
import { HandlesLayer } from './handles/HandlesLayer';
import { HistoryManager } from './history/HistoryManager';
import { LayerManager } from './layers/LayerManager';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { GridService } from './grid';
import type { PlaceablesLayer } from './layers/PlaceablesLayer';
import type { PlaceableObject, CanvasLike } from './placeables/PlaceableObject';
import { parseScene, type SceneData, type SceneDataInput } from './schemas';
import { segmentsIntersect, toHex } from './utils';
import { DocumentRegistry } from './documents';
import { PluginManager } from './plugins/PluginManager';
import type { CanvasPlugin, ToolContribution } from './plugins/types';
import { ContextMenuManager } from './contextmenu/ContextMenuManager';
import { defineCanvasElements } from './ui';

export interface CanvasOptions {
  background?: number | string;
  minScale?: number;
  maxScale?: number;
  resolution?: number;
  antialias?: boolean;
  tools?: ToolOptions;
  /** Plugins instalados automaticamente antes do initialize(). */
  plugins?: CanvasPlugin[];
  /** Se false, desativa o context menu (right-click/long-press). Default true. */
  contextMenu?: boolean;
  /** Manager de hotkeys compartilhado; se omitido, o canvas cria e gerencia o próprio. */
  hotkeys?: HotkeyManager;
}

type AnyPlaceablesLayer = PlaceablesLayer<any, PlaceableObject<any>, any>;

/** Ordens de empilhamento do core (plugins usam a faixa 10–900). */
export const CORE_LAYER_ORDER = {
  background: 0,
  grid: 950,
  preview: 1000,
  handles: 1100,
} as const;

/**
 * Núcleo do canvas, plugin-first: o core fornece stage/viewport/input,
 * máquina de estados de tools, layers, histórico, seleção e o barramento de
 * eventos/hooks. Todo tipo de documento (token, wall, light, ...) e toda
 * capacidade (fog, iluminação, medição) é contribuída por plugins via
 * `canvas.use(plugin)`.
 */
export class Canvas implements CanvasLike {
  static instance: Canvas | null = null;

  readonly app: Application;
  readonly bus: CanvasBus;
  readonly animation: CanvasAnimation;
  readonly stage: Container;
  readonly hotkeys: HotkeyManager;

  readonly documents: DocumentRegistry;
  readonly plugins: PluginManager;
  readonly contextMenu: ContextMenuManager;

  viewport: CanvasViewport | null = null;
  inputs!: InputsManager;
  tools!: ToolManager;

  background: BackgroundLayer;
  grid: GridService;
  preview: PreviewLayer;
  handles: HandlesLayer;
  layers: LayerManager;
  history!: HistoryManager;

  private readonly container: HTMLElement;
  private readonly options: CanvasOptions;
  private readonly _selection = new Set<string>();
  private readonly pendingTools: ToolContribution[] = [];
  private scene: SceneData | null = null;
  private _interactionDisabled = false;
  private _blurred = false;
  private _resizeObserver?: ResizeObserver;
  private initialized = false;
  private blurFilter: BlurFilter | null = null;
  private lastToolId = 'select';
  private readonly ownsHotkeys: boolean;
  private attachedHotkeys = false;

  constructor(container: HTMLElement, options: CanvasOptions = {}) {
    this.container = container;
    this.options = options;
    this.app = new Application();
    this.bus = createCanvasBus();
    this.hotkeys = options.hotkeys ?? createHotkeyManager({ namespace: 'canvas' });
    this.ownsHotkeys = !options.hotkeys;
    this.stage = new Container();
    this.stage.label = 'openvtt-canvas';
    this.background = new BackgroundLayer({
      name: 'background',
      zIndex: 0,
      backgroundColor: options.background ?? CONFIG.background,
    });
    this.grid = new GridService(undefined, (grid) => this.bus.emit('grid:change', { grid }));
    this.preview = new PreviewLayer({ name: 'preview', zIndex: 1000 }, this);
    this.handles = new HandlesLayer(this);
    this.layers = new LayerManager(this);
    this.documents = new DocumentRegistry(this);
    this.plugins = new PluginManager(this);
    this.contextMenu = new ContextMenuManager(this);
    this.animation = new CanvasAnimation(this.app.ticker);

    for (const layer of [this.background, this.preview, this.handles]) {
      this.stage.addChild(layer);
    }
    this.layers.register('background', 'Background', this.background, { order: CORE_LAYER_ORDER.background });

    Canvas.instance = this;
  }

  /* ------------------------------ plugins ------------------------------ */

  /** Instala um plugin. Chame antes de `initialize()`. */
  use(plugin: CanvasPlugin): Promise<this> {
    return this.plugins.use(plugin).then(() => this);
  }

  /** Registro direto de tool (atalho para o que PluginContext.registerTool faz). */
  registerTool(contribution: ToolContribution): void {
    if (this.tools) throw new Error('[canvas] registerTool must be called before initialize()');
    this.pendingTools.push(contribution);
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
    if (!additive) this.clearSelection(false);
    if (this._selection.has(obj.id) && additive) this._selection.delete(obj.id);
    else this._selection.add(obj.id);
    this.refreshSelection();
    this.bus.emit('selection:change', { ids: [...this._selection] });
  }

  clearSelection(emit = true): void {
    const had = this._selection.size > 0;
    this._selection.clear();
    this.refreshSelection();
    if (emit && had) this.bus.emit('selection:change', { ids: [] });
  }

  refreshSelection(): void {
    for (const layer of this.documents.layers()) {
      for (const obj of layer.placeables) obj.refresh();
    }
    this.handles?.refresh();
  }

  get selected(): PlaceableObject[] {
    const result: PlaceableObject[] = [];
    for (const id of this._selection) {
      const obj = this.documents.findAny(id);
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
    return this.documents.layersTopDown();
  }

  pick(point: Point, options?: { includeLocked?: boolean }): PlaceableObject | undefined {
    for (const layer of this.placeableLayers()) {
      if (!this.layers.isInteractive(layer)) continue;
      const obj = layer.pick(point);
      if (obj && obj.isSelectable && (options?.includeLocked || !obj.isLocked)) return obj;
    }
    return undefined;
  }

  pickRect(rect: { x: number; y: number; width: number; height: number }, options?: { includeLocked?: boolean }): PlaceableObject[] {
    const seen = new Set<string>();
    const result: PlaceableObject[] = [];
    for (const layer of this.placeableLayers()) {
      if (!this.layers.isInteractive(layer)) continue;
      for (const obj of layer.pickRect(rect)) {
        if (!seen.has(obj.id) && obj.isSelectable && (options?.includeLocked || !obj.isLocked)) {
          seen.add(obj.id);
          result.push(obj);
        }
      }
    }
    return result;
  }

  reindex(obj: PlaceableObject): void {
    this.documents.layer(obj.objectType)?.reindex(obj);
  }

  commitMove(obj: PlaceableObject): void {
    this.documents.layer(obj.objectType)?.update(obj.id, { x: obj.x, y: obj.y });
    this.bus.emit('document:moved', { type: obj.objectType, id: obj.id, x: obj.x, y: obj.y });
    this.handles?.refresh();
  }

  /**
   * Commit de resize/rotação: grava no histórico com o snapshot `before`
   * capturado no início do gesto (o doc já foi mutado durante o arraste).
   */
  commitTransform(obj: PlaceableObject, changes: Record<string, unknown>, before: Record<string, unknown>): void {
    this.documents.layer(obj.objectType)?.update(obj.id, changes, { before });
    this.handles?.refresh();
  }

  deleteObject(obj: PlaceableObject): boolean {
    if (obj.isLocked) return false;
    this._selection.delete(obj.id);
    const deleted = this.documents.delete(obj.objectType, obj.id);
    this.refreshSelection();
    return deleted;
  }

  deleteSelected(): void {
    for (const obj of this.selected) this.deleteObject(obj);
    this.clearSelection();
  }

  /* ------------------------------- lock ------------------------------- */

  /**
   * Tranca/destranca placeables (aceita objetos ou ids). Gravado no
   * documento via layer.update — undoable e propagado por `document:update`.
   * Ao trancar, o objeto sai da seleção.
   */
  setLocked(targets: PlaceableObject | string | Array<PlaceableObject | string>, locked: boolean): void {
    const list = Array.isArray(targets) ? targets : [targets];
    const objects: PlaceableObject[] = [];
    for (const target of list) {
      const obj = typeof target === 'string' ? this.documents.findAny(target) : target;
      if (obj && obj.isLocked !== locked) objects.push(obj);
    }
    if (objects.length === 0) return;
    this.history?.beginBatch();
    for (const obj of objects) {
      this.documents.update(obj.objectType, obj.id, { locked });
      if (locked) this._selection.delete(obj.id);
    }
    this.history?.endBatch();
    this.refreshSelection();
    this.bus.call('scene:refresh', {});
  }

  /** Alterna o lock da seleção; sem seleção, do objeto sob o cursor (inclui locked). */
  toggleLock(): void {
    let targets = this.selected;
    if (targets.length === 0) {
      const point = this.inputs?.getCurrentWorldPoint();
      const hit = point ? this.pick(point, { includeLocked: true }) : undefined;
      targets = hit ? [hit] : [];
    }
    if (targets.length === 0) return;
    this.setLocked(targets, targets.some((obj) => !obj.isLocked));
  }

  /* --------------------------- movimento --------------------------- */

  /** Segmentos bloqueadores de movimento, contribuídos pelos plugins (ex.: walls). */
  movementSegments(from: Point, to: Point): { a: Point; b: Point }[] {
    const result = this.bus.call('movement:segments', { from, to, segments: [] });
    return result.segments;
  }

  /** true se o caminho from→to cruza algum bloqueio contribuído pelos plugins. */
  isMoveBlocked(from: Point, to: Point): boolean {
    if (from.x === to.x && from.y === to.y) return false;
    for (const seg of this.movementSegments(from, to)) {
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
    for (const plugin of this.options.plugins ?? []) await this.use(plugin);

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
    this.animation.attach(this.app.ticker);

    this.viewport = new CanvasViewport(this.app, { width, height }, {
      minScale: CONFIG.minScale,
      maxScale: CONFIG.maxScale,
      onMoved: (state) => this.bus.emit('pan', { x: state.x, y: state.y }),
      onZoomed: (state) => this.bus.emit('zoom', { scale: state.scale }),
    });
    this.app.stage.addChild(this.viewport.pixi);
    this.viewport.pixi.addChild(this.stage);
    this.stage.sortableChildren = true;

    this._resizeObserver = new ResizeObserver(() => {
      this.viewport?.resize(this.container.clientWidth, this.container.clientHeight);
    });
    this._resizeObserver.observe(this.container);

    this.tools = new ToolManager(this, this.pendingTools, this.options.tools);
    this.pendingTools.length = 0;
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

    if (!this.hotkeys.isAttached) {
      this.hotkeys.attach();
      this.attachedHotkeys = true;
    }

    defineCanvasElements();
    if (this.options.contextMenu !== false) {
      this.contextMenu.attachTo(this.container);
    }

    this.initialized = true;
    this.bus.emit('ready', { width, height });
  }

  private tickInputs(): void {
    this.inputs.tick();
  }

  private dispatchInput(name: StateEventName, info?: unknown): void {
    this.tools.handleEvent(name, info);
    this.notifyToolChanged();
    if (name === 'contextmenu') {
      if (this.options.contextMenu !== false) {
        this.contextMenu.openFromPointer(info as CanvasPointerInfo);
      }
      return;
    }
    if (name === 'longpress') {
      const longPress = info as CanvasPointerInfo;
      if (
        longPress.device === 'touch' &&
        this.options.contextMenu !== false &&
        this.getCurrentToolId() === 'select'
      ) {
        this.contextMenu.openFromPointer(longPress);
      }
      return;
    }
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

    this.grid.reset(scene.grid);

    if (scene.background) await this.background.setBackground(scene.background, scene.backgroundColor);

    this.viewport?.setWorld(scene.width, scene.height);
    this.viewport?.fit(scene.width, scene.height);
    this.bus.call('scene:setup', { width: scene.width, height: scene.height });

    await this.documents.createFromScene(scene as Record<string, unknown>);

    await this.background.draw();
  }

  private async tearDown(): Promise<void> {
    this.bus.call('scene:teardown', {});
    await Promise.all([
      this.documents.tearDownAll(),
      this.background.tearDown(),
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
    this.app.ticker?.remove(this.tickInputs, this);
    this.inputs?.destroy();
    this.contextMenu.destroy();
    this.plugins.disposeAllSync();
    this.animation.cancelAll();
    this.bus.emit('destroy', {});
    this.tools?.destroy();
    if (this.attachedHotkeys) this.hotkeys.detach();
    if (this.ownsHotkeys) this.hotkeys.destroy();
    if (this.initialized) {
      this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    }
    this.bus.destroy();
    if (Canvas.instance === this) Canvas.instance = null;
    this.initialized = false;
  }
}

export type { CanvasLike };
