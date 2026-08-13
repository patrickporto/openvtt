import type { Canvas } from '../canvas';

export const FOG_PANEL_TAG = 'openvtt-fog-panel';

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
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ovtt-text-dim, #9a8f78);
    margin: 2px 4px 2px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 4px;
    min-height: 24px;
  }
  .row > span { flex: 1; }
  input[type='range'] { width: 90px; accent-color: var(--ovtt-accent, #f0c168); cursor: pointer; }
  input[type='number'] {
    width: 52px;
    background: var(--ovtt-input-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--ovtt-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    color: var(--ovtt-text, #e8e2d4);
    padding: 3px 6px;
    font: inherit;
  }
  button {
    border: 1px solid var(--ovtt-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    background: var(--ovtt-input-bg, rgba(255, 255, 255, 0.06));
    color: var(--ovtt-text, #e8e2d4);
    font: inherit;
    padding: 4px 8px;
    cursor: pointer;
  }
  button:hover { background: var(--ovtt-btn-hover, rgba(255, 255, 255, 0.12)); }
  button.on {
    border-color: var(--ovtt-accent, #f0c168);
    color: var(--ovtt-accent, #f0c168);
  }
  button:disabled { opacity: 0.35; cursor: default; }
  .btn-row { display: flex; gap: 6px; padding: 0 4px; flex-wrap: wrap; }
  .switch { position: relative; width: 32px; height: 18px; flex: none; }
  .switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 1;
  }
  .switch input:disabled { cursor: default; }
  .switch .track {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: var(--ovtt-input-bg, rgba(255, 255, 255, 0.1));
    transition: background 0.15s;
  }
  .switch .track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ovtt-text-dim, #9a8f78);
    transition: transform 0.15s, background 0.15s;
  }
  .switch input:checked + .track { background: var(--ovtt-accent-dim, rgba(240, 193, 104, 0.35)); }
  .switch input:checked + .track::after { transform: translateX(14px); background: var(--ovtt-accent, #f0c168); }
`;

/**
 * Painel de fog of war framework-agnostic (Web Component): liga/desliga,
 * simula visão do jogador, escuridão, pincel manual e raio de visão dos
 * tokens. Atribua a instância de Canvas à propriedade `canvas`.
 */
export class OpenVTTFogPanel extends HTMLElement {
  private _canvas: Canvas | null = null;
  private unsubs: Array<() => void> = [];
  private suppressRender = false;
  private visionRadius = 6;

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
      this._canvas.on('fog:change', () => {
        if (!this.suppressRender) this.render();
      }),
      this._canvas.on('tool:changed', () => {
        if (!this.suppressRender) this.render();
      }),
    );
  }

  private render(): void {
    if (!this.shadowRoot) return;
    const fog = this._canvas?.fog;
    const tool = this._canvas?.getCurrentToolId() ?? 'select';
    const enabled = fog?.enabled ?? false;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="panel" part="panel">
        <div class="title" part="title">Fog of War</div>
        <div class="row">
          <span>Enabled</span>
          <label class="switch"><input type="checkbox" class="enabled" ${enabled ? 'checked' : ''} /><span class="track"></span></label>
        </div>
        <div class="row">
          <span>Player view</span>
          <label class="switch"><input type="checkbox" class="player" ${fog?.playerView ? 'checked' : ''} ${enabled ? '' : 'disabled'} /><span class="track"></span></label>
        </div>
        <div class="row">
          <span>Darkness</span>
          <input type="range" class="darkness" min="30" max="100" value="${Math.round((fog?.darkness ?? 0.92) * 100)}" ${enabled ? '' : 'disabled'} />
        </div>
        <div class="row">
          <span>Brush size</span>
          <input type="range" class="brush" min="20" max="300" step="10" value="${this._canvas?.tools?.options.fog.brushSize ?? 100}" ${enabled ? '' : 'disabled'} />
        </div>
        <div class="row">
          <span>Vision (cells)</span>
          <input type="number" class="radius" min="0" max="30" value="${this.visionRadius}" ${enabled ? '' : 'disabled'} />
        </div>
        <div class="btn-row">
          <button class="apply-selected" ${enabled ? '' : 'disabled'}>Apply to selected</button>
          <button class="apply-all" ${enabled ? '' : 'disabled'}>All tokens</button>
        </div>
        <div class="btn-row">
          <button class="tool-reveal${tool === 'fogReveal' ? ' on' : ''}" ${enabled ? '' : 'disabled'}>Reveal (F)</button>
          <button class="tool-paint${tool === 'fogPaint' ? ' on' : ''}" ${enabled ? '' : 'disabled'}>Paint (G)</button>
          <button class="reset" ${enabled ? '' : 'disabled'}>Reset</button>
        </div>
      </div>`;
    this.wire();
  }

  private wire(): void {
    if (!this.shadowRoot || !this._canvas) return;
    const canvas = this._canvas;
    const fog = canvas.fog;
    const $ = <T extends HTMLElement>(sel: string): T => this.shadowRoot!.querySelector<T>(sel)!;

    $('.enabled').addEventListener('change', (e) => fog.setEnabled((e.target as HTMLInputElement).checked));
    $('.player').addEventListener('change', (e) => fog.setPlayerView((e.target as HTMLInputElement).checked));
    $('.darkness').addEventListener('input', (e) => {
      this.suppressRender = true;
      fog.setDarkness(Number((e.target as HTMLInputElement).value) / 100);
      this.suppressRender = false;
    });
    $('.brush').addEventListener('input', (e) => {
      canvas.tools.options.fog.brushSize = Number((e.target as HTMLInputElement).value);
    });
    $('.radius').addEventListener('change', (e) => {
      this.visionRadius = Math.max(0, Math.min(30, Number((e.target as HTMLInputElement).value) || 0));
    });
    $('.apply-selected').addEventListener('click', () => {
      for (const obj of canvas.selected) {
        if (obj.objectType === 'token') canvas.tokens.update(obj.id, { visionRadius: this.visionRadius });
      }
    });
    $('.apply-all').addEventListener('click', () => {
      for (const token of canvas.tokens.placeables) canvas.tokens.update(token.id, { visionRadius: this.visionRadius });
    });
    $('.tool-reveal').addEventListener('click', () => canvas.setCurrentTool('fogReveal'));
    $('.tool-paint').addEventListener('click', () => canvas.setCurrentTool('fogPaint'));
    $('.reset').addEventListener('click', () => fog.reset());
  }
}
