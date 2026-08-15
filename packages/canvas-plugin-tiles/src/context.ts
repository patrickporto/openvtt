import { MENU_ORDER, menu, menuControls, menuWhen, type ContextMenuContext, type ContextMenuItem, type PluginContext } from '@openvtt/canvas';
import type { TileData } from './schemas';

const ICONS = {
  size: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M12 3.5v17M3.5 12h17" opacity=".6"/></svg>`,
  rotate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.4 2.6L21 8"/><path d="M21 3v5h-5"/></svg>`,
};

const pct = (v: number): string => `${v}%`;

/** Registra os itens de context menu do plugin de tiles. */
export function registerTilesContextMenu(ctx: PluginContext): void {
  ctx.registerContextMenu({
    id: 'tiles:context',
    when: menuWhen.selection('tile'),
    items: (c: ContextMenuContext): ContextMenuItem[] => {
      const obj = c.selection.find((o) => o.objectType === 'tile');
      if (!obj) return [];
      const doc = obj.document as TileData;
      const commit = (changes: Partial<TileData>, before?: Partial<TileData>): void => {
        ctx.canvas.documents.update<TileData>('tile', obj.id, changes, before ? { before } : undefined);
      };
      const cell = ctx.canvas.grid.size;

      return [
        menu.action('tiles:rotate', 'Rotate 90°', {
          icon: ICONS.rotate,
          order: MENU_ORDER.transform,
          onClick: () => commit({ rotation: (doc.rotation ?? 0) + Math.PI / 2 }),
        }),
        menu.submenu('tiles:size', 'Size', [1, 2, 3, 4].map((n) => (
          menu.action(`tiles:size:${n}`, `${n}×${n}`, {
            onClick: () => commit({ width: n * cell, height: n * cell }),
          })
        )), { icon: ICONS.size, order: MENU_ORDER.transform + 10 }),
        menu.custom('tiles:opacity', () => {
          const original = doc.alpha ?? 1;
          return menuControls.slider({
            label: 'Opacity',
            min: 0,
            max: 100,
            step: 1,
            value: Math.round(original * 100),
            format: pct,
            live: (v) => obj.update({ alpha: v / 100 }),
            commit: (v) => commit({ alpha: v / 100 }, { alpha: original }),
          });
        }, { height: 30, order: MENU_ORDER.edit }),
      ];
    },
  });
}
