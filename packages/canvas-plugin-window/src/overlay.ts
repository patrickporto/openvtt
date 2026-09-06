import type { WindowDockEdge } from '@openvtt/canvas';

const STYLE = `
  .ovtt-windows {
    position: absolute; inset: 0;
    pointer-events: none;
    z-index: var(--ovtt-windows-z, 90);
    font-family: var(--ovtt-font, system-ui, sans-serif);
    font-size: var(--ovtt-font-size, 12px);
    color: var(--ovtt-text, #e8e2d4);
  }
  .dock {
    position: absolute; display: none;
    flex-direction: column; gap: 3px;
    pointer-events: auto;
    background: var(--ovtt-dock-bg, rgba(10, 8, 6, 0.22));
  }
  .dock.left { top: 0; bottom: 0; left: 0; width: 280px; max-width: 60%; border-right: 1px solid var(--ovtt-border, rgba(255,255,255,0.08)); }
  .dock.right { top: 0; bottom: 0; right: 0; width: 280px; max-width: 60%; border-left: 1px solid var(--ovtt-border, rgba(255,255,255,0.08)); }
  .dock.bottom { left: 0; right: 0; bottom: 0; height: 220px; max-height: 60%; border-top: 1px solid var(--ovtt-border, rgba(255,255,255,0.08)); flex-direction: row; }
  .dock.active { display: flex; }
  .dock-stack { display: flex; flex: 1; min-height: 0; min-width: 0; }
  .dock.left .dock-stack, .dock.right .dock-stack { flex-direction: column; }
  .dock.bottom .dock-stack { flex-direction: row; }
  .dock-divider {
    position: absolute; z-index: 10; touch-action: none;
    background: transparent;
  }
  .dock.left .dock-divider { top: 0; bottom: 0; right: -4px; width: 8px; cursor: ew-resize; }
  .dock.right .dock-divider { top: 0; bottom: 0; left: -4px; width: 8px; cursor: ew-resize; }
  .dock.bottom .dock-divider { left: 0; right: 0; top: -4px; height: 8px; cursor: ns-resize; }
  .dock-divider:hover { background: var(--ovtt-accent-dim, rgba(240, 193, 104, 0.25)); }
  .taskbar {
    position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
    display: none; gap: 4px; padding: 4px;
    pointer-events: auto;
    background: var(--ovtt-bg, rgba(22, 19, 14, 0.92));
    border: 1px solid var(--ovtt-border, rgba(255,255,255,0.08));
    border-radius: 999px;
    backdrop-filter: blur(8px);
  }
  .taskbar.active { display: flex; }
  .taskbar button {
    max-width: 160px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: var(--ovtt-input-bg, rgba(255,255,255,0.06));
    border: 1px solid var(--ovtt-border, rgba(255,255,255,0.08));
    border-radius: 999px; color: var(--ovtt-text, #e8e2d4);
    font: inherit; padding: 3px 12px; cursor: pointer;
  }
  .taskbar button:hover { background: var(--ovtt-btn-hover, rgba(255,255,255,0.12)); color: var(--ovtt-accent, #f0c168); }
  .backdrop {
    position: absolute; inset: 0; display: none;
    pointer-events: auto;
    background: var(--ovtt-modal-backdrop, rgba(0, 0, 0, 0.45));
  }
  .backdrop.active { display: block; }
  .guides { position: absolute; inset: 0; pointer-events: none; }
  .guides .guide { position: absolute; background: var(--ovtt-accent, #f0c168); opacity: 0.75; }
  .dock-preview {
    position: absolute; display: none; pointer-events: none;
    background: var(--ovtt-accent-dim, rgba(240, 193, 104, 0.18));
    border: 1px dashed var(--ovtt-accent, #f0c168);
  }
  .dock-preview.active { display: block; }
  .dock-preview.left { top: 0; bottom: 0; left: 0; width: 280px; }
  .dock-preview.right { top: 0; bottom: 0; right: 0; width: 280px; }
  .dock-preview.bottom { left: 0; right: 0; bottom: 0; height: 220px; }
`;

export interface TaskbarButton {
  id: string;
  title: string;
}

/**
 * Overlay DOM do gerenciador de janelas: dock panels por borda (com divisor
 * redimensionável), taskbar de flutuantes minimizadas, backdrop modal, guias
 * de snap e preview de dock. Tudo acima do canvas, com pointer-events
 * fechados por elemento.
 */
export class WindowOverlay {
  readonly root: HTMLElement;
  readonly docks: Record<WindowDockEdge, HTMLElement>;
  readonly taskbarEl: HTMLElement;
  readonly backdropEl: HTMLElement;

