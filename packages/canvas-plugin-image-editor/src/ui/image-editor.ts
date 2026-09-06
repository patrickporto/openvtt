import type { Canvas } from '@openvtt/canvas';
import { ImageEditor } from '../editor';
import { imageMasks } from '../masks';
import { DEFAULT_SETTINGS } from '../composer';

export const IMAGE_EDITOR_TAG = 'openvtt-image-editor';

const STYLE = `
  :host {
    display: block;
    font-family: var(--ovtt-font, system-ui, sans-serif);
    font-size: var(--ovtt-font-size, 12px);
    color: var(--ovtt-text, #e8e2d4);
    min-width: 300px;
  }
  .panel {
    background: var(--ovtt-bg, rgba(22, 19, 14, 0.92));
    border: 1px solid var(--ovtt-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--ovtt-radius, 10px);
    padding: 10px;
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; }
  .row > span { flex: 1; }
  .preview-wrap {
    position: relative; align-self: center;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid var(--ovtt-border, rgba(255,255,255,0.12));
    cursor: grab;
    touch-action: none;
    background:
      repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
  }
  .preview-wrap:active { cursor: grabbing; }
  canvas.preview { display: block; }
  .hint { text-align: center; color: var(--ovtt-text-dim, #9a8f78); font-size: 10px; }
  input[type='range'] { width: 120px; accent-color: var(--ovtt-accent, #f0c168); cursor: pointer; }
  input[type='color'] {
    width: 28px; height: 20px; padding: 0; border: 1px solid var(--ovtt-border, rgba(255,255,255,0.12));
    border-radius: 5px; background: none; cursor: pointer;
  }
  select, button {
    background: var(--ovtt-input-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--ovtt-border, rgba(255,255,255,0.08));
    border-radius: 6px; color: var(--ovtt-text, #e8e2d4);
    font: inherit; padding: 3px 8px; cursor: pointer;
  }
  select:hover, button:hover { background: var(--ovtt-btn-hover, rgba(255,255,255,0.12)); }
  button.accent { border-color: var(--ovtt-accent, #f0c168); color: var(--ovtt-accent, #f0c168); }
  button:disabled { opacity: 0.35; cursor: default; }
  .btn-row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
`;

/**
 * Editor de arte de tokens (built-in, customizável): preview com crop por
 * drag (pan), wheel (zoom), slider de rotação e flip; máscaras do registry,
 * anel (cor/espessura/gradiente), fundo, formato e resolução. Estilizável via
 * CSS custom properties (--ovtt-*) e shadow parts (panel, preview, controls).
 * Para UI própria, use `ImageEditor` (headless) diretamente.
 */
export class OpenVTTImageEditor extends HTMLElement {
  static observedAttributes = ['size'];

  private _canvas: Canvas | null = null;
  private editor: ImageEditor | null = null;
  private targetType: string | null = null;
  private targetId: string | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private drag: { active: boolean; lastX: number; lastY: number } = { active: false, lastX: 0, lastY: 0 };
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  get canvas(): Canvas | null {
    return this._canvas;
  }

  set canvas(value: Canvas | null) {
    this._canvas = value;
    this.editor = new ImageEditor({ canvas: value ?? undefined });
    this.unsubscribe?.();
    this.unsubscribe = this.editor.subscribe(() => this.renderPreview());
    this.render();
  }

  /** Abre o editor para um documento (carrega a arte atual, se existir). */
  edit(type: string, id: string): void {
    this.targetType = type;
    this.targetId = id;
    if (this.editor) void this.editor.loadFromDocument(type, id).finally(() => this.render());
    else this.render();
  }

