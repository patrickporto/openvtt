import { MENU_ORDER, menu, menuControls, menuWhen } from '@openvtt/canvas';
import type { ContextMenuContext, ContextMenuItem, PluginContext } from '@openvtt/canvas';
import type { MapPlaceable } from './placeables/MapPlaceable';
import type { MapData } from './schemas';

const ICON_FIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
const ICON_SCENE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 15l5-5 4 4 3.5-3.5 4.5 4.5" opacity=".7"/></svg>`;
const ICON_1TO1 = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/><path d="M9 12h6" opacity=".7"/></svg>`;

export function registerMapsContextMenu(ctx: PluginContext): void {
  ctx.registerContextMenu({
    id: 'maps:context',
    when: menuWhen.selection('map'),
    items: (c: ContextMenuContext): ContextMenuItem[] => {
      const obj = c.selection.find((o) => o.objectType === 'map');
      if (!obj) return [];
      const map = obj as MapPlaceable;
      const doc = map.document as MapData;
      const before = { x: map.x, y: map.y, width: doc.width, height: doc.height };
      const commit = (changes: Partial<MapData>): void => {
        ctx.canvas.documents.update<MapData>('map', map.id, changes, { before: { ...before } });
      };
      const natural = map.naturalSize;
      const scene = ctx.canvas.viewport?.state;
      return [
        menu.custom(
          'maps:opacity',
          () => {
            const original = doc.alpha ?? 1;
            return menuControls.slider({
              label: 'Opacity',
              min: 0,
              max: 100,
              step: 1,
              value: Math.round(original * 100),
              format: (value) => `${value}%`,
              live: (value) => obj.update({ alpha: value / 100 }),
              commit: (value) => ctx.canvas.documents.update<MapData>('map', map.id, { alpha: value / 100 }, { before: { alpha: original } }),
            });
          },
          { height: 30, order: MENU_ORDER.edit },
        ),
        menu.action('maps:natural', 'Natural size', {
          icon: ICON_1TO1,
          order: MENU_ORDER.transform,
          disabled: !natural || (natural.width === doc.width && natural.height === doc.height),
          hint: natural ? `${natural.width}×${natural.height}` : undefined,
          onClick: () => {
            if (!natural) return;
            commit({ width: natural.width, height: natural.height });
          },
        }),
        menu.action('maps:fill', 'Fill scene', {
          icon: ICON_SCENE,
          order: MENU_ORDER.transform + 10,
          disabled: !scene,
          hint: scene ? `${Math.round(scene.worldWidth)}×${Math.round(scene.worldHeight)}` : undefined,
          onClick: () => {
            if (!scene) return;
            commit({ x: 0, y: 0, width: scene.worldWidth, height: scene.worldHeight });
          },
        }),
        menu.action('maps:fit', 'Fit view to map', {
          icon: ICON_FIT,
          order: MENU_ORDER.utility,
          onClick: () => {
            const b = map.bounds;
            ctx.canvas.viewport?.centerOn(map.x + b.width / 2, map.y + b.height / 2);
            ctx.canvas.viewport?.fit(b.width, b.height);
          },
        }),
      ];
    },
  });
}
