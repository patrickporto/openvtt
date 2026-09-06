# @openvtt/hotkeys

Declarative, context-aware **hotkey management** for OpenVTT — rebindable keymaps,
conflict detection, layout-independent matching and schema-validated persistence.
Everything Foundry VTT's keybind system offers, plus contexts, conflict reporting
and an observable event bus.

- **Declarative actions** — register `namespace/action` pairs with metadata (`name`, `hint`), default binds and `onDown`/`onUp` handlers.
- **Multiple binds per action** — e.g. `['Ctrl+P', 'F1']`; users can rebind, clear, or reset to defaults.
- **Contexts** — scope actions to `canvas`, `sheet`, `chat`… and activate/deactivate contexts at runtime. `global` actions always fire.
- **Conflict detection** — `conflicts()` reports every combo shared by two actions, with precedence and context so a settings UI can resolve it.
- **Deterministic resolution** — higher `precedence` first, registration order breaks ties; a handler returning `true` claims the event (`preventDefault` + `stopPropagation`), otherwise dispatch falls through.
- **Layout-independent** — matches on `event.code` (`KeyA`, `Digit1`, `Numpad3`), so binds behave the same on any keyboard layout.
- **Rebind management** — `editable` locks actions, overrides are diffed against defaults, and `serialize()`/`applyProfile()` round-trip user profiles (Valibot-validated, UUID v7 bind ids).
- **Observable** — built on [`@openvtt/events`](../events): `hotkeyTriggered`, `bindsChanged`, `contextsChanged`, `hotkeyError` events and a `beforeHotkey` veto hook.
- Input-field aware (`skipInputs`, per-action `allowInInputs`), repeat handling, reserved modifiers, SSR-safe (no `window` at import time), ESM + CJS, tree-shakeable.

## Install

```bash
bun add @openvtt/hotkeys
```

## Quick start

```ts
import { createHotkeyManager } from '@openvtt/hotkeys';

const hotkeys = createHotkeyManager();

hotkeys.register('core', 'ping', {
  name: 'Ping',
  hint: 'Send a ping to the GM',
  binds: ['Ctrl+P', 'F1'],
  onDown: () => {
    console.log('ping!');
    return true;
  },
});

hotkeys.attach();
```

## Rebinding, conflicts and persistence

```ts
hotkeys.setBinds('core', 'ping', ['Ctrl+Shift+P']);

hotkeys.conflicts();
hotkeys.reset('core', 'ping');

localStorage.setItem('hotkeys', JSON.stringify(hotkeys.serialize()));
hotkeys.applyProfile(JSON.parse(localStorage.getItem('hotkeys') ?? 'null') ?? { version: 1, overrides: {} });
```

Profiles contain only overrides that differ from defaults:

```json
{ "version": 1, "overrides": { "core/ping": ["ctrl+shift+p"] } }
```

## Contexts

```ts
hotkeys.register('canvas', 'measure', {
  name: 'Measure',
  binds: ['KeyM'],
  context: 'canvas',
  onDown: () => true,
});

hotkeys.activateContext('canvas');
hotkeys.activeContexts();
hotkeys.deactivateContext('canvas');
```

## Events and hooks

```ts
hotkeys.bus.on('hotkeyTriggered', (payload) => {
  console.log(payload.namespace, payload.action, payload.combo);
});

hotkeys.bus.tap('beforeHotkey', 'guard', (ctx) =>
  ctx.action === 'danger' ? { ...ctx, veto: true } : undefined,
);
```

## Conflict resolution rules

1. Actions are sorted by `precedence` (desc), then registration order (asc).
2. Each matched handler runs; a handler returning `true` claims the event —
   `preventDefault()`/`stopPropagation()` are called (unless `autoPreventDefault: false`)
   and no further action runs.
3. Throwing handlers emit `hotkeyError` and dispatch continues.

## Matching rules

- Binds match on the physical `event.code` (tokens like `a`, `1`, `f1`, `numpad3`, `arrowup`).
- Modifier aliases: `Ctrl`/`Control`, `Alt`/`Option`, `Meta`/`Cmd`/`Command`/`Win`, `Shift`.
- All four modifiers must match exactly, except those listed in `reservedModifiers`.
- Auto-repeat keydowns are swallowed unless the action sets `repeat: true`.
- While typing in `input`/`textarea`/`select`/`contenteditable` nothing fires, unless the
  engine runs with `skipInputs: false` or the action sets `allowInInputs: true`.

## Manager options

| Option | Default | Description |
| --- | --- | --- |
| `namespace` | `'openvtt'` | Namespace for the internal event bus. |
| `bus` | auto | Reuse an existing `EventBus<HotkeyEventMap, HotkeyHookMap>` instead of creating one. |
| `skipInputs` | `true` | Ignore keys while typing in form fields. |
| `autoPreventDefault` | `true` | Call `preventDefault`/`stopPropagation` when a handler claims the event. |
| `debug` | `false` | Log dispatch decisions. |

## Action definition

| Field | Default | Description |
| --- | --- | --- |
| `name` | — | Human-readable label (required). |
| `hint` | — | Optional helper text for the settings UI. |
| `binds` | `[]` | Default binds (`'Ctrl+P'` or `{ key, modifiers }`). |
| `onDown` / `onUp` | — | Handlers; return `true` to claim the event. |
| `repeat` | `false` | Accept auto-repeated keydowns. |
| `editable` | `true` | Allow user rebinding. |
| `precedence` | `0` | Conflict resolution priority. |
| `context` | `'global'` | Required active context. |
| `reservedModifiers` | `[]` | Held modifiers ignored when matching. |
| `allowInInputs` | `false` | Fire even while typing in form fields. |
