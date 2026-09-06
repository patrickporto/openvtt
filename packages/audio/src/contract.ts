import * as v from 'valibot';
import { defineContract, type Contract } from '@openvtt/events';
import type { EventBus } from '@openvtt/events';
import { UnitIntervalSchema } from './schemas';

export const audioEvents = {
  'sound:played': v.object({ soundId: v.string(), channel: v.string() }),
  'sound:paused': v.object({ soundId: v.string() }),
  'sound:stopped': v.object({ soundId: v.string() }),
  'fade:ended': v.object({ soundId: v.string(), from: v.number(), to: v.number() }),
  'volume:changed': v.object({
    target: v.picklist(['master', 'channel', 'sound']),
    id: v.optional(v.string()),
    value: v.number(),
  }),
  'mute:changed': v.object({
    target: v.picklist(['master', 'channel', 'sound']),
    id: v.optional(v.string()),
    muted: v.boolean(),
  }),
  'timeline:started': v.object({ loop: v.boolean() }),
  'timeline:ended': v.object({ loop: v.boolean() }),
} as const;

export const audioHooks = {
  beforePlay: {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({ soundId: v.string(), volume: UnitIntervalSchema, channel: v.string() }),
  },
  beforeVolume: {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({
      target: v.picklist(['master', 'channel', 'sound']),
      id: v.optional(v.string()),
      value: UnitIntervalSchema,
    }),
  },
} as const;

export const audioContract = defineContract({
  namespace: 'audio',
  events: audioEvents,
  hooks: audioHooks,
});

export type AudioEventMap = typeof audioEvents;
export type AudioHookMap = typeof audioHooks;
export type AudioContract = Contract<AudioEventMap, AudioHookMap>;
export type AudioBus = EventBus<AudioEventMap, AudioHookMap>;
