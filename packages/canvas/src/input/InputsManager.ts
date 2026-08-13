import type { StateEventName } from '../state/StateNode';
import type { PlaceableObject } from '../placeables/PlaceableObject';
import { lerp } from '../utils';
import { classifyWheelZoom } from './wheel';
import {
  DOUBLE_CLICK_DIST,
  DOUBLE_CLICK_MS,
  DRAG_THRESHOLD,
  LONG_PRESS_MS,
  type CanvasKeyInfo,
  type CanvasPinchInfo,
  type CanvasPointerInfo,
  type CanvasWheelInfo,
  type Point,
  type PointerDevice,
  type PointerTarget,
} from './types';

export interface InputsManagerDeps {
  element: HTMLElement;
  toWorld(p: Point): Point;
  toScreen(p: Point): Point;
  /** Hit-test no mundo para detectar o alvo sob o ponteiro. */
  pick(world: Point): PlaceableObject | undefined;
  dispatch(name: StateEventName, info?: unknown): void;
  isEnabled(): boolean;
}

interface TrackedPointer {
  pointerId: number;
  device: PointerDevice;
  screen: Point;
  button: number;
}

const IS_MAC =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || '');

/**
 * Rastreia e normaliza todo o estado de entrada (mouse, touch, pen, trackpad)
 * em eventos de alto nível despachados para a máquina de estados.
 * Inspirado no InputsManager do tldraw.
 */
export class InputsManager {
  private readonly deps: InputsManagerDeps;
  private readonly pointers = new Map<number, TrackedPointer>();
  private readonly disposers: Array<() => void> = [];

  private currentScreen: Point = { x: 0, y: 0 };
  private previousScreen: Point = { x: 0, y: 0 };
  private originScreen: Point = { x: 0, y: 0 };
  private velocity: Point = { x: 0, y: 0 };
  private lastMoveTime = 0;

  readonly buttons = new Set<number>();
  readonly keys = new Set<string>();

  shiftKey = false;
  altKey = false;
  ctrlKey = false;
  metaKey = false;

  isPointing = false;
  isDragging = false;
  isPinching = false;
  isPanning = false;
  isSpacebarPanning = false;
  isPen = false;

  private pinchPrevDist = 0;
  private pinchPrevCenter: Point = { x: 0, y: 0 };
  private lastClick = { time: 0, x: 0, y: 0 };
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(deps: InputsManagerDeps) {
    this.deps = deps;
    deps.element.style.touchAction = 'none';
    this.attach();
  }

  /* ---------- leitura de estado ---------- */

  getCurrentScreenPoint(): Point {
    return { ...this.currentScreen };
  }
  getPreviousScreenPoint(): Point {
    return { ...this.previousScreen };
  }
  getOriginScreenPoint(): Point {
    return { ...this.originScreen };
  }
  getCurrentWorldPoint(): Point {
    return this.deps.toWorld(this.currentScreen);
  }
  getOriginWorldPoint(): Point {
    return this.deps.toWorld(this.originScreen);
  }
  getPointerVelocity(): Point {
    return { ...this.velocity };
  }
  getAccelKey(): boolean {
    return IS_MAC ? this.metaKey : this.ctrlKey;
  }

  /* ---------- ciclo de vida ---------- */

