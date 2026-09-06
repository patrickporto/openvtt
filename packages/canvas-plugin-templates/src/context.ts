import { MENU_ORDER, menu, menuControls, menuWhen, type ContextMenuContext, type ContextMenuItem, type PluginContext } from '@openvtt/canvas';
import type { TemplateData } from './schemas';

const pct = (v: number): string => `${v}%`;
const units = (v: number): string => `${v} u`;

/** Registra os itens de context menu do plugin de templates. */
export function registerTemplatesContextMenu(ctx: PluginContext): void {
  ctx.registerContextMenu({
    id: 'templates:context',
    when: menuWhen.selection('template'),
    items: (c: ContextMenuContext): ContextMenuItem[] => {
      const obj = c.selection.find((o) => o.objectType === 'template');
      if (!obj) return [];
      const doc = obj.document as TemplateData;
      const shape = doc.shape;
      const commit = (changes: Partial<TemplateData>, before?: Partial<TemplateData>): void => {
        ctx.canvas.documents.update<TemplateData>('template', obj.id, changes, before ? { before } : undefined);
      };

      return [
        menu.custom('templates:direction', () => {
          const original = doc.direction ?? 0;
          const initial = Math.round(((((original * 180) / Math.PI) % 360) + 360) % 360);
          return menuControls.slider({
            label: 'Direction',
            min: 0,
            max: 360,
            step: 1,
            value: initial,
            format: (deg) => `${deg}°`,
            live: (deg) => obj.update({ direction: (deg * Math.PI) / 180 }),
            commit: (deg) => commit({ direction: (deg * Math.PI) / 180 }, { direction: original }),
          });
        }, { height: 30, order: MENU_ORDER.transform, when: () => shape !== 'circle' }),
        menu.custom('templates:distance', () => {
          const original = doc.distance;
          return menuControls.slider({
            label: 'Distance',
            min: 0.5,
            max: 12,
            step: 0.5,
            value: original,
            format: units,
            live: (v) => obj.update({ distance: v }),
            commit: (v, before) => commit({ distance: v }, { distance: before }),
          });
        }, { height: 30, order: MENU_ORDER.edit }),
        menu.custom('templates:width', () => {
          const original = doc.width ?? 1;
          return menuControls.slider({
            label: 'Width',
            min: 0.5,
            max: 6,
            step: 0.5,
            value: original,
            format: units,
            live: (v) => obj.update({ width: v }),
            commit: (v, before) => commit({ width: v }, { width: before }),
          });
        }, { height: 30, order: MENU_ORDER.edit + 10, when: () => shape === 'ray' }),
        menu.custom('templates:color', () => {
          const original = doc.color;
          const initial = typeof original === 'number'
            ? `#${original.toString(16).padStart(6, '0')}`
            : typeof original === 'string' && /^#[0-9a-fA-F]{6}$/.test(original) ? original : '#4fc3f7';
          return menuControls.color({
            label: 'Color',
            value: initial,
            live: (v) => obj.update({ color: v }),
            commit: (v) => commit({ color: v }, { color: original }),
          });
        }, { height: 26, order: MENU_ORDER.edit + 20 }),
        menu.custom('templates:opacity', () => {
          const original = doc.fillAlpha ?? 0.25;
          return menuControls.slider({
            label: 'Opacity',
            min: 0,
            max: 100,
            step: 1,
            value: Math.round(original * 100),
            format: pct,
            live: (v) => obj.update({ fillAlpha: v / 100 }),
            commit: (v) => commit({ fillAlpha: v / 100 }, { fillAlpha: original }),
          });
        }, { height: 30, order: MENU_ORDER.edit + 30 }),
      ];
    },
  });
}
