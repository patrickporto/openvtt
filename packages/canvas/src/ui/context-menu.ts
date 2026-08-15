import type {
  ContextMenuAction,
  ContextMenuCloseReason,
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuToggle,
} from '../contextmenu/types';
import { CONTEXT_MENU_TAG } from '../contextmenu/types';

export interface ContextMenuOpenOptions {
  items: ContextMenuItem[];
  x: number;
  y: number;
  context: ContextMenuContext;
  onClose: (reason: ContextMenuCloseReason) => void;
}

const SVG = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
};

const STYLE = `
  :host {
    position: absolute;
    left: 0;
    top: 0;
    z-index: var(--ovtt-menu-z-index, 30000);
    font-family: var(--ovtt-font, system-ui, sans-serif);
    font-size: var(--ovtt-menu-font-size, 13px);
    color: var(--ovtt-text, #e8e2d4);
    user-select: none;
  }
  .menu {
    position: absolute;
    min-width: var(--ovtt-menu-width, 210px);
    max-width: var(--ovtt-menu-max-width, 340px);
    max-height: var(--ovtt-menu-max-height, 420px);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--ovtt-menu-bg, var(--ovtt-bg, rgba(24, 20, 15, 0.97)));
    border: 1px solid var(--ovtt-menu-border, var(--ovtt-border, rgba(255, 255, 255, 0.09)));
    border-radius: var(--ovtt-menu-radius, var(--ovtt-radius, 10px));
    box-shadow: var(--ovtt-menu-shadow, 0 14px 38px rgba(0, 0, 0, 0.5));
    backdrop-filter: blur(10px);
    padding: 5px;
    animation: ovtt-menu-in 110ms ease-out;
  }
  .menu::-webkit-scrollbar { width: 6px; }
  .menu::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 3px; }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 7px;
    cursor: pointer;
    white-space: nowrap;
  }
  .item:hover, .item.active { background: var(--ovtt-menu-item-hover, var(--ovtt-btn-hover, rgba(255, 255, 255, 0.08))); }
  .item.disabled { opacity: 0.4; cursor: default; }
  .item.disabled:hover, .item.disabled.active { background: transparent; }
  .check { width: 14px; height: 14px; flex: none; display: grid; place-items: center; color: var(--ovtt-accent, #f0c168); }
  .check svg { width: 13px; height: 13px; }
  .icon { width: 16px; height: 16px; flex: none; display: grid; place-items: center; opacity: 0.9; }
  .icon svg { width: 16px; height: 16px; }
  .icon img { width: 16px; height: 16px; object-fit: contain; display: block; pointer-events: none; }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .hint { font-size: 10px; color: var(--ovtt-text-dim, #9a8f78); letter-spacing: 0.04em; flex: none; }
  .chev { flex: none; display: grid; place-items: center; color: var(--ovtt-text-dim, #9a8f78); }
  .chev svg { width: 12px; height: 12px; }
  .item.danger, .item.danger .hint, .item.danger .chev { color: var(--ovtt-menu-danger, #e5734f); }
  .item.danger:hover, .item.danger.active { background: var(--ovtt-menu-danger-hover, rgba(229, 115, 79, 0.14)); }
  .separator { height: 1px; margin: 5px 6px; background: var(--ovtt-menu-separator, rgba(255, 255, 255, 0.09)); }
  .custom { padding: 4px 6px; }
  @keyframes ovtt-menu-in {
    from { opacity: 0; transform: scale(0.97) translateY(-3px); }
  }
`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function renderIcon(icon: string | undefined): string {
  if (!icon) return '';
  if (icon.trimStart().startsWith('<')) return icon;
  return `<img src="${escapeHtml(icon)}" alt="" draggable="false" />`;
}

/**
 * Overlay de context menu framework-agnostic (Web Component), instanciado
 * pelo ContextMenuManager. Suporta ações, toggles, separadores, submenus
 * aninhados e itens custom com render DOM arbitrário. Navegável por
 * teclado (setas/Enter/Esc) e tematizável via CSS custom properties.
 */
export class OpenVTTContextMenu extends HTMLElement {
  private options: ContextMenuOpenOptions | null = null;
  private rootMenu: HTMLDivElement | null = null;
  private submenus: HTMLDivElement[] = [];
  private readonly submenuOwnerByDepth = new Map<number, HTMLElement>();
  private activeRow: HTMLElement | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private checkedOverrides: ReadonlyMap<string, boolean> = new Map();
  private readonly itemByRow = new WeakMap<HTMLElement, ContextMenuItem>();
  private readonly depthByRow = new WeakMap<HTMLElement, number>();
  private readonly cleanupFns: Array<() => void> = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.innerHTML = `<style>${STYLE}</style>`;
    this.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  open(options: ContextMenuOpenOptions): void {
    this.teardown();
    this.options = options;
    this.render();
    this.positionAt(options.x, options.y);
    this.bindGlobal();
  }