  connectedCallback(): void {
    if (!this.shadowRoot!.childElementCount) this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render(): void {
    if (!this.shadowRoot) return;
    const editor = this.editor;
    const settings = editor?.settings ?? DEFAULT_SETTINGS;
    const disabled = editor ? '' : 'disabled';
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="panel" part="panel">
        <div class="head">
          <div class="btn-row">
            <button class="upload" ${disabled}>Upload</button>
            <input type="file" accept="image/*" hidden class="file" />
          </div>
        </div>
        <div class="preview-wrap" part="preview">
          <canvas class="preview" width="240" height="240"></canvas>
        </div>
        <div class="hint">drag = crop · wheel = zoom</div>
        <div part="controls" style="display:flex;flex-direction:column;gap:8px;">
          <div class="row">
            <span>Mask</span>
            <select class="mask" ${disabled}>
              ${imageMasks.list().map((m) => `<option value="${m.id}" ${m.id === (typeof settings.mask === 'string' ? settings.mask : settings.mask.id) ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select>
          </div>
          <div class="grid2">
            <div class="row"><span>Zoom</span><input type="range" class="zoom" min="20" max="400" value="100" ${disabled} /></div>
            <div class="row"><span>Rotate</span><input type="range" class="rotate" min="-180" max="180" value="0" ${disabled} /></div>
            <div class="row"><span>Ring</span><input type="color" class="ring-color" value="${settings.ring.color}" ${disabled} /></div>
            <div class="row"><span>Width</span><input type="range" class="ring-width" min="0" max="15" value="${settings.ring.width}" ${disabled} /></div>
            <div class="row"><span>Ring 2</span><input type="color" class="ring-color2" value="${settings.ring.color2 ?? settings.ring.color}" ${disabled} /></div>
            <div class="row"><span>Style</span><select class="ring-style" ${disabled}>
              <option value="flat" ${settings.ring.style === 'flat' ? 'selected' : ''}>Flat</option>
              <option value="gradient" ${settings.ring.style === 'gradient' ? 'selected' : ''}>Gradient</option>
            </select></div>
            <div class="row"><span>Bg</span><input type="color" class="bg" ${disabled} /></div>
            <div class="row"><span>Size</span><select class="size" ${disabled}>
              ${[256, 400, 512, 800].map((s) => `<option value="${s}" ${s === settings.size ? 'selected' : ''}>${s}px</option>`).join('')}
            </select></div>
          </div>
          <div class="row">
            <span>Format</span>
            <select class="format" ${disabled}>
              <option value="image/webp" ${settings.format === 'image/webp' ? 'selected' : ''}>WebP</option>
              <option value="image/png" ${settings.format === 'image/png' ? 'selected' : ''}>PNG</option>
            </select>
          </div>
          <div class="btn-row">
            <button class="flip" ${disabled}>Flip</button>
            <button class="reset" ${disabled}>Reset</button>
            <button class="download" ${disabled}>Download</button>
            <button class="apply accent" ${disabled} ${this.targetId ? '' : 'disabled'}>Apply</button>
          </div>
        </div>
      </div>`;
    this.wire();
    this.renderPreview();
  }

  private wire(): void {
    if (!this.shadowRoot || !this.editor) return;
    const editor = this.editor;
    const $ = <T extends HTMLElement>(sel: string): T => this.shadowRoot!.querySelector<T>(sel)!;
    const previewWrap = $('.preview-wrap');
    this.previewCanvas = $<HTMLCanvasElement>('.preview');

    const upload = $('.upload');
    const file = $<HTMLInputElement>('.file');
    upload.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const selected = file.files?.[0];
      if (selected) void editor.loadFromFile(selected).catch(console.error);
    });
    previewWrap.addEventListener('dragover', (e) => e.preventDefault());
    previewWrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropped = e.dataTransfer?.files?.[0];
      if (dropped) void editor.loadFromFile(dropped).catch(console.error);
    });

    previewWrap.addEventListener('pointerdown', (e) => {
      this.drag = { active: true, lastX: e.clientX, lastY: e.clientY };
      previewWrap.setPointerCapture(e.pointerId);
    });
    previewWrap.addEventListener('pointermove', (e) => {
      if (!this.drag.active) return;
      editor.panBy(e.clientX - this.drag.lastX, e.clientY - this.drag.lastY, this.previewCanvas?.width ?? 240);
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
    });
    const endDrag = () => { this.drag.active = false; };
    previewWrap.addEventListener('pointerup', endDrag);
    previewWrap.addEventListener('pointercancel', endDrag);
    previewWrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      editor.zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    }, { passive: false });

    $('.mask').addEventListener('change', (e) => editor.setSettings({ mask: (e.target as HTMLSelectElement).value }));
    $('.zoom').addEventListener('input', (e) => editor.setTransform({ zoom: Number((e.target as HTMLInputElement).value) / 100 }));
    $('.rotate').addEventListener('input', (e) => editor.setTransform({ rotation: (Number((e.target as HTMLInputElement).value) * Math.PI) / 180 }));
    $('.ring-color').addEventListener('input', (e) => editor.setSettings({ ring: { ...editor.settings.ring, color: (e.target as HTMLInputElement).value } }));
    $('.ring-color2').addEventListener('input', (e) => editor.setSettings({ ring: { ...editor.settings.ring, color2: (e.target as HTMLInputElement).value } }));
    $('.ring-width').addEventListener('input', (e) => editor.setSettings({ ring: { ...editor.settings.ring, width: Number((e.target as HTMLInputElement).value) } }));
    $('.ring-style').addEventListener('change', (e) => editor.setSettings({ ring: { ...editor.settings.ring, style: (e.target as HTMLSelectElement).value as 'flat' | 'gradient' } }));
    $('.bg').addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      editor.setSettings({ background: value === '#000000' ? null : value });
    });
    $('.size').addEventListener('change', (e) => editor.setSettings({ size: Number((e.target as HTMLSelectElement).value) }));
    $('.format').addEventListener('change', (e) => editor.setSettings({ format: (e.target as HTMLSelectElement).value as 'image/png' | 'image/webp' }));

    $('.flip').addEventListener('click', () => editor.toggleFlip());
    $('.reset').addEventListener('click', () => { editor.resetTransform(); this.render(); });
    $('.download').addEventListener('click', () => {
      const dataUrl = editor.exportDataURL();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `image-${Date.now()}.${dataUrl.startsWith('data:image/webp') ? 'webp' : 'png'}`;
      link.click();
    });
    $('.apply').addEventListener('click', () => {
      if (!this.targetType || !this.targetId) return;
      const dataUrl = editor.applyToDocument(this.targetType, this.targetId);
      if (dataUrl) this.dispatchEvent(new CustomEvent('image-edited', { detail: { type: this.targetType, id: this.targetId }, bubbles: true, composed: true }));
    });
  }

  private renderPreview(): void {
    if (!this.previewCanvas || !this.editor) return;
    this.editor.preview(this.previewCanvas, 240);
  }
}

export function defineImageEditorElements(): void {
  if (!customElements.get(IMAGE_EDITOR_TAG)) customElements.define(IMAGE_EDITOR_TAG, OpenVTTImageEditor);
}
