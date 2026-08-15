import type { Canvas } from '../canvas';
import type { CanvasPointerInfo } from '../input/types';
import type { OpenVTTContextMenu } from '../ui/context-menu';
import { MENU_ORDER } from './builders';
import {
  CONTEXT_MENU_TAG,
  type ContextMenuCloseReason,
  type ContextMenuContribution,
  type ContextMenuContext,
  type ContextMenuItem,
  type ContextMenuTarget,
} from './types';

const ICONS = {
  duplicate:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5v-.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2H6"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
};

function serializeTarget(target: ContextMenuTarget): { type: 'canvas' } | { type: 'object'; objectType: string; id: string } {
  if (target.type === 'canvas') return { type: 'canvas' };
  return { type: 'object', objectType: target.object.objectType, id: target.object.id };
}

function isVisible(item: ContextMenuItem, context: ContextMenuContext): boolean {
  try {
    return !item.when || item.when(context);
  } catch {
    return false;
  }
}

/**
 * Normaliza a lista de itens: aplica filtros `when`, ordena por `order`
 * (estável), remove separadores duplicados/nas bordas e submenus vazios.
 */
export function normalizeItems(items: readonly ContextMenuItem[], context: ContextMenuContext): ContextMenuItem[] {
  const visible = items.filter((item) => isVisible(item, context));
  visible.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const result: ContextMenuItem[] = [];
  for (const item of visible) {
    if (item.type === 'separator') {
      if (result.length === 0 || result[result.length - 1].type === 'separator') continue;
      result.push(item);
      continue;
    }
    if (item.type === 'action' && item.submenu) {
      const submenu = Object.freeze(normalizeItems(item.submenu, context));
      if (submenu.length === 0) continue;
      result.push(Object.freeze({ ...item, submenu }));
      continue;
    }
    result.push(item);
  }
  while (result.length > 0 && result[result.length - 1].type === 'separator') result.pop();
  return result;
}

/**
 * Orquestra o context menu do canvas: reúne itens de contribuições
 * registradas (`ctx.registerContextMenu`), do hook waterfall
 * `contextmenu:items` e dos itens nativos (Duplicate/Delete), emite
 * `contextmenu:open|close` no bus e renderiza o overlay
 * `<openvtt-context-menu>` no host do canvas.
 */
export class ContextMenuManager {
  private readonly canvas: Canvas;
  private readonly contributions = new Map<string, ContextMenuContribution>();
  private view: OpenVTTContextMenu | null = null;
  private host: HTMLElement | null = null;
  private isOpen = false;
  private readonly unsubs: Array<() => void> = [];

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  /** Host onde o overlay é ancorado (normalmente o container do canvas). */
  attachTo(host: HTMLElement): void {
    this.host = host;
    if (typeof window !== 'undefined' && window.getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
  }

  register(contribution: ContextMenuContribution): () => void {
    this.contributions.set(contribution.id, contribution);
    return () => {
      if (this.contributions.get(contribution.id) === contribution) {
        this.contributions.delete(contribution.id);
      }
    };
  }

  unregister(id: string): void {
    this.contributions.delete(id);
  }

  openFromPointer(info: CanvasPointerInfo): void {
    if (this.canvas.inputs?.isDragging) return;
    if (info.target.type === 'object' && !this.canvas.selection.has(info.target.object.id)) {
      this.canvas.select(info.target.object, info.ctrlKey || info.shiftKey);
    }
    const selection = this.canvas.selected;
    const context: ContextMenuContext = {
      x: info.point.x,
      y: info.point.y,
      screenX: info.screenPoint.x,
      screenY: info.screenPoint.y,
      target: info.target,
      selection,
      shiftKey: info.shiftKey,
      altKey: info.altKey,
      ctrlKey: info.ctrlKey,
      metaKey: info.metaKey,
    };
    let veto: { handled?: boolean } = {};
    try {
      veto = this.canvas.bus.call('contextmenu:before', { x: context.x, y: context.y, handled: false });
    } catch (error) {
      console.error('[canvas] contextmenu:before hook failed', error);
    }
    if (veto.handled) return;
    const items = this.collect(context);
    if (items.length === 0) return;
    if (this.isOpen) this.close('replace');
    this.isOpen = true;
    this.canvas.bus.emit('contextmenu:open', {
      x: context.x,
      y: context.y,
      screenX: context.screenX,
      screenY: context.screenY,
      target: serializeTarget(context.target),
      selectionCount: selection.length,
      itemCount: items.length,
    });
    const view = this.ensureView();
    view?.open({ items, x: context.screenX, y: context.screenY, context, onClose: (reason) => this.close(reason) });
  }

  close(reason: ContextMenuCloseReason): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.view?.close();
    this.canvas.bus.emit('contextmenu:close', { reason });
  }

