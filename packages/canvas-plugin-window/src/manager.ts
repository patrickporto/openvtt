import { v7 } from 'uuid';
import { safeParse as vSafeParse } from 'valibot';
import { dynamicBus, type CanvasBus, type PluginContext, type WindowConstraints, type WindowDockEdge, type WindowDockTarget, type WindowStateKind } from '@openvtt/canvas';
import { WindowFrameElement, defineWindowElements, type FramePointerDetail, type ResizeDir } from './frame';
import { WindowOverlay } from './overlay';
import { WindowHandle, type WindowHandleEvent } from './handle';
import { WINDOW_STATE_ENTRY_SCHEMA } from './state';
import { clampToBounds, computeSnap, detectDockZone, type Bounds, type Rect } from './snap';

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ResolvedConstraints {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  aspectRatio?: number;
}

export interface WindowCreateOptions {
  id?: string;
  definitionId?: string;
  title: string;
  /** 'single' (default): `open` reusa/foca a instância; 'multi': cada `open` cria outra. */
  instances?: 'single' | 'multi';
  content?: HTMLElement;
  factory?: (owner: PluginContext) => HTMLElement | Promise<HTMLElement>;
  owner?: PluginContext;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  modal?: boolean;
  persistent?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  resizable?: boolean;
  popoutable?: boolean;
  dock?: WindowDockTarget;
  /** Bordas onde esta janela pode docar (default: todas as habilitadas pelo manager). */
  dockableEdges?: WindowDockEdge[] | false;
  constraints?: WindowConstraints;
  serializeContent?: (content: HTMLElement) => unknown;
  restoreContent?: (content: HTMLElement, data: unknown) => void;
}

export type WindowOpenOverrides = Partial<Omit<WindowCreateOptions, 'id' | 'definitionId' | 'content' | 'factory' | 'owner'>>;

export interface WindowManagerOptions {
  taskbar?: boolean;
  snap?: boolean;
  snapThreshold?: number;
  dockMargin?: number;
  /** Habilita o recurso de popout para outra janela do navegador. */
  popout?: boolean;
  /** Bordas onde docking é permitido no manager (default: todas; false desabilita). */
  dockableEdges?: WindowDockEdge[] | false;
}

interface WindowEntry {
  id: string;
  definitionId?: string;
  title: string;
  frame: WindowFrameElement | null;
  content: HTMLElement | null;
  owner?: PluginContext;
  factory?: (owner: PluginContext) => HTMLElement | Promise<HTMLElement>;
  modal: boolean;
  persistent: boolean;
  closable: boolean;
  minimizable: boolean;
  maximizable: boolean;
  resizable: boolean;
  popoutable: boolean;
  dockable: WindowDockEdge[] | false | undefined;
  constraints: ResolvedConstraints;
  float: Geometry;
  state: WindowStateKind;
  dock: WindowDockTarget;
  z: number;
  poppedOut: boolean;
  popoutWindow: PopupWindow | null;
  popoutUnsub: (() => void) | null;
  serializeContent?: (content: HTMLElement) => unknown;
  restoreContent?: (content: HTMLElement, data: unknown) => void;
  listeners: Map<WindowHandleEvent, Set<() => void>>;
  frameUnsubs: Array<() => void>;
}

interface WindowDefinitionRecord {
  def: WindowCreateOptions & { id: string; factory: (owner: PluginContext) => HTMLElement | Promise<HTMLElement> };
  owner: PluginContext | null;
}

interface PopupWindow {
  document: {
    title: string;
    body: HTMLElement;
    head?: HTMLElement | null;
    createElement(tag: string): HTMLElement;
    adoptNode?(node: Node): Node;
  };
  close?(): void;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

const FLOAT_Z_BASE = 100;
const MODAL_Z_BASE = 1_000_000;
const TASKBAR_Z = 2_000_000;
const DETACH_THRESHOLD = 4;
const TITLEBAR_GRAB_OFFSET = 17;
const MIN_DOCKED_SIZE = 120;
const ALL_DOCK_EDGES: WindowDockEdge[] = ['left', 'right', 'bottom'];
const POPOUT_STYLE = `
  html, body { margin: 0; height: 100%; }
  body {
    box-sizing: border-box;
    background: var(--ovtt-bg, #16130e);
    color: var(--ovtt-text, #e8e2d4);
    font-family: var(--ovtt-font, system-ui, sans-serif);
    font-size: var(--ovtt-font-size, 12px);
  }
`;

/**
 * Gerenciador de janelas do plugin windows: criação (imperativa ou por
 * definição registrada), foco/z-order em bandas (flutuantes < backdrop <
 * modais), minimizar com taskbar, maximizar, drag com snap e zonas de dock,
 * resize com constraints, docking por borda em stack e persistência via
 * serialize/restore. Em ambiente sem DOM real (SSR, testes headless) opera
 * logicamente: estado, eventos e persistência funcionam sem frames.
 */
export class WindowManager {
  readonly dom: boolean;