  private readonly host: HTMLElement;
  private readonly guidesEl: HTMLElement;
  private readonly dockPreviewEl: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    this.root = document.createElement('div');
    this.root.className = 'ovtt-windows';

    const style = document.createElement('style');
    style.textContent = STYLE;
    this.root.appendChild(style);

    const docks = {} as Record<WindowDockEdge, HTMLElement>;
    for (const edge of ['left', 'right', 'bottom'] as const) {
      const dock = document.createElement('div');
      dock.className = `dock ${edge}`;
      const stack = document.createElement('div');
      stack.className = 'dock-stack';
      const divider = document.createElement('div');
      divider.className = 'dock-divider';
      dock.append(stack, divider);
      this.wireDivider(dock, divider, edge);
      docks[edge] = dock;
    }
    this.docks = docks;

    this.guidesEl = document.createElement('div');
    this.guidesEl.className = 'guides';
    this.dockPreviewEl = document.createElement('div');
    this.dockPreviewEl.className = 'dock-preview';
    this.taskbarEl = document.createElement('div');
    this.taskbarEl.className = 'taskbar';
    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'backdrop';

    this.root.append(docks.left, docks.right, docks.bottom, this.guidesEl, this.dockPreviewEl, this.backdropEl, this.taskbarEl);
    host.appendChild(this.root);
  }

  stackOf(edge: WindowDockEdge): HTMLElement {
    return this.docks[edge].querySelector('.dock-stack') as HTMLElement;
  }

  bounds(): { width: number; height: number } {
    return { width: this.host.clientWidth, height: this.host.clientHeight };
  }

  hostRect(): { left: number; top: number } {
    const rect = this.host.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }

  refreshDocks(): void {
    for (const edge of ['left', 'right', 'bottom'] as const) {
      const visible = [...this.stackOf(edge).children].filter((el) => !(el as HTMLElement).hasAttribute('popped-out')).length;
      this.docks[edge].classList.toggle('active', visible > 0);
    }
  }

  renderTaskbar(buttons: TaskbarButton[], onClick: (id: string) => void): void {
    this.taskbarEl.replaceChildren();
    for (const button of buttons) {
      const el = document.createElement('button');
      el.textContent = button.title;
      el.addEventListener('click', () => onClick(button.id));
      this.taskbarEl.appendChild(el);
    }
    this.taskbarEl.classList.toggle('active', buttons.length > 0);
  }

  setBackdrop(visible: boolean, zIndex: number): void {
    this.backdropEl.classList.toggle('active', visible);
    this.backdropEl.style.zIndex = String(zIndex);
  }

  showGuides(rects: Array<{ x: number; y: number; width: number; height: number }>): void {
    this.guidesEl.replaceChildren();
    for (const rect of rects) {
      const guide = document.createElement('div');
      guide.className = 'guide';
      guide.style.left = `${rect.x}px`;
      guide.style.top = `${rect.y}px`;
      guide.style.width = `${rect.width}px`;
      guide.style.height = `${rect.height}px`;
      this.guidesEl.appendChild(guide);
    }
  }

  showDockPreview(edge: WindowDockEdge | null): void {
    this.dockPreviewEl.className = 'dock-preview';
    if (edge) {
      this.dockPreviewEl.classList.add('active', edge);
    }
  }

  destroy(): void {
    this.root.remove();
  }

  private wireDivider(dock: HTMLElement, divider: HTMLElement, edge: WindowDockEdge): void {
    divider.addEventListener('pointerdown', (start) => {
      start.preventDefault();
      const bounds = this.bounds();
      const startX = start.clientX;
      const startY = start.clientY;
      const startSize = this.dockSize(dock, edge);
      const move = (e: PointerEvent): void => {
        const horizontal = edge === 'bottom';
        const delta = horizontal
          ? startY - e.clientY
          : edge === 'left'
            ? e.clientX - startX
            : startX - e.clientX;
        const max = horizontal ? bounds.height * 0.6 : bounds.width * 0.6;
        const size = Math.max(160, Math.min(max, startSize + delta));
        if (horizontal) dock.style.height = `${size}px`;
        else dock.style.width = `${size}px`;
      };
      const up = (): void => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
  }

  private dockSize(dock: HTMLElement, edge: WindowDockEdge): number {
    const horizontal = edge === 'bottom';
    const styled = parseFloat(horizontal ? dock.style.height : dock.style.width);
    if (Number.isFinite(styled) && styled > 0) return styled;
    const measured = horizontal ? dock.offsetHeight : dock.offsetWidth;
    if (measured > 0) return measured;
    return horizontal ? 220 : 280;
  }
}
