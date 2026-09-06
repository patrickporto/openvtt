import { MENU_ORDER, menu, menuControls, menuWhen, toHex } from '@openvtt/canvas';
import type { Canvas, ContextMenuContribution, ContextMenuItem, GridType } from '@openvtt/canvas';

const pct = (v: number): string => `${v}%`;
const px = (v: number): string => `${Math.round(v)}px`;

export const GRID_TYPE_LABELS: Record<Exclude<GridType, 'none'>, string> = {
  square: 'Square',
  'hex-vertical': 'Hex vertical',
  'hex-horizontal': 'Hex horizontal',
  isometric: 'Isometric',
};

const ICON_GRID = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 3.5h17v17h-17z"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" opacity=".6"/></svg>`;

function toCssHex(color: number | string | undefined): string {
  return `#${toHex(color ?? 0x000000).toString(16).padStart(6, '0')}`;
}

/**
 * Itens de configuração do grid. O toggle do tipo fecha o menu (comportamento
 * de radio group: o estado vem do `GridService`, o menu não re-renderiza);
 * os controles de estilo só aparecem quando o tipo está ativo.
 */
export function gridMenuItems(canvas: Canvas, pluginId: string, type: GridType): ContextMenuItem[] {
  const grid = canvas.grid;
  const label = type === 'none' ? 'No grid' : GRID_TYPE_LABELS[type];
  const items: ContextMenuItem[] = [
    menu.toggle(`${pluginId}:enable`, label, {
      checked: grid.type === type,
      closeOnClick: true,
      order: MENU_ORDER.canvas + 10,
      onClick: () => grid.setType(type),
    }),
  ];
  if (type === 'none' || grid.type !== type) return items;
  items.push(menu.separator(`${pluginId}:style-sep`, { order: MENU_ORDER.canvas + 15 }));
  items.push(
    menu.custom(
      `${pluginId}:cell`,
      () =>
        menuControls.slider({
          label: 'Cell',
          min: 10,
          max: 300,
          step: 5,
          value: grid.size,
          live: (v) => grid.setSize(v),
        }),
      { height: 30, order: MENU_ORDER.canvas + 20 },
    ),
    menu.custom(
      `${pluginId}:line`,
      () =>
        menuControls.slider({
          label: 'Line',
          min: 0.5,
          max: 6,
          step: 0.5,
          value: grid.lineWidth ?? 1,
          format: px,
          live: (v) => grid.set({ lineWidth: v }),
        }),
      { height: 30, order: MENU_ORDER.canvas + 25 },
    ),
    menu.custom(
      `${pluginId}:opacity`,
      () =>
        menuControls.slider({
          label: 'Opacity',
          min: 0,
          max: 100,
          step: 5,
          value: Math.round((grid.alpha ?? 0.3) * 100),
          format: pct,
          live: (v) => grid.set({ alpha: v / 100 }),
        }),
      { height: 30, order: MENU_ORDER.canvas + 30 },
    ),
    menu.custom(
      `${pluginId}:color`,
      () =>
        menuControls.color({
          label: 'Color',
          value: toCssHex(grid.color),
          live: (v) => grid.set({ color: v }),
          commit: (v) => grid.set({ color: v }),
        }),
      { height: 32, order: MENU_ORDER.canvas + 35 },
    ),
    menu.custom(
      `${pluginId}:offset-x`,
      () =>
        menuControls.slider({
          label: 'Align X',
          min: -grid.size,
          max: grid.size,
          step: 1,
          value: grid.offsetX ?? 0,
          format: px,
          live: (v) => grid.set({ offsetX: v }),
        }),
      { height: 30, order: MENU_ORDER.canvas + 40 },
    ),
    menu.custom(
      `${pluginId}:offset-y`,
      () =>
        menuControls.slider({
          label: 'Align Y',
          min: -grid.size,
          max: grid.size,
          step: 1,
          value: grid.offsetY ?? 0,
          format: px,
          live: (v) => grid.set({ offsetY: v }),
        }),
      { height: 30, order: MENU_ORDER.canvas + 45 },
    ),
  );
  return items;
}

export interface GridMenuContext {
  readonly canvas: Canvas;
  registerContextMenu(contribution: ContextMenuContribution): void;
}

export function registerGridTypeContextMenu(ctx: GridMenuContext, pluginId: string, type: GridType): void {
  ctx.registerContextMenu({
    id: `${pluginId}:context`,
    when: menuWhen.canvas(),
    items: () => gridMenuItems(ctx.canvas, pluginId, type),
  });
}
