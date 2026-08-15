import { Graphics, Sprite, Text } from 'pixi.js';
import { PlaceableObject, CONFIG, Easing, dynamicBus, lerp, toHex, type CanvasLike } from '@openvtt/canvas';
import type { TokenData } from '../schemas';

export interface TokenMoveOptions {
  animated?: boolean;
  duration?: number;
  ease?: (t: number) => number;
  onComplete?: () => void;
}

export class Token extends PlaceableObject<TokenData> {
  readonly objectType = 'token';
  private baseSize = 0;
  private moveAnim: string | null = null;

  constructor(document: TokenData, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
  }

  get size(): number {
    return (this.document.size ?? 1) * this.canvas.grid.size;
  }

  get bounds() {
    const s = this.size;
    return { x: -s / 2, y: -s / 2, width: s, height: s };
  }

  /**
   * Imagem customizada: ao trocar `texture` o asset é recarregado e o token
   * redesenhado (upload/edição via image editor aplica por aqui).
   */
  override update(changes: Partial<TokenData>): void {
    const textureChanged = changes.texture !== undefined && changes.texture !== this.document.texture;
    super.update(changes);
    if (textureChanged) void this.draw();
  }

  protected override async loadAssets(): Promise<void> {
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.content.scale.set(1, 1);
    const s = this.size;
    this.baseSize = s;
    const texture = await this.loadTexture(this.document.texture);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.width = s;
      sprite.height = s;
      const mask = new Graphics();
      mask.circle(s / 2, s / 2, s / 2).fill(0xffffff);
      sprite.mask = mask;
      const tint = this.document.tint;
      if (tint !== undefined) sprite.tint = toHex(tint);
      this.content.addChild(mask, sprite);
    } else {
      const circle = new Graphics();
      circle.circle(s / 2, s / 2, s / 2).fill({ color: CONFIG.token.fallbackColor, alpha: CONFIG.token.alpha });
      this.content.addChild(circle);
    }
    if (this.document.label) {
      const label = new Text({
        text: this.document.label,
        style: { fontSize: Math.max(10, s / 4), fill: 0xffffff, fontFamily: 'system-ui, sans-serif' },
      });
      label.anchor.set(0.5, 1);
      label.position.set(s / 2, s + 4);
      this.content.addChild(label);
    }
    this.rotation = this.document.rotation ?? 0;
    this.visible = !(this.document.hidden ?? false);
  }

  override refresh(): void {
    const s = this.size;
    const base = this.baseSize || s || 1;
    this.rotation = this.document.rotation ?? 0;
    this.visible = !(this.document.hidden ?? false);
    this.content.scale.set(s / base, s / base);
    this.content.position.set(-s / 2, -s / 2);
    this.refreshSelection();
  }

  /**
   * Movimento programático. Por padrão é animado (TokenEase-style): duração
   * proporcional à distância, cancelável por novo movimento ou drag.
   * `moveTo(x, y, { animated: false })` teleporta.
   */
  moveTo(x: number, y: number, options: TokenMoveOptions = {}): void {
    const animated = options.animated !== false;
    if (!animated || !this.canvas.animation) {
      this.moveToImmediate(x, y);
      options.onComplete?.();
      return;
    }
    const from = { x: this.x, y: this.y };
    this.moveAnim = this.canvas.animation.animate({
      name: this.moveAnim ?? `token-move-${this.id}`,
      duration: options.duration ?? this.moveDuration(x, y),
      ease: options.ease ?? Easing.inOutQuad,
      onUpdate: (_progress, eased) => {
        this.position.set(lerp(from.x, x, eased), lerp(from.y, y, eased));
        this.refresh();
      },
      onComplete: () => {
        this.moveAnim = null;
        this.position.set(x, y);
        this.emitMoved(x, y);
        options.onComplete?.();
      },
    });
  }

  moveToImmediate(x: number, y: number): void {
    if (this.moveAnim) {
      this.canvas.animation?.cancel(this.moveAnim);
      this.moveAnim = null;
    }
    this.position.set(x, y);
    this.emitMoved(x, y);
  }

  /** Cancela movimento animado em andamento (ex.: início de drag). */
  cancelMove(): void {
    if (this.moveAnim) {
      this.canvas.animation?.cancel(this.moveAnim);
      this.moveAnim = null;
    }
  }

  private moveDuration(x: number, y: number): number {
    const dist = Math.hypot(x - this.x, y - this.y);
    return Math.min(750, Math.max(150, dist));
  }

  private emitMoved(x: number, y: number): void {
    dynamicBus(this.canvas.bus).emit('token:moved', { id: this.id, x, y });
  }
}
