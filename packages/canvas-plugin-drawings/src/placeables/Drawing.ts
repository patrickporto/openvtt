import { Graphics, Text } from 'pixi.js';
import { PlaceableObject, toHex, type CanvasLike } from '@openvtt/canvas';
import type { DrawingData } from '../schemas';

export class Drawing extends PlaceableObject<DrawingData> {
  readonly objectType = 'drawing';
  private readonly shape = new Graphics();

  constructor(document: DrawingData, canvas: CanvasLike) {
    super(document, canvas, { interactive: true });
    this.shape.eventMode = 'none';
    this.content.addChild(this.shape);
  }

  get bounds() {
    const doc = this.document;
    if ((doc.type === 'brush' || doc.type === 'polygon') && doc.points && doc.points.length >= 2) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i + 1 < doc.points.length; i += 2) {
        minX = Math.min(minX, doc.points[i]);
        maxX = Math.max(maxX, doc.points[i]);
        minY = Math.min(minY, doc.points[i + 1]);
        maxY = Math.max(maxY, doc.points[i + 1]);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    const w = doc.width ?? 0;
    const h = doc.height ?? 0;
    return { x: 0, y: 0, width: w, height: h };
  }

  override refresh(): void {
    this.shape.clear();
    const doc = this.document;
    const stroke = doc.strokeColor !== undefined ? toHex(doc.strokeColor) : undefined;
    const fill = doc.fillColor !== undefined ? toHex(doc.fillColor) : undefined;
    const strokeWidth = doc.strokeWidth ?? 0;
    const fillAlpha = doc.fillAlpha ?? 1;

    switch (doc.type) {
      case 'rect': {
        const w = doc.width ?? 0;
        const h = doc.height ?? 0;
        this.shape.rect(0, 0, w, h);
        if (fill !== undefined) this.shape.fill({ color: fill, alpha: fillAlpha });
        if (stroke !== undefined && strokeWidth > 0) this.shape.stroke({ color: stroke, width: strokeWidth });
        break;
      }
      case 'ellipse': {
        const w = doc.width ?? 0;
        const h = doc.height ?? 0;
        this.shape.ellipse(w / 2, h / 2, w / 2, h / 2);
        if (fill !== undefined) this.shape.fill({ color: fill, alpha: fillAlpha });
        if (stroke !== undefined && strokeWidth > 0) this.shape.stroke({ color: stroke, width: strokeWidth });
        break;
      }
      case 'polygon': {
        const pts = doc.points ?? [];
        if (pts.length >= 2) {
          this.shape.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) this.shape.lineTo(pts[i], pts[i + 1]);
          this.shape.closePath();
          if (fill !== undefined) this.shape.fill({ color: fill, alpha: fillAlpha });
          if (stroke !== undefined && strokeWidth > 0) this.shape.stroke({ color: stroke, width: strokeWidth });
        }
        break;
      }
      case 'brush': {
        const pts = doc.points ?? [];
        if (pts.length >= 2 && stroke !== undefined) {
          this.shape.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) this.shape.lineTo(pts[i], pts[i + 1]);
          this.shape.stroke({ color: stroke, width: Math.max(1, strokeWidth) });
        }
        break;
      }
      case 'text': {
        this.shape.removeChildren();
        const text = new Text({
          text: doc.text ?? '',
          style: {
            fontSize: doc.fontSize ?? 16,
            fill: stroke ?? 0xffffff,
            fontFamily: 'system-ui, sans-serif',
          },
        });
        text.anchor.set(0, 0);
        this.shape.addChild(text);
        break;
      }
    }
    this.rotation = doc.rotation ?? 0;
    this.zIndex = doc.zIndex ?? 0;
    this.refreshSelection();
  }

  protected override loadAssets(): Promise<void> {
    return Promise.resolve();
  }
}
