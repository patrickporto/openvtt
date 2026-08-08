import * as v from 'valibot';
import { createBus } from '@openvtt/events';

export const DieResultSchema = v.looseObject({
  type: v.string(),
  sides: v.number(),
  id: v.number(),
  value: v.number(),
  label: v.union([v.string(), v.number()]),
  reason: v.string(),
});

export const RollSetSchema = v.looseObject({
  num: v.number(),
  type: v.string(),
  sides: v.number(),
  rolls: v.array(DieResultSchema),
  total: v.number(),
});

export const RollResultSchema = v.looseObject({
  id: v.string(),
  notation: v.string(),
  sets: v.array(RollSetSchema),
  modifier: v.number(),
  total: v.number(),
});

export const RerollContextSchema = v.looseObject({
  die: v.any(),
  func: v.string(),
  args: v.any(),
});

export type RerollContext = v.InferOutput<typeof RerollContextSchema>;

export const diceContract = {
  namespace: 'dice',
  events: {
    ready: v.optional(v.object({})),
    'roll:start': v.object({ id: v.string(), notation: v.string() }),
    'roll:finish': RollResultSchema,
    'roll:cancel': v.looseObject({ id: v.optional(v.string()) }),
    'die:click': v.looseObject({ id: v.number(), value: v.any() }),
    'theme:change': v.object({ theme: v.string() }),
    error: v.custom<Error>((input) => input instanceof Error),
  },
  hooks: {
    shouldReroll: { strategy: 'syncBail' as const, schema: RerollContextSchema },
  },
};

export function createDiceBus() {
  return createBus(diceContract, { validate: 'warn' });
}

export type DiceBus = ReturnType<typeof createDiceBus>;
export type DiceBusEvents = typeof diceContract.events;
