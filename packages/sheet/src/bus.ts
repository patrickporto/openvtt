import * as v from 'valibot';
import { createBus, defineContract } from '@openvtt/events';
import type { BusOptions, EventBus, EventMap } from '@openvtt/events';
import { SheetError } from './errors';

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

type SheetEventMap = typeof sheetContract.events;

export interface SheetBusOptions<E extends EventMap = {}> extends BusOptions {
  readonly events?: E;
}

export type SheetBus<E extends EventMap = {}> = EventBus<SheetEventMap & E>;

export function createSheetBus<E extends EventMap = {}>(
  options: SheetBusOptions<E> = {},
): SheetBus<E> {
  const { events, ...busOptions } = options;
  if (!events) return createBus(sheetContract, busOptions) as SheetBus<E>;
  for (const name of Object.keys(events)) {
    if (name in sheetContract.events) {
      throw new SheetError(`Cannot override contract event "${name}"`, { code: 'PACK_VALIDATION' });
    }
  }
  const contract = defineContract({
    namespace: sheetContract.namespace,
    events: { ...sheetContract.events, ...events } as SheetEventMap & E,
  });
  return createBus(contract, busOptions);
}
