import { MENU_ORDER, menu, menuControls, menuWhen, type ContextMenuContext, type ContextMenuItem, type PluginContext } from '@openvtt/canvas';
import type { LightData } from './schemas';

const units = (v: number): string => `${v} u`;

/** Registra os itens de context menu do plugin de lights. */
export function registerLightsContextMenu(ctx: PluginContext): void {
  ctx.registerContextMenu({
    id: 'lights:context',
    when: menuWhen.selection('light'),
    items: (c: ContextMenuContext): ContextMenuItem[] => {
      const obj = c.selection.find((o) => o.objectType === 'light');
      if (!obj) return [];
      const doc = obj.document as LightData;
      const commit = (changes: Partial<LightData>, before?: Partial<LightData>): void => {
        ctx.canvas.documents.update<LightData>('light', obj.id, changes, before ? { before } : undefined);
        ctx.bus.call('scene:refresh', {});
      };
      const preview = (changes: Partial<LightData>): void => {
        obj.update(changes);
        ctx.bus.call('scene:refresh', {});
      };

      return [
        menu.custom('lights:bright', () => {
          const original = doc.bright ?? 0;
          return menuControls.slider({
            label: 'Bright',
            min: 0,
            max: 10,
            step: 0.5,
            value: original,
            format: units,
            live: (v) => preview({ bright: v }),
            commit: (v, before) => commit({ bright: v }, { bright: before }),
          });
        }, { height: 30, order: MENU_ORDER.edit }),
        menu.custom('lights:dim', () => {
          const original = doc.dim;
          return menuControls.slider({
            label: 'Dim',
            min: 0.5,
            max: 20,
            step: 0.5,
            value: original,
            format: units,
            live: (v) => preview({ dim: v }),
            commit: (v, before) => commit({ dim: v }, { dim: before }),
          });
        }, { height: 30, order: MENU_ORDER.edit + 10 }),
        menu.custom('lights:color', () => {
          const original = doc.color;
          const initial = typeof original === 'number'
            ? `#${original.toString(16).padStart(6, '0')}`
            : typeof original === 'string' && /^#[0-9a-fA-F]{6}$/.test(original) ? original : '#ffb35c';
          return menuControls.color({
            label: 'Color',
            value: initial,
            live: (v) => preview({ color: v }),
            commit: (v) => commit({ color: v }, { color: original }),
          });
        }, { height: 26, order: MENU_ORDER.edit + 20 }),
      ];
    },
  });
}