  close(): void {
    this.teardown();
  }

  private teardown(): void {
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    for (const fn of this.cleanupFns.splice(0)) fn();
    this.submenus = [];
    this.submenuOwnerByDepth.clear();
    this.activeRow = null;
    this.checkedOverrides = new Map();
    this.rootMenu = null;
    this.options = null;
    if (this.shadowRoot) this.shadowRoot.innerHTML = `<style>${STYLE}</style>`;
  }

  private finish(reason: ContextMenuCloseReason): void {
    const options = this.options;
    this.teardown();
    options?.onClose(reason);
  }

  /* ------------------------------ render ------------------------------ */

  private render(): void {
    this.rootMenu = this.buildMenu(this.options!.items, 0);
    this.shadowRoot!.appendChild(this.rootMenu);
  }

  private buildMenu(items: readonly ContextMenuItem[], depth: number): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.dataset.depth = String(depth);
    menu.setAttribute('role', 'menu');
    for (const item of items) menu.appendChild(this.buildRow(item, depth));
    return menu;
  }

  private buildRow(item: ContextMenuItem, depth: number): HTMLElement {
    if (item.type === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'separator';
      sep.setAttribute('role', 'separator');
      return sep;
    }
    if (item.type === 'custom') return this.buildCustom(item);

    const row = document.createElement('div');
    row.className =
      `item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`;
    row.setAttribute('role', 'menuitem');
    row.setAttribute('aria-disabled', String(item.disabled ?? false));
    const checked = item.type === 'toggle' && this.displayChecked(item);
    row.innerHTML = `
      <span class="check">${checked ? SVG.check : ''}</span>
      <span class="icon">${renderIcon(item.icon)}</span>
      <span class="label">${escapeHtml(item.label ?? '')}</span>
      ${item.hint ? `<span class="hint">${escapeHtml(item.hint)}</span>` : ''}
      ${item.type === 'action' && item.submenu?.length ? `<span class="chev">${SVG.chevron}</span>` : ''}
    `;
    this.itemByRow.set(row, item);
    this.depthByRow.set(row, depth);

    row.addEventListener('mouseenter', () => {
      if (item.disabled) return;
      this.setActive(row);
      if (this.hoverTimer !== null) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
      }
      if (this.submenuOwnerByDepth.get(depth + 1) === row) return;
      this.closeSubmenusAbove(depth);
      if (item.type === 'action' && item.submenu?.length) {
        this.hoverTimer = setTimeout(() => this.openSubmenu(row, item, depth), 110);
      }
    });
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      if (item.disabled) return;
      if (item.type === 'action' && item.submenu?.length) {
        this.openSubmenu(row, item, depth);
        return;
      }
      this.activate(item, row);
    });
    return row;
  }

  private buildCustom(item: ContextMenuItem & { type: 'custom' }): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'custom';
    if (item.height !== undefined) wrap.style.minHeight = `${item.height}px`;
    try {
      wrap.appendChild(item.render(this.options!.context));
    } catch (error) {
      console.error('[canvas] context menu custom item failed', item.id, error);
    }
    return wrap;
  }

  private displayChecked(item: ContextMenuToggle): boolean {
    return this.checkedOverrides.get(item.id) ?? item.checked ?? false;
  }

  private activate(item: ContextMenuItem, row: HTMLElement): void {
    if (item.type !== 'action' && item.type !== 'toggle') return;
    try {
      item.onClick?.(this.options!.context);
    } catch (error) {
      console.error('[canvas] context menu action failed', item.id, error);
      return;
    }
    const closeOnClick = item.closeOnClick ?? item.type === 'action';
    if (closeOnClick) {
      this.finish('action');
      return;
    }
    if (item.type === 'toggle') {
      const next = !this.displayChecked(item);
      this.checkedOverrides = new Map(this.checkedOverrides).set(item.id, next);
      const check = row.querySelector('.check');
      if (check) check.innerHTML = next ? SVG.check : '';
    }
  }

  /* ----------------------------- submenus ----------------------------- */

  private openSubmenu(row: HTMLElement, item: ContextMenuAction, depth: number): void {
    this.closeSubmenusAbove(depth);
    if (!item.submenu?.length) return;
    const flyout = this.buildMenu(item.submenu, depth + 1);
    this.shadowRoot!.appendChild(flyout);

    const base = this.getBoundingClientRect();
    const hostRect = (this.parentElement ?? this).getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const width = flyout.offsetWidth;
    const height = flyout.offsetHeight;
    let left = rowRect.right - base.left + 4;
    if (left + width > hostRect.right - 8) left = rowRect.left - base.left - width - 4;
    let top = rowRect.top - base.top - 5;
    if (top + height > hostRect.bottom - 8) {
      top = Math.max(hostRect.top - base.top + 8, hostRect.bottom - height - 8 - base.top);
    }
    flyout.style.left = `${Math.max(4, left)}px`;
    flyout.style.top = `${top}px`;
    this.submenus.push(flyout);
    this.submenuOwnerByDepth.set(depth + 1, row);
  }

  private closeSubmenusAbove(depth: number): void {
    this.submenus = this.submenus.filter((menu) => {
      if (Number(menu.dataset.depth) > depth) {
        this.submenuOwnerByDepth.delete(Number(menu.dataset.depth));
        menu.remove();
        return false;
      }
      return true;
    });
  }

  /* ---------------------------- positioning ---------------------------- */

  private positionAt(x: number, y: number): void {
    const menu = this.rootMenu!;
    const host = this.parentElement;
    const boundsWidth = host?.clientWidth ?? window.innerWidth;
    const boundsHeight = host?.clientHeight ?? window.innerHeight;
    const margin = 6;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = x;
    let top = y;
    if (left + width > boundsWidth - margin) left = Math.max(margin, x - width);
    if (top + height > boundsHeight - margin) top = Math.max(margin, y - height);
    this.style.left = `${left}px`;
    this.style.top = `${top}px`;
  }

  /* ------------------------------ keyboard ----------------------------- */

  private currentMenu(): HTMLDivElement {
    return this.submenus.length > 0 ? this.submenus[this.submenus.length - 1] : this.rootMenu!;
  }

  private rowsOf(menu: HTMLDivElement): HTMLElement[] {
    return [...menu.querySelectorAll<HTMLElement>(':scope > .item')];
  }

  private setActive(row: HTMLElement | null): void {
    if (this.activeRow) this.activeRow.classList.remove('active');
    this.activeRow = row;
    if (row) {
      row.classList.add('active');
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  private moveActive(direction: 1 | -1): void {
    const rows = this.rowsOf(this.currentMenu());
    if (rows.length === 0) return;
    const index = this.activeRow ? rows.indexOf(this.activeRow) : -1;
    this.setActive(rows[(index + direction + rows.length) % rows.length]);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.rootMenu) return;
    const target = event.target as HTMLElement | null;
    if (
      event.key !== 'Escape' &&
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    switch (event.key) {
      case 'Escape': {
        event.preventDefault();
        event.stopPropagation();
        if (this.submenus.length > 0) {
          this.closeSubmenusAbove(this.submenus.length - 1);
          this.setActive(null);
        } else {
          this.finish('escape');
        }
        return;
      }
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.moveActive(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.moveActive(-1);
        return;
      case 'ArrowRight': {
        const row = this.activeRow;
        const item = row ? this.itemByRow.get(row) : undefined;
        if (row && item?.type === 'action' && item.submenu?.length) {
          event.preventDefault();
          event.stopPropagation();
          this.openSubmenu(row, item, this.depthByRow.get(row) ?? 0);
          const rows = this.rowsOf(this.currentMenu());
          if (rows.length > 0) this.setActive(rows[0]);
        }
        return;
      }
      case 'ArrowLeft': {
        if (this.submenus.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          this.closeSubmenusAbove(this.submenus.length - 1);
          this.setActive(null);
        }
        return;
      }
      case 'Enter':
      case ' ': {
        const row = this.activeRow;
        if (row) {
          event.preventDefault();
          event.stopPropagation();
          row.click();
        }
        return;
      }
    }
  }

  /* ------------------------------ global ------------------------------- */

  private bindGlobal(): void {
    const onPointerDown = (event: PointerEvent) => {
      if (!event.composedPath().includes(this)) this.finish('outside');
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    this.cleanupFns.push(() => window.removeEventListener('pointerdown', onPointerDown, true));

    const onBlur = () => this.finish('outside');
    window.addEventListener('blur', onBlur);
    this.cleanupFns.push(() => window.removeEventListener('blur', onBlur));

    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    window.addEventListener('keydown', onKeyDown, true);
    this.cleanupFns.push(() => window.removeEventListener('keydown', onKeyDown, true));
  }

  disconnectedCallback(): void {
    this.teardown();
  }
}

export { CONTEXT_MENU_TAG };
