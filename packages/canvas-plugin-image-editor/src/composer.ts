import { imageMasks, type MaskShape } from './masks';

/** Fábrica de canvas 2D injetada — DOM/OffscreenCanvas em produção, fake em testes. */
export interface Canvas2DFactory {
  create(width: number, height: number): { canvas: unknown; ctx: CanvasRenderingContext2D };
}

export const domCanvasFactory: Canvas2DFactory = {
  create(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[image-editor] 2D context unavailable');
    return { canvas, ctx };
  },
};

export interface ImageTransform {
  /** Pan em fração do tamanho do token (-1..1 típico). */
  x: number;
  y: number;
  /** Zoom multiplicativo (1 = cover fit). */
  zoom: number;
  /** Rotação em radianos. */
  rotation: number;
  flipX: boolean;
}

export interface ImageEditorSettings {
  /** Resolução de saída em px (quadrado). */
  size: number;
  /** Id da máscara (registry) ou instância de MaskShape. */
  mask: string | MaskShape;
  /** Cor de fundo atrás da imagem; null = transparente. */
  background: string | null;
  ring: {
    color: string;
    /** Cor secundária quando style = gradient. */
    color2?: string;
    /** Espessura em % do tamanho do token (0 = sem anel). */
    width: number;
    style: 'flat' | 'gradient';
  };
  format: 'image/png' | 'image/webp';
  quality: number;
}

export const DEFAULT_SETTINGS: ImageEditorSettings = {
  size: 400,
  mask: 'circle',
  background: null,
  ring: { color: '#b8935f', width: 4, style: 'flat' },
  format: 'image/webp',
  quality: 0.92,
};

/** Fonte de imagem mínima exigida do composer (HTMLImageElement em produção). */
export interface ComposeImageSource {
  readonly width: number;
  readonly height: number;
  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void;
}

export class HtmlImageSource implements ComposeImageSource {
  constructor(private readonly image: HTMLImageElement) {}
  get width(): number { return this.image.naturalWidth || this.image.width; }
  get height(): number { return this.image.naturalHeight || this.image.height; }
  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    ctx.drawImage(this.image, dx, dy, dw, dh);
  }
}

/**
 * Pipeline de composição puro: fundo → clip da máscara → imagem transformada
 * (crop via pan/zoom/rotação/flip) → anel. Sem estado, sem UI — a interface
 * built-in e interfaces customizadas consomem este serviço.
 */
export class ImageComposer {
  constructor(
    private readonly factory: Canvas2DFactory = domCanvasFactory,
    private readonly masks = imageMasks,
  ) {}

  compose(source: ComposeImageSource, settings: ImageEditorSettings, overrides?: Partial<ImageTransform>): unknown {
    const size = Math.max(16, Math.round(settings.size));
    const { canvas, ctx } = this.factory.create(size, size);
    const shape = this.masks.resolve(settings.mask);
    const path = shape.path?.(size);
    if (!path) throw new Error(`[image-editor] mask "${shape.id}" cannot build a path`);

    if (settings.background) {
      ctx.fillStyle = settings.background;
      ctx.fillRect(0, 0, size, size);
    }

    ctx.save();
    ctx.clip(path);
    const t = { x: 0, y: 0, zoom: 1, rotation: 0, flipX: false, ...overrides };
    const cover = size / Math.max(1, Math.min(source.width, source.height));
    const scale = cover * Math.max(0.05, t.zoom);
    ctx.translate(size / 2 + t.x * size, size / 2 + t.y * size);
    ctx.rotate(t.rotation);
    ctx.scale(t.flipX ? -scale : scale, scale);
    source.draw(ctx, -source.width / 2, -source.height / 2, source.width, source.height);
    ctx.restore();

    const ringWidth = (settings.ring.width / 100) * size;
    if (ringWidth > 0) {
      const inset = ringWidth / 2;
      const ringPath = shape.path!(size - ringWidth);
      ctx.save();
      ctx.translate(inset, inset);
      ctx.lineWidth = ringWidth;
      ctx.strokeStyle = this.ringStyle(ctx, size, settings);
      ctx.stroke(ringPath);
      ctx.restore();
    }

    return canvas;
  }

  toDataURL(source: ComposeImageSource, settings: ImageEditorSettings, overrides?: Partial<ImageTransform>): string {
    const canvas = this.compose(source, settings, overrides) as HTMLCanvasElement;
    return canvas.toDataURL(settings.format, settings.quality);
  }

  async toBlob(source: ComposeImageSource, settings: ImageEditorSettings, overrides?: Partial<ImageTransform>): Promise<Blob | null> {
    const canvas = this.compose(source, settings, overrides) as HTMLCanvasElement;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), settings.format, settings.quality));
  }

  private ringStyle(ctx: CanvasRenderingContext2D, size: number, settings: ImageEditorSettings): string | CanvasGradient {
    const { color, color2, style } = settings.ring;
    if (style === 'gradient' && color2) {
      const gradient = ctx.createLinearGradient(0, 0, 0, size);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color2);
      return gradient;
    }
    return color;
  }
}