  private readonly bus: CanvasBus;
  private readonly host: HTMLElement;
  private readonly overlay: WindowOverlay | null;
  private readonly entries = new Map<string, WindowEntry>();
  private readonly handles = new Map<string, WindowHandle>();
  private readonly definitions = new Map<string, WindowDefinitionRecord>();
  private zFloat = FLOAT_Z_BASE;
  private zModal = MODAL_Z_BASE;
  private focusedId: string | null = null;
  private dragState: { id: string; current: Geometry; px: number; py: number; acc: number } | null = null;
  private resizeState: { id: string; current: Geometry; dir: ResizeDir; blockedNotified: boolean; dims: { width: number; height: number } | null } | null = null;
  private options: Required<Omit<WindowManagerOptions, 'dockableEdges'>> & { dockableEdges: WindowDockEdge[] };
  private escUnsub: (() => void) | null = null;

  constructor(deps: { bus: CanvasBus; host: HTMLElement }, options: WindowManagerOptions = {}) {
    this.bus = deps.bus;
    this.host = deps.host;
    this.options = {
      taskbar: true,
      snap: true,
      snapThreshold: 12,
      dockMargin: 24,
      popout: false,
      ...options,
      dockableEdges: this.normalizeEdges(options.dockableEdges),
    };
    this.dom = WindowManager.domAvailable(this.host);
    if (this.dom) {
      defineWindowElements();
      this.overlay = new WindowOverlay(this.host);
      this.overlay.taskbarEl.style.zIndex = String(TASKBAR_Z);
      this.overlay.backdropEl.addEventListener('pointerdown', () => {
        const top = [...this.entries.values()]
          .filter((entry) => entry.modal)
          .sort((a, b) => b.z - a.z)[0];
        if (top && !top.persistent && top.closable) this.close(top.id);
      });
      this.escUnsub = this.wireEsc();
    } else {
      this.overlay = null;
    }
  }

  /* ------------------------------ definições ------------------------------ */

  /** Registra uma definição de janela (conteúdo lazy, aberta com `open`). */
  register(def: WindowCreateOptions & { id: string; factory: (owner: PluginContext) => HTMLElement | Promise<HTMLElement> }, owner?: PluginContext): void {
    this.definitions.set(def.id, { def, owner: owner ?? null });
  }

