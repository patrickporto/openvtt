import * as v from 'valibot';
import { createBus } from '@openvtt/events';
import type { TableEntry } from './entry';
import type { DrawnEntry } from './resolve';

const uuidString = v.pipe(v.string(), v.uuid());

export const rollTablesContract = {
  namespace: 'roll-tables',
  events: {
    draw: v.object({
      drawId: uuidString,
      tableId: uuidString,
      tableName: v.string(),
      count: v.pipe(v.number(), v.integer(), v.minValue(0)),
      results: v.array(v.custom<DrawnEntry>((input) => typeof input === 'object' && input !== null)),
    }),
    'entry:selected': v.object({
      tableId: uuidString,
      entryId: uuidString,
      depth: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
    'table:nested': v.object({
      parentId: uuidString,
      tableRef: v.string(),
      depth: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
    'deck:empty': v.object({ tableId: uuidString }),
    'deck:reshuffle': v.object({ tableId: uuidString }),
    error: v.object({
      tableId: v.optional(uuidString),
      code: v.string(),
      message: v.string(),
    }),
  },
  hooks: {
    beforeDraw: {
      strategy: 'syncWaterfall' as const,
      schema: v.object({
        tableId: v.string(),
        tableName: v.string(),
        count: v.pipe(v.number(), v.integer(), v.minValue(0)),
        pool: v.custom<TableEntry[]>((input) => Array.isArray(input)),
        depth: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    },
    beforeResolve: {
      strategy: 'syncWaterfall' as const,
      schema: v.object({
        tableId: v.string(),
        entryId: v.string(),
        depth: v.pipe(v.number(), v.integer(), v.minValue(0)),
        result: v.custom<DrawnEntry>((input) => typeof input === 'object' && input !== null),
      }),
    },
    afterDraw: {
      strategy: 'sync' as const,
      schema: v.object({
        tableId: v.string(),
        drawId: v.string(),
        count: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    },
  },
};

export function createRollTablesBus() {
  return createBus(rollTablesContract, { validate: 'warn' });
}

export type RollTablesBus = ReturnType<typeof createRollTablesBus>;
