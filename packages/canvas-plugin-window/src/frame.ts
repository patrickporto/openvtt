export const WINDOW_FRAME_TAG = 'openvtt-window-frame';

export type WindowFrameState = 'normal' | 'minimized' | 'maximized' | 'collapsed';
export type WindowFrameMode = 'float' | 'dock';
export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface FrameFlags {
  closable: boolean;
  minimizable: boolean;
  maximizable: boolean;
  resizable: boolean;
  popoutable: boolean;
}

export interface FramePointerDetail {
  dx: number;
  dy: number;
  altKey: boolean;
  clientX: number;
  clientY: number;
}

const STYLE = `
  :host { display: block; pointer-events: auto; }
  :host([mode='float']) { position: absolute; }
  :host([mode='dock']) { position: relative; flex: 1 1 auto; min-height: 0; min-width: 0; }
  :host([state='collapsed']) { flex: 0 0 auto; }
  :host([state='collapsed']) .panel { height: auto; }
  .panel {
    display: flex; flex-direction: column; min-height: 0; height: 100%;
    background: var(--ovtt-bg, rgba(22, 19, 14, 0.92));
    border: 1px solid var(--ovtt-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--ovtt-radius, 10px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(8px);
    color: var(--ovtt-text, #e8e2d4);
    font-family: var(--ovtt-font, system-ui, sans-serif);
    font-size: var(--ovtt-font-size, 12px);
    overflow: hidden;
  }
  :host([focused]) .panel { border-color: var(--ovtt-accent-dim, rgba(240, 193, 104, 0.45)); }
  .titlebar {
    display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
    height: 30px; padding: 0 4px 0 10px;
    user-select: none; -webkit-user-select: none; touch-action: none;
  }
  :host([mode='float'][state='normal']) .titlebar { cursor: grab; }
  :host([mode='dock'][state='normal']) .titlebar { cursor: grab; }
  :host([mode='float'][state='normal']) .titlebar:active { cursor: grabbing; }
  :host([mode='dock'][state='normal']) .titlebar:active { cursor: grabbing; }
  .title {
    flex: 1; min-width: 0;
    font-weight: 600; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--ovtt-text-dim, #9a8f78);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  :host([focused]) .title { color: var(--ovtt-accent, #f0c168); }
  .btns { display: flex; gap: 2px; flex: 0 0 auto; }
  button.wbtn {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 22px; padding: 0;
    background: none; border: none; border-radius: 6px;
    color: var(--ovtt-text-dim, #9a8f78); cursor: pointer;
  }
  button.wbtn:hover { background: var(--ovtt-btn-hover, rgba(255, 255, 255, 0.12)); color: var(--ovtt-text, #e8e2d4); }
  button.wbtn.close:hover { background: rgba(220, 76, 70, 0.8); color: #fff; }
  button.wbtn svg { pointer-events: none; }
  .content { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
  :host([state='collapsed']) .content { display: none; }
  .rh { position: absolute; z-index: 5; touch-action: none; }
  .rh[data-dir='n'] { top: -3px; left: 10px; right: 10px; height: 6px; cursor: ns-resize; }
  .rh[data-dir='s'] { bottom: -3px; left: 10px; right: 10px; height: 6px; cursor: ns-resize; }
  .rh[data-dir='e'] { right: -3px; top: 10px; bottom: 10px; width: 6px; cursor: ew-resize; }
  .rh[data-dir='w'] { left: -3px; top: 10px; bottom: 10px; width: 6px; cursor: ew-resize; }
  .rh[data-dir='ne'] { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
  .rh[data-dir='nw'] { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
  .rh[data-dir='se'] { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
  .rh[data-dir='sw'] { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
  :host(:not([resizable])) .rh,
  :host([state='maximized']) .rh,
  :host([state='collapsed']) .rh,
  :host([mode='dock']) .rh { display: none; }
  :host([mode='dock'][dock-resize='s'][resizable][state='normal']) .rh[data-dir='s'] { display: block; }
  :host([mode='dock'][dock-resize='e'][resizable][state='normal']) .rh[data-dir='e'] { display: block; }
  :host([resize-blocked]) .panel {
    border-color: var(--ovtt-danger, rgba(220, 76, 70, 0.85));
    box-shadow: 0 0 0 1px var(--ovtt-danger, rgba(220, 76, 70, 0.55)), 0 10px 28px rgba(0, 0, 0, 0.38);
  }
`;