  /** Remove uma definição e fecha as janelas abertas dela. */
  unregister(definitionId: string): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.definitionId === definitionId) this.close(entry.id);
    }
    this.definitions.delete(definitionId);
  }

  /**
   * Abre uma janela por definition id. Definições `single` (default) focam a
   * instância existente; definições `multi` criam uma nova instância por
   * chamada. `overrides` aplicam-se apenas à criação.
   */
  open(definitionId: string, overrides: WindowOpenOverrides = {}): WindowHandle | null {
    const record = this.definitions.get(definitionId);
    if (!record) return null;
    const multi = (record.def.instances ?? 'single') === 'multi';
    if (!multi) {
      const existing = this.findByDefinition(definitionId);
      if (existing) {
        this.focus(existing.id);
        return this.handles.get(existing.id) ?? null;
      }
    }
    const { id: _definitionId, ...def } = record.def;
    return this.create({ ...def, ...overrides, definitionId, factory: record.def.factory, owner: record.owner ?? undefined });
  }

  /* ------------------------------- criação -------------------------------- */

  create(def: WindowCreateOptions): WindowHandle {
    if (def.id && this.entries.has(def.id)) {
      this.focus(def.id);
      return this.handles.get(def.id)!;
    }
    const id = def.id ?? v7();
    const bounds = this.bounds();
    const width = def.width ?? 360;
    const height = def.height ?? 320;
    const geometry: Geometry = {
      x: def.x ?? Math.max(0, (bounds.width - width) / 2),
      y: def.y ?? Math.max(0, (bounds.height - height) / 2),
      width,
      height,
    };
    const entry: WindowEntry = {
      id,
      definitionId: def.definitionId,
      title: def.title,
      frame: null,
      content: def.content ?? null,
      owner: def.owner,
      factory: def.factory,
      modal: def.modal ?? false,
      persistent: def.persistent ?? false,
      closable: def.closable ?? true,
      minimizable: def.minimizable ?? true,
      maximizable: def.maximizable ?? true,
      resizable: def.resizable ?? true,
      popoutable: def.popoutable ?? false,
      dockable: def.dockableEdges,
      constraints: this.resolveConstraints(def.constraints, bounds),
      float: geometry,
      state: 'normal',
      dock: 'float',
      z: FLOAT_Z_BASE,
      poppedOut: false,
      popoutWindow: null,
      popoutUnsub: null,
      serializeContent: def.serializeContent,
      restoreContent: def.restoreContent,
      listeners: new Map(),
      frameUnsubs: [],
    };
    entry.float = clampToBounds(this.constrainGeometryFor(entry, geometry, bounds), bounds);
    this.entries.set(id, entry);
    this.handles.set(id, new WindowHandle(id, this));

    if (this.overlay && this.dom) {
      const frame = document.createElement('openvtt-window-frame') as WindowFrameElement;
      entry.frame = frame;
      frame.setTitle(entry.title);
      frame.setAttribute('mode', 'float');
      frame.setAttribute('state', 'normal');
      this.syncFrameFlags(entry);
      this.wireFrame(entry);
      this.overlay.root.appendChild(frame);
      frame.setGeometry(entry.float);
      if (entry.content) frame.setContent(entry.content);
    }

    if (def.dock && def.dock !== 'float' && this.allowedDockEdgesOf(entry).includes(def.dock)) this.dockTo(id, def.dock);
    this.focus(id);
    this.runFactory(entry);
    this.emitBus('window:created', { id, definitionId: entry.definitionId });
    return this.handles.get(id)!;
  }

  get(id: string): WindowHandle | null {
    const direct = this.entries.get(id);
    if (direct) return this.handles.get(direct.id) ?? null;
    const record = this.definitions.get(id);
    if (record && (record.def.instances ?? 'single') === 'multi') return null;
    const entry = this.findByDefinition(id);
    return entry ? (this.handles.get(entry.id) ?? null) : null;
  }

  list(): WindowHandle[] {
    return [...this.entries.values()].map((entry) => this.handles.get(entry.id)!);
  }

  closeAll(): void {
    for (const id of [...this.entries.keys()]) this.close(id);
  }

  minimizeAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.dock === 'float' && entry.state === 'normal') this.minimize(entry.id);
    }
  }

  /* -------------------------------- estado -------------------------------- */

  close(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.notify(entry, 'close');
    this.emitBus('window:closed', { id, definitionId: entry.definitionId });
    if (this.focusedId === id) {
      this.focusedId = null;
    }
    this.closePopup(entry);
    if (this.dragState?.id === id) this.dragState = null;
    if (this.resizeState?.id === id) this.resizeState = null;
    for (const unsub of entry.frameUnsubs) unsub();
    entry.frame?.remove();
    this.entries.delete(id);
    this.handles.delete(id);
    this.syncChrome();
  }

  focus(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (this.focusedId && this.focusedId !== id) {
      const previous = this.entries.get(this.focusedId);
      if (previous) {
        previous.frame?.setFocused(false);
        this.notify(previous, 'blur');
        this.emitBus('window:blur', { id: previous.id });
      }
    }
    const wasFocused = this.focusedId === id;
    this.focusedId = id;
    entry.z = entry.modal ? ++this.zModal : ++this.zFloat;
    if (entry.frame) {
      entry.frame.style.zIndex = String(entry.z);
      entry.frame.setFocused(true);
    }
    if (!wasFocused) {
      this.notify(entry, 'focus');
      this.emitBus('window:focus', { id });
    }
    this.syncChrome();
  }

  minimize(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.state === 'minimized') return;
    if (!entry.minimizable || entry.poppedOut) return;
    entry.state = 'minimized';
    if (entry.dock === 'float') {
      entry.frame?.setVisible(false);
    } else {
      entry.frame?.setAttribute('state', 'collapsed');
    }
    this.afterStateChange(entry);
  }

  restoreWindow(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.poppedOut) return;
    if (entry.state === 'minimized') {
      const target: WindowStateKind = 'normal';
      entry.state = target;
      if (entry.dock === 'float') {
        entry.frame?.setVisible(true);
        entry.frame?.setAttribute('state', 'normal');
      } else {
        entry.frame?.setAttribute('state', 'normal');
      }
      this.afterStateChange(entry);
      this.focus(id);
      return;
    }
    if (entry.state === 'maximized') {
      entry.state = 'normal';
      entry.frame?.setAttribute('state', 'normal');
      if (entry.dock === 'float') {
        entry.frame?.setGeometry(entry.float);
      } else {
        if (entry.frame) entry.frame.style.flex = '';
        this.dockSiblingsOf(entry).forEach((sibling) => {
          if (!sibling.poppedOut) sibling.frame?.setVisible(true);
        });
      }
      this.afterStateChange(entry);
    }
  }

  maximize(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.state === 'maximized' || !entry.maximizable || !entry.resizable || entry.poppedOut) return;
    if (entry.state === 'minimized') this.restoreWindow(id);
    entry.state = 'maximized';
    entry.frame?.setAttribute('state', 'maximized');
    if (entry.dock === 'float') {
      const bounds = this.bounds();
      entry.frame?.setGeometry({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    } else {
      if (entry.frame) entry.frame.style.flex = '1 1 100%';
      this.dockSiblingsOf(entry).forEach((sibling) => sibling.frame?.setVisible(false));
    }
    this.afterStateChange(entry);
  }

  moveTo(id: string, x: number, y: number): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.dock !== 'float' || entry.state === 'maximized') return false;
    const bounds = this.bounds();
    entry.float = clampToBounds(this.constrainGeometryFor(entry, { ...entry.float, x, y }, bounds), bounds);
    entry.frame?.setGeometry(entry.float);
    return true;
  }

  resizeTo(id: string, width: number, height: number): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.dock !== 'float' || entry.state === 'maximized') return false;
    const bounds = this.bounds();
    const requested = { ...entry.float, width, height };
    entry.float = clampToBounds(this.constrainGeometryFor(entry, requested, bounds), bounds);
    entry.frame?.setGeometry(entry.float);
    this.emitBus('window:resize', { id, width: Math.round(entry.float.width), height: Math.round(entry.float.height) });
    this.notify(entry, 'resize');
    return entry.float.width === width && entry.float.height === height;
  }

  setConstraints(id: string, constraints: WindowConstraints): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.constraints = this.resolveConstraints(constraints, this.bounds());
    if (entry.dock === 'float' && entry.state !== 'maximized') {
      entry.float = this.constrainGeometryFor(entry, entry.float, this.bounds());
      entry.frame?.setGeometry(entry.float);
    }
  }

  /* --------------------------------- dock ---------------------------------- */

  dockTo(id: string, edge: WindowDockEdge): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.dock === edge || entry.poppedOut) return false;
    if (!this.allowedDockEdgesOf(entry).includes(edge)) return false;
    if (entry.state === 'maximized') this.restoreWindow(id);
    if (entry.state === 'minimized') this.restoreWindow(id);
    entry.dock = edge;
    if (this.overlay && entry.frame) {
      const stack = this.overlay.stackOf(edge);
      stack.appendChild(entry.frame);
      entry.frame.setAttribute('mode', 'dock');
      entry.frame.setAttribute('dock-resize', edge === 'bottom' ? 'e' : 's');
      entry.frame.style.flex = '';
      entry.frame.style.left = '';
      entry.frame.style.top = '';
      entry.frame.style.width = '';
      entry.frame.style.height = '';
      entry.frame.setVisible(true);
      this.overlay.refreshDocks();
    }
    this.notify(entry, 'dock');
    this.emitBus('window:dock', { id, dock: edge });
    this.focus(id);
    this.syncChrome();
    return true;
  }

  undock(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.dock === 'float' || entry.poppedOut) return false;
    if (entry.state === 'maximized') this.restoreWindow(id);
    if (entry.state === 'minimized') this.restoreWindow(id);
    this.detachEntry(entry, null);
    return true;
  }

  /* -------------------------------- popout --------------------------------- */

  popout(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.poppedOut || !this.options.popout || !entry.popoutable) return false;
    if (entry.state === 'minimized') return false;
    if (entry.state === 'maximized') this.restoreWindow(id);
    const win = this.openPopupWindow(entry);
    if (!win) return false;
    entry.popoutWindow = win;
    entry.poppedOut = true;
    entry.frame?.setAttribute('popped-out', '');
    entry.frame?.setVisible(false);
    const content = entry.content;
    if (content) {
      if (win.document.adoptNode && content.ownerDocument !== (win.document as unknown as Document)) {
        try {
          win.document.adoptNode(content);
        } catch {
          /* noop */
        }
      }
      win.document.body.appendChild(content);
    }
    const onUnload = (): void => {
      this.popin(id);
    };
    win.addEventListener?.('beforeunload', onUnload);
    entry.popoutUnsub = () => win.removeEventListener?.('beforeunload', onUnload);
    this.overlay?.refreshDocks();
    this.notify(entry, 'popout');
    this.emitBus('window:popout', { id });
    this.syncChrome();
    return true;
  }

  popin(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry || !entry.poppedOut) return false;
    entry.poppedOut = false;
    entry.frame?.removeAttribute('popped-out');
    const content = entry.content;
    if (content && entry.frame) {
      const doc = entry.frame.ownerDocument ?? document;
      if (content.ownerDocument && content.ownerDocument !== doc) {
        try {
          doc.adoptNode(content);
        } catch {
          /* noop */
        }
      }
      entry.frame.setContent(content);
    }
    entry.frame?.setVisible(!(entry.dock === 'float' && entry.state === 'minimized'));
    this.closePopup(entry);
    this.overlay?.refreshDocks();
    this.notify(entry, 'popin');
    this.emitBus('window:popin', { id });
    this.focus(id);
    this.syncChrome();
    return true;
  }

  /* ------------------------------ persistência ----------------------------- */

  serialize(): Array<Record<string, unknown>> {
    return [...this.entries.values()]
      .sort((a, b) => a.z - b.z)
      .map((entry) => {
        const record: Record<string, unknown> = {
          id: entry.id,
          x: Math.round(entry.float.x),
          y: Math.round(entry.float.y),
          width: Math.round(entry.float.width),
          height: Math.round(entry.float.height),
          state: entry.state,
          dock: entry.dock,
          zIndex: entry.z,
        };
        if (entry.definitionId) record.definitionId = entry.definitionId;
        if (entry.dock !== 'float' && entry.frame?.parentElement) {
          record.stackIndex = [...entry.frame.parentElement.children].indexOf(entry.frame);
        }
        if (entry.serializeContent && entry.content) {
          record.content = entry.serializeContent(entry.content);
        }
        return record;
      });
  }

  restore(states: ReadonlyArray<Record<string, unknown>>): void {
    const ordered = [...states].sort((a, b) => Number(a.zIndex ?? 0) - Number(b.zIndex ?? 0));
    for (const state of ordered) {
      const parsed = vSafeParse(WINDOW_STATE_ENTRY_SCHEMA, state);
      if (!parsed.success) continue;
      const data = parsed.output;
      const definitionId = data.definitionId;
      if (!definitionId || !this.definitions.has(definitionId)) continue;
      const record = this.definitions.get(definitionId)!;
      const multi = (record.def.instances ?? 'single') === 'multi';
      let entry = multi ? (this.entries.get(data.id) ?? null) : this.findByDefinition(definitionId);
      if (!entry) {
        if (multi) {
          const { id: _definitionId, ...def } = record.def;
          this.create({ ...def, id: data.id, definitionId, factory: record.def.factory, owner: record.owner ?? undefined });
          entry = this.entries.get(data.id) ?? null;
        } else {
          this.open(definitionId);
          entry = this.findByDefinition(definitionId);
        }
        if (!entry) continue;
      }
      const bounds = this.bounds();
      const geometry = {
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
      };
      entry.float = clampToBounds(this.constrainGeometryFor(entry, geometry, bounds), bounds);
      if (entry.dock === 'float') entry.frame?.setGeometry(entry.float);

      const dock = data.dock;
      if (dock === 'left' || dock === 'right' || dock === 'bottom') {
        if (this.allowedDockEdgesOf(entry).includes(dock)) {
          if (entry.dock !== dock) this.dockTo(entry.id, dock);
          const stackIndex = typeof data.stackIndex === 'number' ? data.stackIndex : -1;
          if (stackIndex >= 0 && entry.frame?.parentElement) {
            const stack = entry.frame.parentElement;
            const ref = stack.children[stackIndex];
            if (ref && ref !== entry.frame) stack.insertBefore(entry.frame, ref);
            else if (!ref) stack.appendChild(entry.frame);
          }
        } else if (entry.dock !== 'float') {
          this.undock(entry.id);
        }
      } else if (entry.dock !== 'float') {
        this.undock(entry.id);
      }

      if (data.state === 'minimized') this.minimize(entry.id);
      else if (data.state === 'maximized') this.maximize(entry.id);
      else if (entry.state !== 'normal') this.restoreWindow(entry.id);

      if (entry.content && data.content !== undefined && entry.restoreContent) {
        entry.restoreContent(entry.content, data.content);
      }
      this.focus(entry.id);
    }
  }

  setOptions(options: WindowManagerOptions): void {
    this.options = {
      ...this.options,
      ...options,
      dockableEdges: options.dockableEdges !== undefined ? this.normalizeEdges(options.dockableEdges) : this.options.dockableEdges,
    };
    for (const entry of this.entries.values()) this.syncFrameFlags(entry);
    this.syncChrome();
  }

  /* ------------------------------- port do handle --------------------------- */

  definitionIdOf(id: string): string | undefined {
    return this.entries.get(id)?.definitionId;
  }

  titleOf(id: string): string {
    return this.entries.get(id)?.title ?? '';
  }

  stateOf(id: string): WindowStateKind {
    return this.entries.get(id)?.state ?? 'normal';
  }

  dockOf(id: string): WindowDockTarget {
    return this.entries.get(id)?.dock ?? 'float';
  }

  poppedOutOf(id: string): boolean {
    return this.entries.get(id)?.poppedOut ?? false;
  }

  elementOf(id: string): HTMLElement | null {
    return this.entries.get(id)?.frame ?? null;
  }

  contentOf(id: string): HTMLElement | null {
    return this.entries.get(id)?.content ?? null;
  }

  constraintsOf(id: string): WindowConstraints {
    const entry = this.entries.get(id);
    if (!entry) return {};
    const { minWidth, minHeight, maxWidth, maxHeight, aspectRatio } = entry.constraints;
    const result: WindowConstraints = { minWidth, minHeight, maxWidth, maxHeight };
    if (aspectRatio !== undefined) result.aspectRatio = aspectRatio;
    return result;
  }

  onHandleEvent(id: string, event: WindowHandleEvent, listener: () => void): () => void {
    const entry = this.entries.get(id);
    if (!entry) return () => undefined;
    let set = entry.listeners.get(event);
    if (!set) {
      set = new Set();
      entry.listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  /* -------------------------------- destroy -------------------------------- */

  destroy(): void {
    this.escUnsub?.();
    this.escUnsub = null;
    this.dragState = null;
    this.resizeState = null;
    for (const entry of this.entries.values()) {
      this.closePopup(entry);
      for (const unsub of entry.frameUnsubs) unsub();
    }
    this.entries.clear();
    this.handles.clear();
    this.definitions.clear();
    this.overlay?.destroy();
  }

  /* --------------------------------- interno -------------------------------- */

  private static domAvailable(host: HTMLElement): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      typeof (host as unknown as { appendChild?: unknown }).appendChild === 'function' &&
      typeof (document.createElement('div') as unknown as { appendChild?: unknown }).appendChild === 'function'
    );
  }

  private bounds(): Bounds {
    return this.overlay?.bounds() ?? { width: 0, height: 0 };
  }

  private findByDefinition(definitionId: string): WindowEntry | undefined {
    return [...this.entries.values()].find((entry) => entry.definitionId === definitionId);
  }

  private dockSiblingsOf(entry: WindowEntry): WindowEntry[] {
    return [...this.entries.values()].filter((other) => other !== entry && other.dock === entry.dock);
  }

  private normalizeEdges(edges: WindowDockEdge[] | false | undefined): WindowDockEdge[] {
    if (edges === false) return [];
    if (!edges) return [...ALL_DOCK_EDGES];
    return ALL_DOCK_EDGES.filter((edge) => edges.includes(edge));
  }

  private allowedDockEdgesOf(entry: WindowEntry): WindowDockEdge[] {
    if (entry.dockable === false) return [];
    const windowEdges = entry.dockable ?? ALL_DOCK_EDGES;
    return this.options.dockableEdges.filter((edge) => windowEdges.includes(edge));
  }

  private detachEntry(entry: WindowEntry, at: { px: number; py: number } | null): void {
    const bounds = this.bounds();
    const width = entry.float.width > 0 ? entry.float.width : 360;
    const height = entry.float.height > 0 ? entry.float.height : 320;
    const geometry: Geometry = at
      ? { x: at.px - width / 2, y: at.py - TITLEBAR_GRAB_OFFSET, width, height }
      : { ...entry.float };
    entry.dock = 'float';
    if (this.overlay && entry.frame) {
      this.overlay.root.appendChild(entry.frame);
      entry.frame.setAttribute('mode', 'float');
      entry.frame.removeAttribute('dock-resize');
      entry.frame.style.flex = '';
      entry.frame.setVisible(true);
    }
    entry.float = clampToBounds(this.constrainGeometryFor(entry, geometry, bounds), bounds);
    entry.frame?.setGeometry(entry.float);
    this.overlay?.refreshDocks();
    this.notify(entry, 'dock');
    this.emitBus('window:dock', { id: entry.id, dock: 'float' });
    this.focus(entry.id);
    this.syncChrome();
  }

  private openPopupWindow(entry: WindowEntry): PopupWindow | null {
    const opener = (globalThis as { open?: (url?: string, target?: string, features?: string) => PopupWindow | null }).open;
    if (typeof opener !== 'function') return null;
    const width = Math.max(240, Math.round(entry.float.width) || 360);
    const height = Math.max(160, Math.round(entry.float.height) || 320);
    let win: PopupWindow | null = null;
    try {
      win = opener.call(globalThis, '', '_blank', `popup=yes,width=${width},height=${height}`);
    } catch {
      return null;
    }
    if (!win || !win.document || !win.document.body) return null;
    try {
      win.document.title = entry.title;
      const style = win.document.createElement('style');
      style.textContent = POPOUT_STYLE;
      win.document.head?.appendChild(style);
      const themeVars = typeof document !== 'undefined' ? document.documentElement.getAttribute('style') : null;
      if (themeVars) win.document.body.setAttribute('style', themeVars);
    } catch {
      /* noop */
    }
    return win;
  }

  private closePopup(entry: WindowEntry): void {
    entry.popoutUnsub?.();
    entry.popoutUnsub = null;
    const win = entry.popoutWindow;
    entry.popoutWindow = null;
    entry.poppedOut = false;
    try {
      win?.close?.();
    } catch {
      /* noop */
    }
  }

  private syncFrameFlags(entry: WindowEntry): void {
    entry.frame?.setFlags({
      closable: entry.closable,
      minimizable: entry.minimizable,
      maximizable: entry.maximizable,
      resizable: entry.resizable,
      popoutable: this.options.popout && entry.popoutable,
    });
  }

  private resolveConstraints(constraints: WindowConstraints | undefined, bounds: Bounds): ResolvedConstraints {
    return {
      minWidth: constraints?.minWidth ?? 200,
      minHeight: constraints?.minHeight ?? 120,
      maxWidth: Math.min(constraints?.maxWidth ?? Infinity, bounds.width || Infinity),
      maxHeight: Math.min(constraints?.maxHeight ?? Infinity, bounds.height || Infinity),
      aspectRatio: constraints?.aspectRatio,
    };
  }

  private runFactory(entry: WindowEntry): void {
    if (!entry.factory) return;
    if (!this.dom) return;
    const factory = entry.factory;
    const owner = entry.owner;
    const result = factory(owner as PluginContext);
    if (result && typeof (result as Promise<HTMLElement>).then === 'function') {
      void (result as Promise<HTMLElement>).then((el) => {
        if (this.entries.get(entry.id)) this.setContent(entry, el);
      });
    } else {
      this.setContent(entry, result as HTMLElement);
    }
  }

  private setContent(entry: WindowEntry, el: HTMLElement): void {
    entry.content = el;
    if (entry.poppedOut && entry.popoutWindow) {
      const doc = entry.popoutWindow.document;
      if (doc.adoptNode && el.ownerDocument !== (doc as unknown as Document)) {
        try {
          doc.adoptNode(el);
        } catch {
          /* noop */
        }
      }
      doc.body.appendChild(el);
      return;
    }
    entry.frame?.setContent(el);
  }

  private wireFrame(entry: WindowEntry): void {
    const frame = entry.frame;
    if (!frame) return;
    const on = (name: string, fn: (event: Event) => void): void => {
      frame.addEventListener(name, fn);
      entry.frameUnsubs.push(() => frame.removeEventListener(name, fn));
    };
    on('frame-focus', () => this.focus(entry.id));
    on('frame-command', (event) => {
      const command = (event as CustomEvent<{ command: string }>).detail.command;
      if (command === 'close' && entry.closable) this.close(entry.id);
      if (command === 'minimize') this.minimize(entry.id);
      if (command === 'maximize') this.maximize(entry.id);
      if (command === 'restore') this.restoreWindow(entry.id);
      if (command === 'popout') this.popout(entry.id);
      if (command === 'popin') this.popin(entry.id);
    });
    on('frame-drag-start', () => {
      if (entry.state !== 'normal') return;
      this.dragState = { id: entry.id, current: { ...entry.float }, px: 0, py: 0, acc: 0 };
    });
    on('frame-drag', (event) => {
      if (!this.dragState || entry.state !== 'normal') return;
      const detail = (event as CustomEvent<FramePointerDetail>).detail;
      const origin = this.overlay?.hostRect() ?? { left: 0, top: 0 };
      this.dragState.px = detail.clientX - origin.left;
      this.dragState.py = detail.clientY - origin.top;
      if (entry.dock !== 'float') {
        this.dragState.acc += Math.abs(detail.dx) + Math.abs(detail.dy);
        if (this.dragState.acc < DETACH_THRESHOLD) return;
        this.detachEntry(entry, { px: this.dragState.px, py: this.dragState.py });
        this.dragState.current = { ...entry.float };
        return;
      }
      this.dragState.current.x += detail.dx;
      this.dragState.current.y += detail.dy;
      let display = { ...this.dragState.current };
      if (this.options.snap && !detail.altKey) {
        const targets = this.snapTargets(entry);
        const snap = computeSnap(display, targets, this.options.snapThreshold);
        if (snap) {
          display = { ...display, x: snap.x, y: snap.y };
          this.overlay?.showGuides(snap.guides);
        } else {
          this.overlay?.showGuides([]);
        }
      }
      entry.float = display;
      frame.setGeometry(display);
      const zone = detectDockZone(this.dragState.px, this.dragState.py, this.bounds(), this.options.dockMargin, this.allowedDockEdgesOf(entry));
      this.overlay?.showDockPreview(zone);
    });
    on('frame-drag-end', () => {
      if (!this.dragState) return;
      const zone = detectDockZone(this.dragState.px, this.dragState.py, this.bounds(), this.options.dockMargin, this.allowedDockEdgesOf(entry));
      this.dragState = null;
      this.overlay?.showGuides([]);
      this.overlay?.showDockPreview(null);
      if (zone) {
        this.dockTo(entry.id, zone);
        return;
      }
      const bounds = this.bounds();
      entry.float = clampToBounds(this.constrainGeometryFor(entry, entry.float, bounds), bounds);
      frame.setGeometry(entry.float);
    });
    on('frame-resize-start', (event) => {
      const dir = (event as CustomEvent<{ dir: ResizeDir }>).detail.dir;
      if (!entry.resizable || entry.state !== 'normal') return;
      if (entry.dock !== 'float') {
        this.resizeState = { id: entry.id, current: { x: 0, y: 0, width: frame.offsetWidth, height: frame.offsetHeight }, dir, blockedNotified: false, dims: null };
        return;
      }
      this.resizeState = { id: entry.id, current: { ...entry.float }, dir, blockedNotified: false, dims: null };
    });
    on('frame-resize', (event) => {
      if (!this.resizeState) return;
      const detail = (event as CustomEvent<FramePointerDetail & { dir: ResizeDir }>).detail;
      if (entry.dock !== 'float') {
        const horizontal = entry.dock === 'bottom';
        if (horizontal) this.resizeState.current.width += detail.dx;
        else this.resizeState.current.height += detail.dy;
        const base = horizontal ? this.resizeState.current.width : this.resizeState.current.height;
        const requested = base || 220;
        const size = Math.max(MIN_DOCKED_SIZE, requested);
        this.resizeState.dims = horizontal
          ? { width: size, height: this.resizeState.current.height || 220 }
          : { width: this.resizeState.current.width || 220, height: size };
        if (requested < MIN_DOCKED_SIZE) this.flagResizeBlocked(entry);
        frame.style.flex = `0 0 ${size}px`;
        return;
      }
      const base = this.resizeState.current;
      if (detail.dir.includes('e')) base.width += detail.dx;
      if (detail.dir.includes('s')) base.height += detail.dy;
      if (detail.dir.includes('w')) {
        base.width -= detail.dx;
        base.x += detail.dx;
      }
      if (detail.dir.includes('n')) {
        base.height -= detail.dy;
        base.y += detail.dy;
      }
      let { x, y, width, height } = base;
      const bounds = this.bounds();
      const rawWidth = width;
      const rawHeight = height;
      if (bounds.width > 0) {
        if (detail.dir.includes('e')) width = Math.min(width, bounds.width - x);
        if (detail.dir.includes('w')) width = Math.min(width, x + width);
      }
      if (bounds.height > 0) {
        if (detail.dir.includes('s')) height = Math.min(height, bounds.height - y);
        if (detail.dir.includes('n')) height = Math.min(height, y + height);
      }
      const c = entry.constraints;
      const blocked =
        rawWidth !== width ||
        rawHeight !== height ||
        width < c.minWidth ||
        width > c.maxWidth ||
        height < c.minHeight ||
        height > c.maxHeight;
      const constrained = this.constrainGeometryFor(entry, { x, y, width, height }, bounds);
      if (blocked) this.flagResizeBlocked(entry);
      if (detail.dir.includes('w')) constrained.x = x + (width - constrained.width);
      if (detail.dir.includes('n')) constrained.y = y + (height - constrained.height);
      entry.float = constrained;
      frame.setGeometry(constrained);
    });
    on('frame-resize-end', () => {
      if (!this.resizeState) return;
      const dims = this.resizeState.dims;
      this.resizeState = null;
      frame.removeAttribute('resize-blocked');
      if (entry.dock === 'float') {
        const bounds = this.bounds();
        entry.float = clampToBounds(this.constrainGeometryFor(entry, entry.float, bounds), bounds);
        frame.setGeometry(entry.float);
        this.emitBus('window:resize', { id: entry.id, width: Math.round(entry.float.width), height: Math.round(entry.float.height) });
      } else if (dims) {
        this.emitBus('window:resize', { id: entry.id, width: Math.round(dims.width), height: Math.round(dims.height) });
      }
      this.notify(entry, 'resize');
    });
  }

  private flagResizeBlocked(entry: WindowEntry): void {
    entry.frame?.setAttribute('resize-blocked', '');
    if (this.resizeState && !this.resizeState.blockedNotified) {
      this.resizeState.blockedNotified = true;
      this.emitBus('window:resize-blocked', { id: entry.id });
    }
  }

  private constrainGeometryFor(entry: WindowEntry, geometry: Geometry, bounds: Bounds): Geometry {
    const c = entry.constraints;
    const minW = Math.max(c.minWidth, 40);
    const minH = Math.max(c.minHeight, 34);
    const maxW = Math.min(c.maxWidth, bounds.width || Infinity);
    const maxH = Math.min(c.maxHeight, bounds.height || Infinity);
    let width = Math.min(Math.max(geometry.width, minW), maxW);
    let height = Math.min(Math.max(geometry.height, minH), maxH);
    if (c.aspectRatio) {
      const byWidth = width / c.aspectRatio;
      if (byWidth >= minH && byWidth <= maxH) height = byWidth;
      else {
        const byHeight = height * c.aspectRatio;
        if (byHeight >= minW && byHeight <= maxW) width = byHeight;
      }
    }
    return { x: geometry.x, y: geometry.y, width, height };
  }

  private snapTargets(entry: WindowEntry): Rect[] {
    const bounds = this.bounds();
    const targets: Rect[] = [{ x: 0, y: 0, width: bounds.width, height: bounds.height }];
    for (const other of this.entries.values()) {
      if (other === entry || other.dock !== 'float' || other.state === 'minimized' || other.poppedOut) continue;
      targets.push({ ...other.float });
    }
    return targets;
  }

  private afterStateChange(entry: WindowEntry): void {
    entry.frame?.setAttribute('state', entry.state === 'minimized' && entry.dock !== 'float' ? 'collapsed' : entry.state);
    this.notify(entry, 'state');
    this.emitBus('window:state', { id: entry.id, state: entry.state });
    this.syncChrome();
  }

  private syncChrome(): void {
    if (!this.overlay) return;
    const minimized = [...this.entries.values()].filter((entry) => entry.dock === 'float' && entry.state === 'minimized' && !entry.poppedOut);
    const popped = [...this.entries.values()].filter((entry) => entry.poppedOut);
    if (this.options.taskbar) {
      const buttons = [...minimized, ...popped].map((entry) => ({ id: entry.id, title: entry.title }));
      this.overlay.renderTaskbar(buttons, (id) => {
        const entry = this.entries.get(id);
        if (!entry) return;
        if (entry.poppedOut) this.popin(id);
        else this.restoreWindow(id);
      });
    } else {
      this.overlay.renderTaskbar([], () => undefined);
    }
    const hasModal = [...this.entries.values()].some((entry) => entry.modal);
    this.overlay.setBackdrop(hasModal, MODAL_Z_BASE);
  }

  private wireEsc(): (() => void) | null {
    if (!this.dom) return null;
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const top = [...this.entries.values()]
        .filter((entry) => entry.modal)
        .sort((a, b) => b.z - a.z)[0];
      if (top && !top.persistent && top.closable) this.close(top.id);
    };
    this.host.addEventListener('keydown', handler, true);
    return () => this.host.removeEventListener('keydown', handler, true);
  }

  private notify(entry: WindowEntry, event: WindowHandleEvent): void {
    for (const listener of entry.listeners.get(event) ?? []) listener();
  }

  private emitBus(name: string, payload: unknown): void {
    dynamicBus(this.bus).emit(name, payload);
  }
}
