import type { Canvas } from '@openvtt/canvas';
import {
  DEFAULT_SETTINGS,
  HtmlImageSource,
  ImageComposer,
  type ComposeImageSource,
  type ImageEditorSettings,
  type ImageTransform,
} from './composer';

export interface ImageEditorDeps {
  /** Composer injetável (default: DOM canvas). */
  composer?: ImageComposer;
  /** Carregador de imagem injetável (default: HTMLImageElement). */
  loadImage?: (src: string) => Promise<HTMLImageElement>;
  /** Canvas hospedeiro para applyToDocument/loadFromDocument. */
  canvas?: Canvas;
  /** Defaults de settings aplicados sobre os built-ins. */
  defaultSettings?: Partial<ImageEditorSettings>;
}

export interface ImageEditorState {
  sourceUrl: string | null;
  hasSource: boolean;
  transform: ImageTransform;
  settings: ImageEditorSettings;
}

export const DEFAULT_TRANSFORM: ImageTransform = { x: 0, y: 0, zoom: 1, rotation: 0, flipX: false };

/**
 * Controller headless do editor de imagens: gerencia fonte, transform
 * (crop), settings, preview e export/aplicação. Não conhece UI — a Web
 * Component built-in e interfaces customizadas dirigem este objeto
 * (framework-agnostic). O campo de arte é resolvido pelo metadado
 * `imageField` do tipo de documento (fallback explícito: 'texture') —
 * nenhum tipo de documento é referenciado aqui.
 */
export class ImageEditor {
  private readonly composer: ImageComposer;
  private readonly loadImageFn: (src: string) => Promise<HTMLImageElement>;
  private readonly host: Canvas | undefined;

  private source: HTMLImageElement | null = null;
  private sourceUrl: string | null = null;
  private _transform: ImageTransform = { ...DEFAULT_TRANSFORM };
  private _settings: ImageEditorSettings = { ...DEFAULT_SETTINGS, ring: { ...DEFAULT_SETTINGS.ring } };
  private readonly listeners = new Set<() => void>();

  constructor(deps: ImageEditorDeps = {}) {
    this.composer = deps.composer ?? new ImageComposer();
    this.loadImageFn = deps.loadImage ?? defaultLoadImage;
    this.host = deps.canvas;
    if (deps.defaultSettings) this.setSettings(deps.defaultSettings);
  }

  get state(): ImageEditorState {
    return {
      sourceUrl: this.sourceUrl,
      hasSource: this.source !== null,
      transform: { ...this._transform },
      settings: this.settings,
    };
  }

  get settings(): ImageEditorSettings {
    return { ...this._settings, ring: { ...this._settings.ring } };
  }

  get transform(): ImageTransform {
    return { ...this._transform };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ------------------------------ fonte ------------------------------- */

  async loadFromUrl(url: string): Promise<void> {
    const image = await this.loadImageFn(url);
    this.setSource(image, url);
  }

  async loadFromFile(file: File): Promise<void> {
    const url = await readAsDataURL(file);
    await this.loadFromUrl(url);
  }

  /** Carrega a arte atual de um documento existente (se houver). */
  async loadFromDocument(type: string, id: string, field?: string): Promise<boolean> {
    const doc = this.host?.documents.get(type, id);
    const fieldOrMeta = field ?? this.host?.documents.imageFieldOf(type) ?? 'texture';
    const texture = doc ? (doc.document as Record<string, unknown>)[fieldOrMeta] : undefined;
    if (typeof texture !== 'string' || texture.length === 0) return false;
    await this.loadFromUrl(texture);
    return true;
  }

  clearSource(): void {
    this.source = null;
    this.sourceUrl = null;
    this._transform = { ...DEFAULT_TRANSFORM };
    this.notify();
  }

  private setSource(image: HTMLImageElement, url: string): void {
    this.source = image;
    this.sourceUrl = url;
    this._transform = { ...DEFAULT_TRANSFORM };
    this.notify();
  }

  /* ---------------------------- crop/ajustes ---------------------------- */

  setTransform(partial: Partial<ImageTransform>): void {
    this._transform = {
      ...this._transform,
      ...partial,
      zoom: Math.max(0.05, Math.min(20, partial.zoom ?? this._transform.zoom)),
    };
    this.notify();
  }

  /** Pan por delta em px de tela, convertido em fração do token. */
  panBy(dxPx: number, dyPx: number, viewSize: number): void {
    const unit = viewSize > 0 ? 1 / viewSize : 0;
    this.setTransform({ x: this._transform.x + dxPx * unit, y: this._transform.y + dyPx * unit });
  }

  zoomBy(factor: number): void {
    this.setTransform({ zoom: this._transform.zoom * factor });
  }

  rotateBy(deltaRad: number): void {
    this.setTransform({ rotation: this._transform.rotation + deltaRad });
  }

  toggleFlip(): void {
    this.setTransform({ flipX: !this._transform.flipX });
  }

  resetTransform(): void {
    this._transform = { ...DEFAULT_TRANSFORM };
    this.notify();
  }

  setSettings(partial: Partial<ImageEditorSettings>): void {
    this._settings = { ...this._settings, ...partial, ring: { ...this._settings.ring, ...partial.ring } };
    this.notify();
  }

  /* ---------------------------- saída ------------------------------- */

  /** Renderiza o preview no canvas alvo (UI responsável por fornecê-lo). */
  preview(target: HTMLCanvasElement, size = target.width || 320): void {
    if (!this.source) return;
    const composed = this.composer.compose(
      new HtmlImageSource(this.source),
      { ...this._settings, size },
      this._transform,
    ) as HTMLCanvasElement;
    if (target.width !== size || target.height !== size) {
      target.width = size;
      target.height = size;
    }
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(composed, 0, 0, size, size);
  }

  exportDataURL(): string | null {
    if (!this.source) return null;
    return this.composer.toDataURL(new HtmlImageSource(this.source), this._settings, this._transform);
  }

  async exportBlob(): Promise<Blob | null> {
    if (!this.source) return null;
    return this.composer.toBlob(new HtmlImageSource(this.source), this._settings, this._transform);
  }

  /** Aplica a arte composta a um documento (atualiza o doc + histórico). */
  applyToDocument(type: string, id: string, field?: string): string | null {
    if (!this.host) throw new Error('[image-editor] editor has no host canvas');
    const dataUrl = this.exportDataURL();
    if (!dataUrl) return null;
    const fieldOrMeta = field ?? this.host.documents.imageFieldOf(type) ?? 'texture';
    this.host.documents.update(type, id, { [fieldOrMeta]: dataUrl } as never);
    return dataUrl;
  }

  /** Compose cravado com fonte própria (interfaces customizadas avançadas). */
  composeSource(source: ComposeImageSource, overrides?: Partial<ImageTransform>): unknown {
    return this.composer.compose(source, this._settings, { ...this._transform, ...overrides });
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function defaultLoadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`[image-editor] failed to load image: ${src.slice(0, 64)}`));
    image.src = src;
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('[image-editor] failed to read file'));
    reader.readAsDataURL(file);
  });
}