  private on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    name: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(name, handler as EventListener, options);
    this.disposers.push(() => target.removeEventListener(name, handler as EventListener, options));
  }

  private attach(): void {
    const el = this.deps.element;
    this.on(el, 'pointerdown', (e) => this.handlePointerDown(e as PointerEvent));
    this.on(window, 'pointermove', (e) => this.handlePointerMove(e as PointerEvent));
    this.on(window, 'pointerup', (e) => this.handlePointerUp(e as PointerEvent));
    this.on(window, 'pointercancel', (e) => this.handlePointerUp(e as PointerEvent));
    this.on(el, 'wheel', (e) => this.handleWheel(e as WheelEvent), { passive: false });
    this.on(el, 'contextmenu', (e) => e.preventDefault());
    this.on(window, 'keydown', (e) => this.handleKeyDown(e as KeyboardEvent));
    this.on(window, 'keyup', (e) => this.handleKeyUp(e as KeyboardEvent));
    this.on(window, 'blur', () => this.resetTransient());
  }

  destroy(): void {
    this.destroyed = true;
    this.clearLongPress();
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.pointers.clear();
  }

  private resetTransient(): void {
    this.keys.clear();
    this.buttons.clear();
    this.isPointing = false;
    this.isDragging = false;
    this.isPinching = false;
    this.isPanning = false;
    this.isSpacebarPanning = false;
    this.clearLongPress();
  }

  /* ---------- helpers ---------- */

  private screenFromEvent(e: PointerEvent | WheelEvent): Point {
    const rect = this.deps.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private updateModifiers(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): void {
    this.shiftKey = e.shiftKey;
    this.altKey = e.altKey;
    this.ctrlKey = e.ctrlKey;
    this.metaKey = e.metaKey;
  }

  private baseInfo(screen: Point) {
    return {
      point: this.deps.toWorld(screen),
      screenPoint: screen,
      shiftKey: this.shiftKey,
      altKey: this.altKey,
      ctrlKey: this.ctrlKey,
      metaKey: this.metaKey,
      accelKey: this.getAccelKey(),
    };
  }

  private pointerInfo(e: PointerEvent, screen: Point, target?: PointerTarget): CanvasPointerInfo {
    return {
      ...this.baseInfo(screen),
      button: e.button,
      buttons: e.buttons,
      pointerId: e.pointerId,
      device: (e.pointerType as PointerDevice) || 'mouse',
      target: target ?? { type: 'canvas' },
    };
  }

  private detectTarget(world: Point): PointerTarget {
    const object = this.deps.pick(world);
    return object ? { type: 'object', object } : { type: 'canvas' };
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /* ---------- pointer events ---------- */

  private handlePointerDown(e: PointerEvent): void {
    if (!this.deps.isEnabled()) return;
    this.updateModifiers(e);
    const screen = this.screenFromEvent(e);
    this.pointers.set(e.pointerId, {
      pointerId: e.pointerId,
      device: (e.pointerType as PointerDevice) || 'mouse',
      screen,
      button: e.button,
    });
    try {
      this.deps.element.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }

    if (this.pointers.size === 2) {
      this.beginPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    this.isPen = e.pointerType === 'pen';
    this.isPointing = true;
    this.isDragging = false;
    this.buttons.add(e.button);
    this.currentScreen = screen;
    this.previousScreen = screen;
    this.originScreen = screen;
    this.velocity = { x: 0, y: 0 };

    const info = this.pointerInfo(e, screen, this.detectTarget(this.deps.toWorld(screen)));
    this.deps.dispatch('pointerdown', info);

    if (e.pointerType === 'touch') {
      this.clearLongPress();
      this.longPressTimer = setTimeout(() => {
        if (this.isPointing && !this.isDragging && this.pointers.size === 1) {
          this.deps.dispatch('longpress', this.pointerInfo(e, this.currentScreen, info.target));
        }
      }, LONG_PRESS_MS);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const tracked = this.pointers.get(e.pointerId);
    this.updateModifiers(e);
    const screen = this.screenFromEvent(e);

    this.previousScreen = this.currentScreen;
    this.currentScreen = screen;

    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveTime);
    this.lastMoveTime = now;
    const vx = (screen.x - this.previousScreen.x) / dt;
    const vy = (screen.y - this.previousScreen.y) / dt;
    this.velocity = {
      x: Math.abs(vx) < 0.01 ? 0 : lerp(this.velocity.x, vx, 0.5),
      y: Math.abs(vy) < 0.01 ? 0 : lerp(this.velocity.y, vy, 0.5),
    };

    if (tracked) {
      tracked.screen = screen;
      if (this.isPinching) {
        this.updatePinch();
        return;
      }
    }

    if (!this.deps.isEnabled()) return;

    if (this.isPointing && !this.isDragging) {
      const dist = Math.hypot(screen.x - this.originScreen.x, screen.y - this.originScreen.y);
      if (dist > DRAG_THRESHOLD) {
        this.isDragging = true;
        this.clearLongPress();
      }
    }

    const target = tracked ? undefined : this.detectTarget(this.deps.toWorld(screen));
    this.deps.dispatch('pointermove', this.pointerInfo(e, screen, target));
  }

  private handlePointerUp(e: PointerEvent): void {
    const tracked = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.updateModifiers(e);
    this.clearLongPress();

    if (this.isPinching) {
      if (this.pointers.size < 2) this.endPinch(e);
      return;
    }
    if (!tracked) return;

    const screen = this.screenFromEvent(e);
    this.buttons.delete(e.button);
    const wasDragging = this.isDragging;
    this.isPointing = this.pointers.size > 0;
    this.isDragging = false;

    if (!this.deps.isEnabled()) return;

    const info = this.pointerInfo(e, screen, this.detectTarget(this.deps.toWorld(screen)));
    this.deps.dispatch('pointerup', info);

    if (!wasDragging && e.button === 0) {
      const now = performance.now();
      const dist = Math.hypot(screen.x - this.lastClick.x, screen.y - this.lastClick.y);
      if (now - this.lastClick.time < DOUBLE_CLICK_MS && dist < DOUBLE_CLICK_DIST) {
        this.deps.dispatch('doubleclick', info);
        this.lastClick.time = 0;
      } else {
        this.lastClick = { time: now, x: screen.x, y: screen.y };
      }
    }
  }

  /* ---------- pinch (touch 2 dedos / trackpad) ---------- */

  private beginPinch(): void {
    this.isPinching = true;
    this.isDragging = false;
    this.clearLongPress();
    const [a, b] = [...this.pointers.values()];
    this.pinchPrevDist = Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y);
    this.pinchPrevCenter = { x: (a.screen.x + b.screen.x) / 2, y: (a.screen.y + b.screen.y) / 2 };
    this.originScreen = { ...this.pinchPrevCenter };
    this.deps.dispatch('pinchstart', this.pinchInfo(1, { x: 0, y: 0 }));
  }

  private updatePinch(): void {
    if (this.pointers.size < 2) return;
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y);
    const center = { x: (a.screen.x + b.screen.x) / 2, y: (a.screen.y + b.screen.y) / 2 };
    const scaleDelta = this.pinchPrevDist > 0 ? dist / this.pinchPrevDist : 1;
    const delta = { x: center.x - this.pinchPrevCenter.x, y: center.y - this.pinchPrevCenter.y };
    this.pinchPrevDist = dist;
    this.pinchPrevCenter = center;
    this.deps.dispatch('pinch', this.pinchInfo(scaleDelta, delta));
  }

  private endPinch(e: PointerEvent): void {
    this.isPinching = false;
    this.deps.dispatch('pinchend', this.pinchInfo(1, { x: 0, y: 0 }));
    this.isPointing = this.pointers.size > 0;
    if (this.pointers.size === 1) {
      const remaining = [...this.pointers.values()][0];
      this.originScreen = { ...remaining.screen };
      this.currentScreen = { ...remaining.screen };
    }
    void e;
  }

  private pinchInfo(scaleDelta: number, delta: Point): CanvasPinchInfo {
    const center = this.pinchPrevCenter;
    return {
      ...this.baseInfo(this.deps.toWorld(center)),
      screenCenter: { ...center },
      worldCenter: this.deps.toWorld(center),
      scaleDelta,
      delta,
    };
  }

  /* ---------- wheel (mouse vs trackpad) ---------- */

  private handleWheel(e: WheelEvent): void {
    if (!this.deps.isEnabled()) return;
    e.preventDefault();
    this.updateModifiers(e);
    const screen = this.screenFromEvent(e);
    const pixelDelta = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;

    // Heurística (à la tldraw) extraída para classifyWheelZoom (testável).
    const zoom = classifyWheelZoom({
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    });

    const info: CanvasWheelInfo = {
      ...this.baseInfo(screen),
      delta: { x: e.deltaX * pixelDelta, y: e.deltaY * pixelDelta },
      zoom,
    };
    this.deps.dispatch('wheel', info);
  }

  /* ---------- teclado ---------- */

  private keyInfo(e: KeyboardEvent): CanvasKeyInfo {
    this.updateModifiers(e);
    return {
      key: e.key,
      code: e.code,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      accelKey: this.getAccelKey(),
    };
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (e.repeat) return;
    this.keys.add(e.code);
    if (!this.deps.isEnabled()) return;
    if (e.code === 'Space') {
      this.isSpacebarPanning = true;
      e.preventDefault();
    }
    this.deps.dispatch('keydown', this.keyInfo(e));
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    if (e.code === 'Space') this.isSpacebarPanning = false;
    if (!this.deps.isEnabled()) return;
    this.deps.dispatch('keyup', this.keyInfo(e));
  }

  /* ---------- tick (velocidade decai) ---------- */

  tick(): void {
    if (this.destroyed) return;
    if (performance.now() - this.lastMoveTime > 80 && (this.velocity.x !== 0 || this.velocity.y !== 0)) {
      this.velocity = { x: 0, y: 0 };
    }
    this.deps.dispatch('tick');
  }
}
