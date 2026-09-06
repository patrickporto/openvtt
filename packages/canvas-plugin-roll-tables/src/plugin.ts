import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { RandomTable, type TableDef } from '@openvtt/roll-tables';
import { RollTableAnchor } from './placeables/RollTableAnchor';
import { RollTableTool } from './tools/RollTableTool';
import { RollTablesRegistry } from './registry';
import { registerRollTablesContextMenu } from './context';
import { RollTableAnchorSchema, type RollTableAnchorData } from './schemas';

export interface RollTableToolOptions {
  tableId: string;
  color: number | string;
}

export interface RollTablesPluginOptions {
  tables?: readonly (TableDef | RandomTable)[];
  toolDefaults?: Partial<RollTableToolOptions>;
}

const DEFAULT_TOOL_OPTIONS: RollTableToolOptions = { tableId: '', color: 0x8e6ff7 };

export function createRollTablesPlugin(options: RollTablesPluginOptions = {}) {
  const registry = new RollTablesRegistry();

  const plugin = definePlugin({
    id: 'roll-tables',
    name: 'Roll Tables',
    install(ctx: PluginContext) {
      for (const table of options.tables ?? []) registry.register(table);

      RollTableTool.registry = registry;

      ctx.registerDocumentType<RollTableAnchorData>({
        type: 'roll-table',
        schema: RollTableAnchorSchema,
        placeable: RollTableAnchor,
        layer: { label: 'Roll Tables', order: 560 },
        sceneKey: 'rollTables',
        behavior: {},
      });

      ctx.registerTool({
        tool: RollTableTool,
        hotkey: 'u',
        defaults: { ...DEFAULT_TOOL_OPTIONS, ...options.toolDefaults },
      });

      registerRollTablesContextMenu(ctx, registry);

      ctx.onDispose(() => {
        RollTableTool.registry = undefined;
      });
    },
  });

  return Object.assign(plugin, { registry });
}

export const rollTablesPlugin = createRollTablesPlugin();
