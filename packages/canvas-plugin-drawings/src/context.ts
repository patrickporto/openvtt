import { MENU_ORDER, menu, menuControls, menuWhen, type ContextMenuContext, type ContextMenuItem, type PluginContext } from '@openvtt/canvas';
import type { DrawingData } from './schemas';

const ICONS = {
  order: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13.5 9 5 9-5" opacity=".65"/></svg>`,
  front: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M12 3.5 8.5 7M12 3.5 15.5 7"/><path d="M4.5 13.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" opacity=".7"/></svg>`,
  back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5v-11M12 20.5 8.5 17M12 20.5 15.5 17"/><path d="M4.5 10.5v-4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v4" opacity=".7"/></svg>`,
  style: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5s6 6.3 6 10a6 6 0 0 1-12 0c0-3.7 6-10 6-10Z"/></svg>`,
  text: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7V5h14v2M12 5v14M9.5 19h5"/></svg>`,
};

const pct = (v: number): string => `${v}%`;
const px = (v: number): string => `${v}px`;

/** Registra os itens de context menu do plugin de drawings. */
export function registerDrawingsContextMenu(ctx: PluginContext): void {
  ctx.registerContextMenu({
    id: 'drawings:context',
    when: menuWhen.selection('drawing'),
    items: (c: ContextMenuContext): ContextMenuItem[] => {
      const obj = c.selection.find((o) => o.objectType === 'drawing');
      if (!obj) return [];
      const doc = obj.document as DrawingData;
      const commit = (changes: Partial<DrawingData>, before?: Partial<DrawingData>): void => {
        ctx.canvas.documents.update<DrawingData>('drawing', obj.id, changes, before ? { before } : undefined);
      };
      const siblings = ctx.canvas.documents.layer('drawing')?.placeables ?? [];
      const zIndices = siblings.map((p) => (p.document as DrawingData).zIndex ?? 0);

      const order = menu.submenu('drawings:order', 'Order', [
        menu.action('drawings:order:front', 'Bring to front', {
          icon: ICONS.front,
          onClick: () => commit({ zIndex: (zIndices.length > 0 ? Math.max(...zIndices) : 9) + 1 }),
        }),
        menu.action('drawings:order:back', 'Send to back', {
          icon: ICONS.back,
          onClick: () => commit({ zIndex: zIndices.length > 0 ? Math.min(...zIndices) - 1 : 0 }),
        }),
      ], { icon: ICONS.order, order: MENU_ORDER.transform });

      if (doc.type === 'text') {
        return [
          order,
          menu.submenu('drawings:text', 'Text', [
            menu.custom('drawings:text:content', () => {
              const original = doc.text;
              return menuControls.text({
                label: 'Text',
                value: original ?? '',
                placeholder: 'Text…',
                commit: (v) => commit({ text: v }, { text: original }),
              });
            }, { height: 26 }),
            menu.custom('drawings:text:size', () => {
              const original = doc.fontSize ?? 16;
              return menuControls.slider({
                label: 'Size',
                min: 8,
                max: 72,
                step: 1,
                value: original,
                format: px,
                live: (v) => obj.update({ fontSize: v }),
                commit: (v, before) => commit({ fontSize: v }, { fontSize: before }),
              });
            }, { height: 30 }),
          ], { icon: ICONS.text, order: MENU_ORDER.edit }),
        ];
      }

      return [
        order,
        menu.submenu('drawings:style', 'Style', [
          menu.custom('drawings:style:fill', () => {
            const original = doc.fillColor;
            const initial = typeof original === 'number'
              ? `#${original.toString(16).padStart(6, '0')}`
              : typeof original === 'string' && /^#[0-9a-fA-F]{6}$/.test(original) ? original : '#ffffff';
            return menuControls.color({
              label: 'Fill',
              value: initial,
              live: (v) => obj.update({ fillColor: v }),
              commit: (v) => commit({ fillColor: v }, { fillColor: original }),
            });
          }, { height: 26 }),
          menu.custom('drawings:style:opacity', () => {
            const original = doc.fillAlpha ?? 1;
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
          }, { height: 30 }),
          menu.submenu('drawings:style:stroke', 'Stroke', [
            menu.custom('drawings:style:stroke:width', () => {
              const original = doc.strokeWidth ?? 0;
              return menuControls.slider({
                label: 'Width',
                min: 0,
                max: 20,
                step: 1,
                value: original,
                format: px,
                live: (v) => obj.update({ strokeWidth: v }),
                commit: (v, before) => commit({ strokeWidth: v }, { strokeWidth: before }),
              });
            }, { height: 30 }),
          ]),
        ], { icon: ICONS.style, order: MENU_ORDER.edit }),
      ];
    },
  });
}
