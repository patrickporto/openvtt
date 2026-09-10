import * as v from 'valibot';
import { rollSchema } from '@openvtt/dice-core';

const modifierSchema = v.looseObject({
  op: v.string(),
  count: v.optional(v.number()),
  value: v.optional(v.number()),
  target: v.optional(v.number()),
  cap: v.optional(v.number()),
});

const rollTransformSchema = v.strictObject({
  addDice: v.optional(v.number()),
  addModifiers: v.optional(v.array(modifierSchema)),
  extraDice: v.optional(
    v.array(
      v.strictObject({
        count: v.number(),
        faces: v.number(),
        modifiers: v.optional(v.array(modifierSchema)),
      }),
    ),
  ),
  bonus: v.optional(v.string()),
});

export const changeSchema: v.GenericSchema = v.union([
  v.strictObject({
    kind: v.literal('value'),
    path: v.string(),
    op: v.picklist(['set', 'add', 'multiply', 'upgrade', 'downgrade', 'append', 'remove']),
    value: v.string(),
    steps: v.optional(v.number()),
    priority: v.optional(v.number()),
  }),
  v.strictObject({
    kind: v.literal('roll'),
    target: v.string(),
    transform: rollTransformSchema,
    priority: v.optional(v.number()),
  }),
  v.strictObject({
    kind: v.literal('flag'),
    path: v.string(),
    value: v.union([v.boolean(), v.string()]),
    priority: v.optional(v.number()),
  }),
]);

const durationSpecSchema = v.pipe(
  v.strictObject({
    unit: v.picklist(['seconds', 'rounds', 'turns', 'until-event']),
    value: v.optional(v.number()),
    event: v.optional(v.string()),
  }),
  v.check(
    (d) => (d.unit === 'until-event' ? d.event !== undefined : d.value !== undefined),
    'duration requires "event" for unit "until-event" and "value" otherwise',
  ),
);

export const expirationStateSchema = v.pipe(
  v.strictObject({
    unit: v.picklist(['seconds', 'rounds', 'turns', 'until-event']),
    remaining: v.optional(v.number()),
    event: v.optional(v.string()),
  }),
  v.check(
    (e) => (e.unit === 'until-event' ? e.event !== undefined : e.remaining !== undefined),
    'expiration requires "event" for unit "until-event" and "remaining" otherwise',
  ),
);

const triggerSchema = v.strictObject({
  on: v.string(),
  condition: v.optional(v.string()),
  changes: v.optional(v.array(changeSchema)),
  effect: v.optional(v.string()),
  roll: v.optional(v.union([v.string(), rollSchema])),
  rollInto: v.optional(
    v.strictObject({
      path: v.string(),
      op: v.optional(v.picklist(['add', 'subtract', 'set'])),
    }),
  ),
});

const stackingSchema = v.strictObject({
  group: v.optional(v.string()),
  mode: v.optional(v.picklist(['stack', 'newest', 'highest-priority'])),
});

const grantSchema = v.union([
  v.string(),
  v.strictObject({
    ref: v.string(),
    data: v.optional(v.record(v.string(), v.unknown())),
  }),
]);

export const effectDefinitionSchema = v.strictObject({
  id: v.string(),
  label: v.string(),
  changes: v.array(changeSchema),
  duration: v.optional(durationSpecSchema),
  triggers: v.optional(v.array(triggerSchema)),
  grants: v.optional(v.array(grantSchema)),
  condition: v.optional(v.string()),
  stacking: v.optional(stackingSchema),
  priority: v.optional(v.number()),
  icon: v.optional(v.string()),
});

const effectSourceSchema = v.strictObject({
  kind: v.string(),
  id: v.optional(v.string()),
});

export const effectInstanceSchema = v.strictObject({
  id: v.pipe(v.string(), v.uuid()),
  ref: v.optional(v.string()),
  inline: v.optional(effectDefinitionSchema),
  source: effectSourceSchema,
  enabled: v.boolean(),
  expiresAt: v.optional(expirationStateSchema),
  data: v.optional(v.record(v.string(), v.unknown())),
});

export const characterDocumentSchema = v.strictObject({
  systemId: v.string(),
  systemVersion: v.string(),
  identity: v.record(v.string(), v.unknown()),
  base: v.record(v.string(), v.unknown()),
  effects: v.array(effectInstanceSchema),
});

const rollTemplateSchema = v.strictObject({
  expr: rollSchema,
  tags: v.optional(v.array(v.string())),
});

export const systemPackSchema = v.strictObject({
  id: v.string(),
  version: v.string(),
  ordinals: v.optional(v.record(v.string(), v.array(v.string()))),
  derived: v.optional(v.record(v.string(), v.string())),
  rollTemplates: v.optional(v.record(v.string(), rollTemplateSchema)),
  definitions: v.optional(v.array(effectDefinitionSchema)),
});
