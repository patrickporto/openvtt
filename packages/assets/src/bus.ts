import * as v from 'valibot';
import { createBus } from '@openvtt/events';

export const assetsContract = {
  namespace: 'assets',
  events: {
    'preload:start': v.object({ pack: v.string(), total: v.number() }),
    'preload:progress': v.object({
      pack: v.string(),
      id: v.string(),
      loaded: v.number(),
      total: v.number(),
    }),
    'preload:finish': v.object({
      pack: v.string(),
      loaded: v.number(),
      total: v.number(),
      failed: v.number(),
    }),
    'asset:load': v.object({
      id: v.string(),
      key: v.string(),
      source: v.picklist(['memory', 'adapter', 'network']),
      bytes: v.number(),
    }),
    'asset:error': v.object({ id: v.string(), message: v.string() }),
  },
  hooks: {},
};

export function createAssetsBus() {
  return createBus(assetsContract, { validate: 'warn' });
}

export type AssetsBus = ReturnType<typeof createAssetsBus>;
