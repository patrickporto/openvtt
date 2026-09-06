import {
  MENU_ORDER,
  dynamicBus,
  menu,
  menuWhen,
  type ContextMenuContext,
  type ContextMenuItem,
  type PluginContext,
} from '@openvtt/canvas';
import { TableError, type DrawResult } from '@openvtt/roll-tables';
import { flattenDraw, type RollTablesRegistry } from './registry';
import type { RollTableAnchorData } from './schemas';

const DICE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/></svg>`;
const RESET = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`;
const ERASE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>`;

export function registerRollTablesContextMenu(ctx: PluginContext, registry: RollTablesRegistry): void {
  const bus = dynamicBus(ctx.bus);

  ctx.registerContextMenu({
    id: 'roll-tables:context',
    when: menuWhen.selection('roll-table'),
    items: (c: ContextMenuContext): ContextMenuItem[] => {
      const obj = c.selection.find((o) => o.objectType === 'roll-table');
      if (!obj) return [];
      const doc = obj.document as RollTableAnchorData;
      const table = registry.get(doc.tableId);

      const runDraw = (count?: number): void => {
        if (!table) return;
        try {
          const result: DrawResult = registry.draw(doc.tableId, count != null ? { count } : undefined);
          const texts = flattenDraw(result);
          const lastResult = texts.join(', ');
          ctx.canvas.documents.update<RollTableAnchorData>('roll-table', obj.id, { lastResult });
          bus.emit('roll-table:drawn', {
            anchorId: obj.id,
            tableId: table.id,
            tableName: table.name,
            drawId: result.id,
            count: result.count,
            results: texts,
          });
        } catch (error) {
          bus.emit('roll-table:error', {
            anchorId: obj.id,
            tableId: doc.tableId,
            code: error instanceof TableError ? error.code : 'unknown-table-ref',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      };

      return [
        menu.action('roll-tables:draw', 'Draw', {
          icon: DICE,
          order: MENU_ORDER.edit,
          disabled: !table,
          onClick: () => runDraw(),
        }),
        menu.action('roll-tables:draw3', 'Draw ×3', {
          icon: DICE,
          order: MENU_ORDER.edit + 5,
          disabled: !table,
          onClick: () => runDraw(3),
        }),
        menu.action('roll-tables:reset', 'Reset deck', {
          icon: RESET,
          order: MENU_ORDER.edit + 10,
          disabled: !table || table.replacement || table.drawnCount === 0,
          onClick: () => {
            table?.reset();
            bus.emit('roll-table:reset', { anchorId: obj.id, tableId: doc.tableId });
          },
        }),
        menu.action('roll-tables:clear', 'Clear result', {
          icon: ERASE,
          order: MENU_ORDER.edit + 15,
          danger: true,
          disabled: !doc.lastResult,
          onClick: () => {
            ctx.canvas.documents.update<RollTableAnchorData>('roll-table', obj.id, { lastResult: undefined });
          },
        }),
      ];
    },
  });
}
