import type { Canvas } from '../canvas';

export const LAYER_PANEL_TAG = 'openvtt-layer-panel';

const STYLE = `
  :host {
    display: block;
    font-family: var(--ovtt-font, system-ui, sans-serif);
    font-size: var(--ovtt-font-size, 12px);
    color: var(--ovtt-text, #e8e2d4);
  }
  .panel {
    background: var(--ovtt-bg, rgba(22, 19, 14, 0.85));
    border: 1px solid var(--ovtt-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--ovtt-radius, 10px);
    padding: 8px;
    backdrop-filter: blur(8px);
  }
  .title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ovtt-text-dim, #9a8f78);
    margin: 2px 4px 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    border-radius: 6px;
  }
  .row:hover { background: var(--ovtt-row-hover, rgba(255, 255, 255, 0.05)); }
  .row.locked .label { opacity: 0.5; font-style: italic; }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ovtt-text-dim, #9a8f78);
    cursor: pointer;
    padding: 0;
  }
  button:hover { background: var(--ovtt-btn-hover, rgba(255, 255, 255, 0.1)); color: var(--ovtt-text, #e8e2d4); }
  button.on { color: var(--ovtt-accent, #f0c168); }
  button:disabled { opacity: 0.25; cursor: default; background: transparent; }
  button svg { width: 14px; height: 14px; }
  input[type='range'] {
    width: 56px;
    accent-color: var(--ovtt-accent, #f0c168);
    cursor: pointer;
  }
`;

const SVG = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 3 18 18M10.5 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.9 3.9M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.7-1.5"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 10 6 6 6-6"/></svg>',
};

/**
 * Painel de camadas framework-agnostic (Web Component). Atribua a instância de
 * Canvas à propriedade `canvas`. Tematizável via CSS custom properties
 * (--ovtt-bg, --ovtt-accent, --ovtt-text, --ovtt-border, --ovtt-radius, ...).
 */
export class OpenVTTLayerPanel extends HTMLElement {
  private _canvas: Canvas | null = null;
  private unsubs: Array<() => void> = [];
  private suppressRender = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  get canvas(): Canvas | null {
    return this._canvas;
  }

  set canvas(value: Canvas | null) {
    this._canvas = value;
    this.bind();
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }

  private bind(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    if (!this._canvas) return;
    this.unsubs.push(
      this._canvas.on('layers:change', () => {
        if (!this.suppressRender) this.render();
      }),
    );
  }

  private render(): void {
    if (!this.shadowRoot) return;
    const layers = this._canvas ? this._canvas.layers.list().slice().reverse() : [];
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="panel" part="panel">
        <div class="title" part="title">Layers</div>
        ${layers
          .map(
            (layer, i) => `
          <div class="row${layer.locked ? ' locked' : ''}" data-id="${layer.id}">
            <button class="vis${layer.visible ? ' on' : ''}" title="${layer.visible ? 'Hide' : 'Show'}">${layer.visible ? SVG.eye : SVG.eyeOff}</button>
            <button class="lock${layer.locked ? ' on' : ''}" title="${layer.locked ? 'Unlock' : 'Lock'}">${layer.locked ? SVG.lock : SVG.unlock}</button>
            <span class="label" title="${layer.label}">${layer.label}</span>
            <input type="range" class="opacity" min="0" max="100" value="${Math.round(layer.opacity * 100)}" title="Opacity" />
            <button class="up" title="Move up" ${i === 0 ? 'disabled' : ''}>${SVG.up}</button>
            <button class="down" title="Move down" ${i === layers.length - 1 ? 'disabled' : ''}>${SVG.down}</button>
          </div>`,
          )
          .join('')}
      </div>`;
    this.wire();
  }

  private wire(): void {
    if (!this.shadowRoot || !this._canvas) return;
    const canvas = this._canvas;
    for (const row of this.shadowRoot.querySelectorAll<HTMLElement>('.row')) {
      const id = row.dataset.id!;
      row.querySelector('.vis')!.addEventListener('click', () => {
        canvas.layers.setVisible(id, !canvas.layers.get(id)?.visible);
      });
      row.querySelector('.lock')!.addEventListener('click', () => {
        canvas.layers.setLocked(id, !canvas.layers.get(id)?.locked);
      });
      row.querySelector('.up')!.addEventListener('click', () => canvas.layers.move(id, 'up'));
      row.querySelector('.down')!.addEventListener('click', () => canvas.layers.move(id, 'down'));
      row.querySelector('.opacity')!.addEventListener('input', (event) => {
        this.suppressRender = true;
        canvas.layers.setOpacity(id, Number((event.target as HTMLInputElement).value) / 100);
        this.suppressRender = false;
      });
    }
  }
}
