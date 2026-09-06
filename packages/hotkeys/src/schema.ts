import * as v from 'valibot';

export type Modifier = 'ctrl' | 'alt' | 'shift' | 'meta';

export const ModifierSchema = v.picklist(['ctrl', 'alt', 'shift', 'meta']);
export const KeyTokenSchema = v.pipe(v.string(), v.regex(/^[a-z0-9]+$/));

export const KeyBindSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  key: KeyTokenSchema,
  modifiers: v.pipe(v.array(ModifierSchema), v.maxLength(4)),
});

export const HotkeyProfileSchema = v.object({
  version: v.literal(1),
  overrides: v.record(v.string(), v.pipe(v.array(v.string()), v.minLength(1))),
});

export const HotkeyTriggeredSchema = v.object({
  namespace: v.string(),
  action: v.string(),
  combo: v.string(),
  phase: v.picklist(['down', 'up']),
  repeat: v.boolean(),
});

export const BindsChangedSchema = v.object({
  namespace: v.string(),
  action: v.string(),
});

export const ContextsChangedSchema = v.object({
  active: v.array(v.string()),
});

export const HotkeyErrorEventSchema = v.object({
  namespace: v.string(),
  action: v.string(),
  combo: v.string(),
  message: v.string(),
});

export const BeforeHotkeySchema = v.object({
  namespace: v.string(),
  action: v.string(),
  combo: v.string(),
  phase: v.picklist(['down', 'up']),
  veto: v.optional(v.boolean(), false),
});

export type KeyBind = v.InferOutput<typeof KeyBindSchema>;
export type HotkeyProfile = v.InferOutput<typeof HotkeyProfileSchema>;
export type HotkeyTriggeredPayload = v.InferOutput<typeof HotkeyTriggeredSchema>;
export type BindsChangedPayload = v.InferOutput<typeof BindsChangedSchema>;
export type ContextsChangedPayload = v.InferOutput<typeof ContextsChangedSchema>;
export type HotkeyErrorEventPayload = v.InferOutput<typeof HotkeyErrorEventSchema>;
export type BeforeHotkeyPayload = v.InferOutput<typeof BeforeHotkeySchema>;

export type HotkeyEventMap = {
  hotkeyTriggered: typeof HotkeyTriggeredSchema;
  bindsChanged: typeof BindsChangedSchema;
  contextsChanged: typeof ContextsChangedSchema;
  hotkeyError: typeof HotkeyErrorEventSchema;
};

export type HotkeyHookMap = {
  beforeHotkey: { strategy: 'syncWaterfall'; schema: typeof BeforeHotkeySchema };
};
