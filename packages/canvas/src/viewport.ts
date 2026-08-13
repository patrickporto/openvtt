import { Application } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { CONFIG } from './config';
import type { Point } from './input/types';
import { clamp } from './utils';

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
  worldWidth: number;
  worldHeight: number;
  screenWidth: number;
  screenHeight: number;
}

export interface CanvasViewportOptions {
  minScale?: number;
  maxScale?: number;
  onMoved?: (state: ViewportState) => void;
  onZoomed?: (state: ViewportState) => void;
}

/**
 * Transforma a câmera do canvas. Não possui gestos próprios: todo input é
 * normalizado pelo InputsManager e aplicado aqui pelos métodos pan/zoom.
 */
export class CanvasViewport {
  readonly pixi: Viewport;
  private readonly app: Application;
  private readonly options: CanvasViewportOptions;
  private readonly minScale: number;
  private readonly maxScale: number;

  constructor(app: Application, screen: { width: number; height: number }, options: CanvasViewportOptions = {}) {
    this.app = app;
    this.options = options;
    this.minScale = options.minScale ?? CONFIG.minScale;
    this.maxScale = options.maxScale ?? CONFIG.maxScale;
    this.pixi = new Viewport({
      screenWidth: screen.width,
      screenHeight: screen.height,
      worldWidth: screen.width,
      worldHeight: screen.height,
      events: app.renderer.events,
    });
    this.pixi.eventMode = 'none';
  }

  get state(): ViewportState {
    return {
      x: this.pixi.x,
      y: this.pixi.y,
      scale: this.pixi.scale.x,
      worldWidth: this.pixi.worldWidth,
      worldHeight: this.pixi.worldHeight,
      screenWidth: this.pixi.screenWidth,
      screenHeight: this.pixi.screenHeight,
    };
  }

  get scale(): number {
    return this.pixi.scale.x;
  }

  toLocal(point: Point): Point {
    return this.pixi.toLocal(point);
  }

  toScreen(point: Point): Point {
    return this.pixi.toScreen(point);
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    this.pixi.resize(width, height);
  }

  setWorld(width: number, height: number): void {
    this.pixi.worldWidth = width;
    this.pixi.worldHeight = height;
  }

  private setView(scale: number, x: number, y: number): void {
    this.pixi.scale.set(scale);
    this.pixi.position.set(x, y);
    this.emitChange();
  }

  private emitChange(): void {
    this.options.onMoved?.(this.state);
    this.options.onZoomed?.(this.state);
  }

  /** Desloca a câmera por um delta em pixels de tela (conteúdo acompanha o ponteiro). */
  panBy(dxScreen: number, dyScreen: number): void {
    this.pixi.position.set(this.pixi.x + dxScreen, this.pixi.y + dyScreen);
    this.options.onMoved?.(this.state);
  }

  /** Aplica zoom mantendo fixo o ponto de tela sob o cursor. */
  zoomAt(screenPoint: Point, factor: number): void {
    const world = this.pixi.toLocal(screenPoint);
    const scale = clamp(this.pixi.scale.x * factor, this.minScale, this.maxScale);
    const x = screenPoint.x - world.x * scale;
    const y = screenPoint.y - world.y * scale;
    this.setView(scale, x, y);
  }

  /** Gesto de pinça: pan pelo deslocamento do centro + zoom no centro. */
  pinchAt(screenCenter: Point, scaleDelta: number, centerDelta: Point): void {
    this.panBy(centerDelta.x, centerDelta.y);
    this.zoomAt(screenCenter, scaleDelta);
  }

  /** Scroll de trackpad/rodinha: pan quando zoom=false, zoom no cursor quando zoom=true. */
  applyWheel(screenPoint: Point, delta: Point, zoom: boolean): void {
    if (zoom) {
      const factor = Math.pow(1.0015, -delta.y);
      this.zoomAt(screenPoint, factor);
    } else {
      this.panBy(-delta.x, -delta.y);
    }
  }

  pan(x: number, y: number, scale?: number): void {
    this.setView(scale ?? this.pixi.scale.x, x, y);
  }

  animatePan(options: { x?: number; y?: number; scale?: number; duration?: number }): Promise<void> {
    const duration = options.duration ?? 250;
    const start = performance.now();
    const fromX = this.pixi.x;
    const fromY = this.pixi.y;
    const fromScale = this.pixi.scale.x;
    const toX = options.x ?? fromX;
    const toY = options.y ?? fromY;
    const toScale = clamp(options.scale ?? fromScale, this.minScale, this.maxScale);
    return new Promise((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.setView(
          fromScale + (toScale - fromScale) * eased,
          fromX + (toX - fromX) * eased,
          fromY + (toY - fromY) * eased,
        );
        if (t < 1) this.app.ticker.addOnce(tick);
        else resolve();
      };
      this.app.ticker.addOnce(tick);
    });
  }

  fit(worldWidth: number, worldHeight: number, padding = 0.05): void {
    const scaleX = this.pixi.screenWidth / (worldWidth * (1 + padding));
    const scaleY = this.pixi.screenHeight / (worldHeight * (1 + padding));
    const scale = clamp(Math.min(scaleX, scaleY), this.minScale, this.maxScale);
    const x = (this.pixi.screenWidth - worldWidth * scale) / 2;
    const y = (this.pixi.screenHeight - worldHeight * scale) / 2;
    this.setView(scale, x, y);
    this.pixi.worldWidth = worldWidth;
    this.pixi.worldHeight = worldHeight;
  }

  centerOn(x: number, y: number): void {
    const scale = this.pixi.scale.x;
    this.setView(scale, this.pixi.screenWidth / 2 - x * scale, this.pixi.screenHeight / 2 - y * scale);
  }

  dispose(): void {
    this.pixi.destroy({ children: true });
  }
}
