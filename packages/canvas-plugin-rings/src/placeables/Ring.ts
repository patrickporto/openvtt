import { Graphics, type DestroyOptions } from 'pixi.js';
import { GlowFilter } from 'pixi-filters/glow';
import { PlaceableObject, clamp, toHex, type CanvasLike, type PlaceableObjectOptions } from '@openvtt/canvas';
import { dashedArcs, ringRadius, type RingSlot } from '../layout';
import { DEFAULT_RING_STYLE, type RingData, type RingStyle } from '../schemas';

export interface RingTokenGeometry {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  hidden: boolean;
}

export class Ring extends PlaceableObject<RingData> {
  readonly objectType = 'ring';
  resolvedStyle: RingStyle;
  slot: RingSlot = { index: 0, inset: 0 };
  private readonly g = new Graphics();
  private glowFilter: GlowFilter | null = null;
  private geometry: RingTokenGeometry | null = null;

  constructor(
    document: RingData & { id?: string },
    canvas: CanvasLike,
    options?: PlaceableObjectOptions,
  ) {
    super(document, canvas, { ...options, interactive: false });
    this.content.addChild(this.g);
    this.resolvedStyle = document.style ?? DEFAULT_RING_STYLE;
  }

  get bounds() {
    const geom = this.geometry;
    if (!geom) return { x: 0, y: 0, width: 0, height: 0 };
    const half = ringRadius(geom.radius, this.slot.inset) + this.resolvedStyle.width + 2;
    return { x: -half, y: -half, width: half * 2, height: half * 2 };
  }

  get alphaMultiplier(): number {
    return this.g.alpha;
  }

  applyGeometry(x: number, y: number, radius: number, rotation: number, hidden: boolean): void {
    const prev = this.geometry;
    if (
      prev &&
      this.visible === !hidden &&
      prev.x === x &&
      prev.y === y &&
      prev.radius === radius &&
      prev.rotation === rotation &&
      prev.hidden === hidden
    ) {
      return;
    }
    this.geometry = { x, y, radius, rotation, hidden };
    this.position.set(x, y);
    this.rotation = rotation;
    this.visible = !hidden;
    this.refresh();
  }

  setAlphaMultiplier(m: number): void {
    this.g.alpha = clamp(m, 0, 1);
  }

  override refresh(): void {
    this.g.clear();
    const geom = this.geometry;
    if (!geom || !this.visible) return;
    const style = this.resolvedStyle;
    const r = ringRadius(geom.radius, this.slot.inset);
    const color = toHex(style.color);
    const stroke = { color, width: style.width, alpha: style.alpha };
    if (style.shape === 'square') {
      this.g.rect(-r, -r, r * 2, r * 2).stroke(stroke);
    } else if (style.dash.length === 0) {
      this.g.circle(0, 0, r).stroke(stroke);
    } else {
      for (const arc of dashedArcs(r, style.dash)) {
        this.g.arc(0, 0, r, arc.start, arc.end).stroke(stroke);
      }
    }
    this.applyGlow(style, color);
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }

  override destroy(options?: DestroyOptions): void {
    if (this.glowFilter) {
      this.glowFilter.destroy();
      this.glowFilter = null;
    }
    super.destroy(options ?? { children: true });
  }

  private applyGlow(style: RingStyle, color: number): void {
    if (!style.glow) {
      if (this.glowFilter) {
        this.g.filters = null;
        this.glowFilter.destroy();
        this.glowFilter = null;
      }
      return;
    }
    const distance = Math.max(8, style.width * 3);
    if (!this.glowFilter) {
      this.glowFilter = new GlowFilter({
        color,
        distance,
        outerStrength: 1.5,
        innerStrength: 0,
        alpha: style.alpha,
      });
      this.g.filters = [this.glowFilter];
      return;
    }
    this.glowFilter.color = color;
    this.glowFilter.distance = distance;
    this.glowFilter.outerStrength = 1.5;
    this.glowFilter.innerStrength = 0;
    this.glowFilter.alpha = style.alpha;
  }
}
