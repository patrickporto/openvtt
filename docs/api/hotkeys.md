# @openvtt/hotkeys

Declarative, context-aware hotkey management for the openvtt monorepo. Actions are registered per `namespace/action` with default binds and handlers; users can rebind them, conflicts are detected and resolved by precedence, and everything is observable through an `@openvtt/events` bus. Matching uses physical `event.code` tokens, so binds are layout independent.

**Version:** 0.1.0
**Dependencies:** `@openvtt/events`, `uuid`, `valibot`

## Installation

```bash
bun add @openvtt/hotkeys
```

```ts
import { createHotkeyManager, formatCombo } from '@openvtt/hotkeys';
```

## `createHotkeyManager(options?)`

Creates a `HotkeyManager`.

| Name | Type | Default | Description |
|------|------|---------|-------------|
| options.namespace | `string` | `'openvtt'` | Namespace for the internal event bus. |
| options.bus | `EventBus<HotkeyEventMap, HotkeyHookMap>` | auto | Reuse an existing bus instead of creating one. |
| options.skipInputs | `boolean` | `true` | Ignore keys while typing in form fields. |
| options.autoPreventDefault | `boolean` | `true` | Call `preventDefault`/`stopPropagation` when a handler claims the event. |
| options.debug | `boolean \| logger` | `false` | Log dispatch decisions. |

## `manager.register(namespace, action, def)`

Registers an action and returns its `ActionInfo` snapshot. Throws `DuplicateActionError` for repeated `namespace/action` pairs.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| def.name | `string` | — | Human-readable label (required). |
| def.hint | `string` | — | Helper text for the settings UI. |
| def.binds | `(string \| ComboInput)[]` | `[]` | Default binds, e.g. `['Ctrl+P', 'F1']`. |
| def.onDown / def.onUp | `(ctx) => boolean \| void` | — | Handlers; `true` claims the event. |
| def.repeat | `boolean` | `false` | Accept auto-repeated keydowns. |
| def.editable | `boolean` | `true` | Allow user rebinding. |
| def.precedence | `number` | `0` | Conflict resolution priority (higher wins). |
| def.context | `string` | `'global'` | Required active context. |
| def.reservedModifiers | `Modifier[]` | `[]` | Held modifiers ignored when matching. |
| def.allowInInputs | `boolean` | `false` | Fire even while typing in form fields. |

```ts
import { createHotkeyManager } from '@openvtt/hotkeys';

const hotkeys = createHotkeyManager();

hotkeys.register('core', 'ping', {
  name: 'Ping',
  binds: ['Ctrl+P', 'F1'],
  onDown: (ctx) => {
    console.log(ctx.combo, ctx.repeat);
    return true;
  },
});

hotkeys.attach();
```

## `manager.attach(target?)` / `manager.detach()`

Wires `keydown`/`keyup` listeners. `target` defaults to `window` (throws `NotAttachedError` in non-browser environments unless you pass a target). `manager.handle(event, phase?)` dispatches programmatically — useful for tests and headless setups.

## Rebinding

```ts
hotkeys.setBinds('core', 'ping', ['Ctrl+Shift+P']);
hotkeys.reset('core', 'ping');
hotkeys.resetAll();
hotkeys.getAction('core', 'ping');
hotkeys.listActions();
```

- `setBinds` throws `NotEditableError`, `UnknownActionError` or `InvalidComboError`.
- Each rebind emits `bindsChanged` on the bus.

## `manager.conflicts()`

Returns every combo bound by two or more distinct actions:

```ts
[
  {
    combo: 'ctrl+d',
    actions: [
      { namespace: 'core', action: 'delete', name: 'Delete', context: 'global', precedence: 0, editable: true },
      { namespace: 'canvas', action: 'duplicate', name: 'Duplicate', context: 'canvas', precedence: 5, editable: true },
    ],
  },
]
```

## Contexts

```ts
hotkeys.setActiveContexts(['canvas', 'sheet']);
hotkeys.activateContext('canvas');
hotkeys.deactivateContext('sheet');
hotkeys.activeContexts();
```

Actions with `context: 'canvas'` only fire while `canvas` is active. Every change emits `contextsChanged`.

## Persistence

Profiles store only overrides that differ from defaults, validated with Valibot:

```ts
hotkeys.serialize();
hotkeys.applyProfile({ version: 1, overrides: { 'core/ping': ['ctrl+shift+p'] } });
```

`applyProfile` is atomic: it validates every entry (shape, known actions, editability, combo syntax) before applying anything and throws `InvalidProfileError` otherwise.

## Events and hooks

The manager exposes a typed `@openvtt/events` bus:

| Member | Payload | Emitted when |
|--------|---------|--------------|
| event `hotkeyTriggered` | `{ namespace, action, combo, phase, repeat }` | A handler executes. |
| event `bindsChanged` | `{ namespace, action }` | Binds change, are reset or a profile is applied. |
| event `contextsChanged` | `{ active }` | The active context set changes. |
| event `hotkeyError` | `{ namespace, action, combo, message }` | A handler throws. |
| hook `beforeHotkey` (syncWaterfall) | `{ namespace, action, combo, phase, veto }` | Before each handler; a tap returning `{ ...ctx, veto: true }` skips the action. |

```ts
hotkeys.bus.on('hotkeyTriggered', (payload) => console.log(payload.combo));

hotkeys.bus.tap('beforeHotkey', 'gm-only', (ctx) =>
  ctx.action === 'danger' && !isGM() ? { ...ctx, veto: true } : undefined,
);
```

## Matching rules

- **Layout independent:** binds match on `event.code` normalized to tokens (`a`, `1`, `f1`, `numpad3`, `arrowup`, `escape`, …).
- **Modifiers:** `Ctrl`/`Control`, `Alt`/`Option`, `Shift`, `Meta`/`Cmd`/`Command`/`Win`. All four must match exactly except those in `reservedModifiers`.
- **Resolution order:** `precedence` desc, then registration order; a `true` return claims the event.
- **Inputs:** nothing fires inside `input`/`textarea`/`select`/`contenteditable` unless the action sets `allowInInputs` or the engine sets `skipInputs: false`.
- **Repeats:** auto-repeat keydowns are swallowed unless the action sets `repeat: true`.

## Combo helpers

| Function | Description |
|----------|-------------|
| `parseCombo('Ctrl+Shift+A')` | Parses and canonicalizes a combo (throws `InvalidComboError`). |
| `formatCombo({ key, modifiers })` | Display label, e.g. `Ctrl+Shift+A`, `Num 3`, `Arrow Up`. |
| `comboId({ key, modifiers })` | Canonical id, e.g. `ctrl+shift+a`. |
| `keyLabel('arrowup')` | Label for a single key token. |
| `keyFromEvent(event)` | Canonical token for a keyboard event. |
| `matchesBind(bind, event, reserved?)` | Low-level match test. |

## Adoption in the monorepo

App-level and canvas-level shortcuts go through a shared manager. `@openvtt/canvas` accepts one via `new Canvas(el, { hotkeys })` (creating and managing its own otherwise) and registers its actions in the `canvas` namespace:

| Action | Default binds | Description |
|--------|---------------|-------------|
| `canvas/tool:<id>` | `V` `H` `E` + plugin `ctx.registerTool({ hotkey })` | Switch tool. |
| `canvas/undo` | `Ctrl+Z`, `Meta+Z` | Undo. |
| `canvas/redo` | `Ctrl+Shift+Z`, `Meta+Shift+Z`, `Ctrl+Y`, `Meta+Y` | Redo. |
| `canvas/ping` | `Q` | Ping at cursor. |
| `canvas/pan` | `Space` (down/up) | Temporary pan tool. |

Apps should pass the same manager to every surface (see `apps/playground/src/hotkeys.ts`), register page actions in their own namespace (`playground/...`) and unregister on teardown.

**Widget-local keys stay local.** Transient, focus-scoped widget interactions — context menu arrow navigation, modal `Escape` in `@openvtt/canvas-plugin-window`, `Enter` inside a widget's own input — are not user-rebindable actions and keep their scoped listeners. Tool-level keys that belong to the active tool state (selection `Delete`/arrows, drawing `Enter`/`Escape`) continue to flow through the canvas state machine instead of the hotkey engine.

## Errors

`HotkeysError` (base, carries a `code`) with subclasses `InvalidComboError`, `UnknownActionError`, `NotEditableError`, `InvalidProfileError`, `DuplicateActionError` and `NotAttachedError`.
