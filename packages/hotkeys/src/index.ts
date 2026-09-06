export { HotkeyManager, createHotkeyManager } from './manager';
export type { HotkeyManagerOptions } from './manager';

export { ActionRegistry, DEFAULT_CONTEXT, toInfo, toKeyBinds } from './registry';
export type {
  ActionDef,
  ActionInfo,
  HotkeyConflict,
  HotkeyEventContext,
  HotkeyHandler,
  RegisteredAction,
} from './registry';

export { KeyEngine, isEditableTarget } from './engine';
export type { EngineOptions, KeyboardTarget } from './engine';

export {
  comboId,
  eventModifiers,
  formatCombo,
  keyFromEvent,
  keyLabel,
  matchesBind,
  parseCombo,
} from './keys';
export type { ComboInput, MinimalKeyboardEvent, ParsedCombo } from './keys';

export {
  BeforeHotkeySchema,
  BindsChangedSchema,
  ContextsChangedSchema,
  HotkeyErrorEventSchema,
  HotkeyProfileSchema,
  HotkeyTriggeredSchema,
  KeyBindSchema,
  KeyTokenSchema,
  ModifierSchema,
} from './schema';
export type {
  BeforeHotkeyPayload,
  BindsChangedPayload,
  ContextsChangedPayload,
  HotkeyErrorEventPayload,
  HotkeyEventMap,
  HotkeyHookMap,
  HotkeyProfile,
  HotkeyTriggeredPayload,
  KeyBind,
  Modifier,
} from './schema';

export {
  HotkeysError,
  InvalidComboError,
  UnknownActionError,
  NotEditableError,
  InvalidProfileError,
  DuplicateActionError,
  NotAttachedError,
} from './errors';
export type { HotkeysErrorCode } from './errors';