  destroy(): void {
    this.close('destroy');
    for (const unsub of this.unsubs.splice(0)) unsub();
    this.view?.remove();
    this.view = null;
    this.host = null;
    this.contributions.clear();
  }

  /** Itens finais: contribuições registradas → hook waterfall → nativos. */
  collect(context: ContextMenuContext): ContextMenuItem[] {
    let items: ContextMenuItem[] = [];
    for (const contribution of this.contributions.values()) {
      try {
        if (contribution.when && !contribution.when(context)) continue;
        const produced = typeof contribution.items === 'function' ? contribution.items(context) : contribution.items;
        items = [...items, ...produced];
      } catch (error) {
        console.error('[canvas] context menu contribution failed', contribution.id, error);
      }
    }
    let merged: ContextMenuItem[] = items;
    try {
      const result = this.canvas.bus.call('contextmenu:items', {
        x: context.x,
        y: context.y,
        screenX: context.screenX,
        screenY: context.screenY,
        target: context.target,
        selection: context.selection,
        shiftKey: context.shiftKey,
        altKey: context.altKey,
        ctrlKey: context.ctrlKey,
        metaKey: context.metaKey,
        items,
      });
      merged = result.items ?? items;
    } catch (error) {
      console.error('[canvas] contextmenu:items hook failed', error);
    }
    return normalizeItems([...merged, ...this.builtinItems(context)], context);
  }

  private builtinItems(context: ContextMenuContext): ContextMenuItem[] {
    if (context.selection.length === 0) return [];
    return [
      {
        type: 'action',
        id: 'core:duplicate',
        label: 'Duplicate',
        icon: ICONS.duplicate,
        order: MENU_ORDER.duplicate,
        onClick: () => this.duplicateSelection(),
      },
      {
        type: 'action',
        id: 'core:delete',
        label: 'Delete',
        hint: 'Del',
        icon: ICONS.trash,
        danger: true,
        order: MENU_ORDER.delete,
        onClick: () => this.canvas.deleteSelected(),
      },
    ];
  }

  private duplicateSelection(): void {
    const offset = Math.max(20, (this.canvas.grid?.size ?? 50) / 2);
    const objects = [...this.canvas.selected];
    if (objects.length === 0) return;
    this.canvas.history?.beginBatch();
    void (async () => {
      try {
        for (const obj of objects) {
          const data = structuredClone(obj.document as Record<string, unknown>);
          delete data.id;
          if (typeof data.x === 'number') data.x += offset;
          if (typeof data.y === 'number') data.y += offset;
          await this.canvas.documents.create(obj.objectType, data as never);
        }
      } catch (error) {
        console.error('[canvas] duplicate failed', error);
      } finally {
        this.canvas.history?.endBatch();
      }
    })();
  }

  private ensureView(): OpenVTTContextMenu | null {
    if (typeof document === 'undefined' || !this.host) return null;
    if (typeof customElements === 'undefined' || !customElements.get(CONTEXT_MENU_TAG)) return null;
    if (!this.view) {
      const el = document.createElement(CONTEXT_MENU_TAG);
      this.host.appendChild(el);
      this.view = el as OpenVTTContextMenu;
      this.unsubs.push(this.canvas.bus.on('pan', () => this.close('canvas')));
      this.unsubs.push(this.canvas.bus.on('zoom', () => this.close('canvas')));
    }
    return typeof this.view.open === 'function' ? this.view : null;
  }
}
