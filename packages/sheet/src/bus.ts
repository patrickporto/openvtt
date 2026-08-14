import * as v from 'valibot';
import { createBus, defineContract } from '@openvtt/events';
import type { BusOptions } from '@openvtt/events';

const instanceRef = v.looseObject({
  instanceId: v.string(),
  ref: v.optional(v.string()),
});

export const sheetContract = defineContract({
  namespace: 'sheet',
  events: {
    'effect:applied': instanceRef,
    'effect:removed': instanceRef,
    'effect:expired': instanceRef,
    'effect:enabled': instanceRef,
    'effect:disabled': instanceRef,
    computed: v.looseObject({
      patches: v.array(
        v.object({ path: v.string(), previous: v.unknown(), next: v.unknown() }),
      ),
    }),
    'trigger:fired': v.looseObject({ instanceId: v.string(), on: v.string() }),
    'trigger:roll': v.looseObject({
      instanceId: v.string(),
      on: v.string(),
      value: v.number(),
    }),
  },
});

export type SheetBus = ReturnType<typeof createSheetBus>;

export function createSheetBus(options: BusOptions = {}) {
  return createBus(sheetContract, options);
}