const ICONS = {
  minimize: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>`,
  maximize: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="1.5"/></svg>`,
  restore: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="12" height="12" rx="1.5"/><path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4H19a1 1 0 0 1 1 1v9.5a1.5 1.5 0 0 1-1.5 1.5H16"/></svg>`,
  close: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  popout: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H11"/></svg>`,
  popin: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 20H4v-6"/><path d="M4 20 13 11"/><path d="M5 10V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v11a1.5 1.5 0 0 1-1.5 1.5H14"/></svg>`,
};

const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/**
 * Frame de janela do plugin windows (Web Component, Shadow DOM): barra de
 * título com botões, slot de conteúdo e handles de resize. É
 * puramente apresentacional/gestural — a geometria e o estado lógico são
 * dirigidos pelo `WindowManager` via `setGeometry`/atributos e os comandos
 * chegam como eventos (`frame-command`, `frame-drag-*`, `frame-resize-*`).
 * Estilizável via `--ovtt-*` e shadow parts.
 */
export class WindowFrameElement extends HTMLElement {
  static observedAttributes = ['title', 'state', 'mode', 'dock-resize', 'popped-out'];

  private flags: FrameFlags = { closable: true, minimizable: true, maximizable: true, resizable: true, popoutable: false };
  private contentEl: HTMLElement | null = null;
  private drag: { lastX: number; lastY: number } | null = null;
  private resize: { dir: ResizeDir; lastX: number; lastY: number } | null = null;
  private focusWired = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (!this.shadowRoot!.childElementCount) this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected && this.shadowRoot?.childElementCount) this.render();
  }

  get frameState(): WindowFrameState {
    return (this.getAttribute('state') as WindowFrameState) ?? 'normal';
  }

  setFlags(flags: Partial<FrameFlags>): void {
    this.flags = { ...this.flags, ...flags };
    this.toggleBoolean('closable', this.flags.closable);
    this.toggleBoolean('resizable', this.flags.resizable);
    if (this.isConnected) this.render();
  }

  setContent(el: HTMLElement): void {
    this.contentEl = el;
    if (this.hasAttribute('popped-out')) return;
    const host = this.shadowRoot?.querySelector('.content');
    if (host) host.replaceChildren(el);
  }

  setGeometry(geo: { x?: number; y?: number; width?: number; height?: number }): void {
    if (geo.x !== undefined) this.style.left = `${geo.x}px`;
    if (geo.y !== undefined) this.style.top = `${geo.y}px`;
    if (geo.width !== undefined) this.style.width = `${geo.width}px`;
    if (geo.height !== undefined) this.style.height = `${geo.height}px`;
  }

  setTitle(title: string): void {
    this.setAttribute('title', title);
  }

  setFocused(focused: boolean): void {
    this.toggleBoolean('focused', focused);
  }

  setVisible(visible: boolean): void {
    this.style.display = visible ? '' : 'none';
  }

  private toggleBoolean(name: string, on: boolean): void {
    if (on) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }

  private render(): void {
    if (!this.shadowRoot) return;
    const state = this.frameState;
    const maximized = state === 'maximized';
    const collapsed = state === 'collapsed';
    const poppedOut = this.hasAttribute('popped-out');
    const showMin = this.flags.minimizable;
    const showMax = this.flags.maximizable && this.flags.resizable && !collapsed;
    const showPop = this.flags.popoutable && !collapsed;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="panel" part="panel">
        <div class="titlebar" part="titlebar">
          <span class="title">${escapeHtml(this.getAttribute('title') ?? '')}</span>
          <div class="btns">
            ${showPop ? `<button class="wbtn popout" title="${poppedOut ? 'Pop in' : 'Pop out'}">${poppedOut ? ICONS.popin : ICONS.popout}</button>` : ''}
            ${showMin ? `<button class="wbtn min" title="${collapsed ? 'Restore' : 'Minimize'}">${collapsed ? ICONS.restore : ICONS.minimize}</button>` : ''}
            ${showMax ? `<button class="wbtn max" title="${maximized ? 'Restore' : 'Maximize'}">${maximized ? ICONS.restore : ICONS.maximize}</button>` : ''}
            ${this.flags.closable ? `<button class="wbtn close" title="Close">${ICONS.close}</button>` : ''}
          </div>
        </div>
        <div class="content" part="content"></div>
        ${RESIZE_DIRS.map((dir) => `<div class="rh" data-dir="${dir}" part="resize-handle"></div>`).join('')}
      </div>`;
    this.wire();
  }

  private wire(): void {
    if (!this.shadowRoot) return;
    const root = this.shadowRoot;
    const titlebar = root.querySelector<HTMLElement>('.titlebar')!;

    if (!this.focusWired) {
      this.focusWired = true;
      this.addEventListener('pointerdown', () => this.emit('frame-focus', {}), { capture: true });
    }

    root.querySelector('.wbtn.close')?.addEventListener('click', () => this.command('close'));
    root.querySelector('.wbtn.min')?.addEventListener('click', () => this.command(this.frameState === 'collapsed' ? 'restore' : 'minimize'));
    root.querySelector('.wbtn.max')?.addEventListener('click', () => this.command(maximizedNow(this) ? 'restore' : 'maximize'));
    root.querySelector('.wbtn.popout')?.addEventListener('click', () => this.command(this.hasAttribute('popped-out') ? 'popin' : 'popout'));

    titlebar.addEventListener('dblclick', () => {
      if (this.frameState === 'collapsed') {
        this.command('restore');
        return;
      }
      if (this.flags.maximizable && this.flags.resizable) this.command(maximizedNow(this) ? 'restore' : 'maximize');
    });
    titlebar.addEventListener('pointerdown', (e) => {
      if ((e as PointerEvent).button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return;
      if (this.frameState !== 'normal') return;
      this.drag = { lastX: e.clientX, lastY: e.clientY };
      this.emit('frame-drag-start', {});
      this.bindMove();
    });

    for (const handle of root.querySelectorAll<HTMLElement>('.rh')) {
      handle.addEventListener('pointerdown', (e) => {
        if ((e as PointerEvent).button !== 0) return;
        const dir = handle.dataset.dir as ResizeDir;
        this.resize = { dir, lastX: e.clientX, lastY: e.clientY };
        this.emit('frame-resize-start', { dir });
        this.bindMove();
      });
    }

    if (this.contentEl && !this.hasAttribute('popped-out')) root.querySelector('.content')!.replaceChildren(this.contentEl);
  }

  private bindMove(): void {
    const move = (e: PointerEvent): void => {
      if (this.drag) {
        const detail: FramePointerDetail = {
          dx: e.clientX - this.drag.lastX,
          dy: e.clientY - this.drag.lastY,
          altKey: e.altKey,
          clientX: e.clientX,
          clientY: e.clientY,
        };
        this.drag.lastX = e.clientX;
        this.drag.lastY = e.clientY;
        this.emit('frame-drag', detail);
      } else if (this.resize) {
        const detail: FramePointerDetail & { dir: ResizeDir } = {
          dir: this.resize.dir,
          dx: e.clientX - this.resize.lastX,
          dy: e.clientY - this.resize.lastY,
          altKey: e.altKey,
          clientX: e.clientX,
          clientY: e.clientY,
        };
        this.resize.lastX = e.clientX;
        this.resize.lastY = e.clientY;
        this.emit('frame-resize', detail);
      }
    };
    const up = (): void => {
      const wasDrag = this.drag !== null;
      const wasResize = this.resize !== null;
      this.drag = null;
      this.resize = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (wasDrag) this.emit('frame-drag-end', {});
      if (wasResize) this.emit('frame-resize-end', {});
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  private command(command: string): void {
    this.emit('frame-command', { command });
  }

  private emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}

function maximizedNow(frame: WindowFrameElement): boolean {
  return frame.frameState === 'maximized';
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function defineWindowElements(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(WINDOW_FRAME_TAG)) customElements.define(WINDOW_FRAME_TAG, WindowFrameElement);
}
