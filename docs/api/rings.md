# @openvtt/canvas-plugin-rings

Colored-Rings-style token markers for `@openvtt/canvas`: concentric rings rendered under tokens, driven by a preset registry and custom Valibot-validated styles (color, width, alpha, shape `circle|square`, dash, pulse, glow). Rings live on the document layer, so undo/redo is free, and they round-trip through scenes via `scene.rings`. Every mutation emits semantic events, and a `syncWaterfall` style-resolution hook lets other plugins restyle rings (for example, making the active combatant's ring pulse).

**Version:** 0.1.0
**Dependencies:** `@openvtt/canvas`, `valibot`
**Peer dependencies:** `pixi.js`, `pixi-filters`

## Installation

```bash
bun add @openvtt/canvas-plugin-rings
```

```ts
import { RingsPlugin, ringsPlugin } from '@openvtt/canvas-plugin-rings';
```

The plugin depends on the tokens plugin and must be installed after it:

```ts
import { Canvas } from '@openvtt/canvas';
import { tokensPlugin } from '@openvtt/canvas-plugin-tokens';
import { ringsPlugin } from '@openvtt/canvas-plugin-rings';

const canvas = new Canvas(container);
await canvas.use(tokensPlugin);
await canvas.use(ringsPlugin);
```

It also ships in `@openvtt/canvas-preset-standard`, registered in `standardPlugins` right after `tokensPlugin`:

```ts
import { createStandardCanvas } from '@openvtt/canvas-preset-standard';

const canvas = createStandardCanvas(container);
```

Once installed, grab the plugin instance for API access:

```ts
const rings = canvas.plugins.get<RingsPlugin>('rings')!;
```

## Data model

Rings are documents of type `ring` with scene key `rings`. All IDs are UUID v7, assigned by the document layer.

### `RingData`

```ts
interface RingData {
  id?: string;       // uuid v7, assigned on create
  tokenId: string;   // owning token id
  preset?: string;   // preset id; absent for custom/anonymous rings
  label?: string;    // display label; defaults to the preset label
  order?: number;    // layout ordering; defaults to 0
  style?: RingStyle; // inline style; defaults to {}
}
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| id | `string` (uuid) | assigned | Ring id, set by the document layer on create. |
| tokenId | `string` | — | Id of the token this ring is attached to. |
| preset | `string` | — | Preset id the ring was created from. Rings added with an inline style have no preset. |
| label | `string` | — | Optional display label. |
| order | `number` | `0` | Sort key for ring layout; ties break by id. |
| style | `RingStyle` | `{}` | Resolved style (see below). |

### `RingStyle`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| color | `string` | `'#1a6aff'` | Hex color, 3 or 6 digits (`#rgb` or `#rrggbb`). |
| width | `number` | `3` | Stroke width in world units. Minimum 0.5. |
| alpha | `number` | `1` | Opacity, clamped 0–1. |
| shape | `'circle' \| 'square'` | `'circle'` | Ring outline shape. Square ignores dash. |
| dash | `number[]` | `[]` | Alternating on/off segment lengths in world units, applied around the circumference. |
| pulse | `boolean` | `false` | Oscillating alpha animation. |
| glow | `boolean` | `false` | Outer glow filter around the stroke. |

### Valibot schemas

The schemas are exported and reusable in apps that validate scene payloads:

```ts
import { RingDataSchema, RingStyleSchema, HexColorSchema, parseRing } from '@openvtt/canvas-plugin-rings';

const ring = parseRing(raw); // validates unknown input, throws on invalid
```

| Export | Description |
|--------|-------------|
| `RingDataSchema` | Valibot schema for `RingData`. |
| `RingStyleSchema` | Valibot schema for `RingStyle` with defaults applied. |
| `HexColorSchema` | `v.pipe(v.string(), v.regex(...))` matching `#rgb` and `#rrggbb`. |
| `parseRing(data)` | Parses and validates unknown input into `RingData`. |

## Context menu

The plugin registers a context menu that appears when at least one token is selected. Right-click a selected token to use it:

- **Swatch grid** — one swatch per registered preset (8 per row). A swatch shows an accent outline when any selected token already has that ring. Clicking toggles the preset on all selected tokens: if any selected token has it, it is removed from all; otherwise it is added to all. Swatch tooltips flag pulsing/glowing presets.
- **Custom color picker** — toggles an anonymous (preset-less) ring of the picked color on each selected token.
- **Clear rings** — removes every ring from all selected tokens. Disabled when no selected token has rings.

Multi-select applies to every selected token. All context-menu operations are wrapped in a single history batch (see [Undo and redo](#undo-and-redo)).

## `class RingsPlugin`

The plugin class. `ringsPlugin` is a shared singleton; `new RingsPlugin(options)` creates an independent instance with its own preset registry.

```ts
class RingsPlugin {
  constructor(options?: RingsPluginOptions);
}

interface RingsPluginOptions {
  presets?: readonly RingPresetInput[]; // extra presets registered on top of COLOR_PRESETS
  layout?: Partial<RingLayoutOptions>;  // see Layout
}
```

### Properties

| Name | Type | Description |
|------|------|-------------|
| id | `'rings'` | Plugin id. |
| name | `'Rings'` | Display name. |
| dependencies | `['tokens']` | Must be installed before this plugin. |
| layer | `RingsLayer` | Document layer hosting the rings (available after install). |
| presets | `RingPresetRegistry` | Preset registry; `COLOR_PRESETS` are always registered. |
| layout | `RingLayoutOptions` | Merged layout options. |

### Ring methods

#### `addRing(tokenId, source, options?): Promise<Ring | null>`

Adds a ring to a token. `source` is either a preset id (`string`) or an inline `RingStyleInput` (validated against `RingStyleSchema`). Returns the existing ring if the token already has a matching one (same preset, or same color for inline styles), or `null` when the preset id is unknown.

```ts
await rings.addRing(tokenId, 'bloodied');
await rings.addRing(tokenId, { color: '#ffd433', dash: [4, 4] }, { label: 'Marked' });
```

| Name | Type | Description |
|------|------|-------------|
| tokenId | `string` | Target token id. |
| source | `string \| RingStyleInput` | Preset id or inline style. |
| options.label | `string` | Overrides the preset label. |
| options.order | `number` | Overrides the layout order (defaults to the current ring count). |

#### `toggleRing(tokenId, source, options?): Promise<boolean>`

Toggles a ring: removes it if present, adds it otherwise. Resolves `true` when the ring was added, `false` when removed.

#### `removeRing(ringId): boolean`

Removes a ring by id. Returns `false` if no ring with that id exists.

#### `clearRings(tokenId): number`

Removes all rings of a token as one batched history unit and emits `rings:cleared`. Returns the number of rings removed.

#### `ringsOf(tokenId): Ring[]`

Returns all rings attached to a token, in layer order.

#### `hasRing(tokenId, source): boolean`

Whether a token has a ring matching the preset id or inline style (color-matched for anonymous rings).

### Registry and maintenance methods

| Method | Description |
|--------|-------------|
| `registerPreset(preset): this` | Registers a preset at runtime; chainable. |
| `refreshStyles(): void` | Re-resolves styles (runs the `rings:resolve-style` hook) and redraws every ring. |
| `pruneOrphans(): number` | Deletes rings whose token no longer exists, as one batched history unit. Returns the count removed. |

Calling any method that touches the layer before installation throws `[rings] plugin not installed`.

## Presets

### `RingPresetInput` / `RingPreset`

```ts
interface RingPresetInput {
  readonly id: string;
  readonly label: string;
  readonly style: RingStyleInput;
}

interface RingPreset {
  readonly id: string;
  readonly label: string;
  readonly style: RingStyle; // validated and defaulted
}
```

### `class RingPresetRegistry`

| Method | Description |
|--------|-------------|
| `register(preset): this` | Registers (or replaces) a preset; validates its style. |
| `unregister(id): boolean` | Removes a preset. |
| `get(id): RingPreset \| undefined` | Looks up a preset. |
| `has(id): boolean` | Whether a preset is registered. |
| `list(): readonly RingPreset[]` | All presets in registration order (drives the swatch grid). |

### `COLOR_PRESETS`

Twelve Owlbear-palette colors, registered by default on every `RingsPlugin`:

`blue` `#1a6aff`, `orange` `#ff7433`, `red` `#ff4d4d`, `yellow` `#ffd433`, `brown` `#b07126`, `purple` `#884dff`, `green` `#85ff66`, `forest` `#519e00`, `pink` `#eb8aff`, `cyan` `#44e0f1`, `black` `#222222`, `white` `#ffffff`.

### `CONDITION_PRESETS`

Eleven status presets, registered by default alongside the color palette (each also sets a display label):

| Id | Label | Style |
|----|-------|-------|
| `poisoned` | Poisoned | `{ color: '#519e00', dash: [4, 4] }` |
| `bloodied` | Bloodied | `{ color: '#ff4d4d', pulse: true }` |
| `burning` | Burning | `{ color: '#ff7433', pulse: true, glow: true }` |
| `blessed` | Blessed | `{ color: '#ffd433', glow: true }` |
| `frozen` | Frozen | `{ color: '#44e0f1', dash: [2, 3] }` |
| `shocked` | Shocked | `{ color: '#ffd433', dash: [2, 2], pulse: true }` |
| `cursed` | Cursed | `{ color: '#884dff', glow: true }` |
| `invisible` | Invisible | `{ color: '#222222', dash: [3, 5] }` |
| `hasted` | Hasted | `{ color: '#44e0f1', pulse: true }` |
| `charmed` | Charmed | `{ color: '#eb8aff', pulse: true }` |
| `blinded` | Blinded | `{ color: '#ffffff', width: 5 }` |

Scene payloads only need the preset id: before documents are created, the plugin expands `preset` entries into the preset's style and label (inline `style` fields still win):

```ts
rings: [
  { tokenId: heroId, preset: 'blessed' },
  { tokenId: foeId, preset: 'bloodied', style: { width: 5 } },
],
```

### Custom presets

```ts
const rings = new RingsPlugin({
  presets: [
    { id: 'shielded', label: 'Shielded', style: { color: '#44e0f1', glow: true } },
  ],
});
```

## Layout

Multiple rings on one token are laid out as concentric strokes ordered by `order` (ties break by id).

### `RingLayoutOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| spread | `'outward' \| 'inward'` | `'outward'` | Grow away from or into the token. |
| gap | `number` | `6` | World units between consecutive rings. |
| startInset | `number` | `2` | Offset of the first ring from the token edge. |

Configure via constructor (`layout` option); the merged options are readable on `plugin.layout`.

### Geometry helpers

```ts
function ringSlots(count: number, options?: RingLayoutOptions): RingSlot[];
function ringRadius(tokenRadius: number, inset: number): number;
function sortRingsForLayout<T extends { order?: number; id?: string }>(rings: readonly T[]): T[];
function dashedArcs(radius: number, dash: readonly number[], twoPi?: number): Arc[];

interface RingSlot { index: number; inset: number }
interface Arc { start: number; end: number }
```

`dashedArcs` converts a world-unit on/off pattern into arcs around the circumference; patterns longer than the circumference are scaled down to fit exactly once.

## Events and hooks

All events flow through the canvas bus (an `@openvtt/events` `EventBus`, see the [Events and hooks guide](../guides/events-and-hooks.md)). Use the `ringsBus` port for typed access:

```ts
import { ringsBus } from '@openvtt/canvas-plugin-rings';

const port = ringsBus(canvas.bus);
```

### `RingsBusPort`

| Method | Description |
|--------|-------------|
| `onRingAdded(handler): () => void` | Subscribe to `ring:added` (`RingAddedEvent`); returns unsubscribe. |
| `onRingRemoved(handler): () => void` | Subscribe to `ring:removed` (`RingRemovedEvent`); returns unsubscribe. |
| `onRingsCleared(handler): () => void` | Subscribe to `rings:cleared` (`RingsClearedEvent`); returns unsubscribe. |
| `tapResolveStyle(tapName, fn)` | Tap the `rings:resolve-style` hook. |
| `callResolveStyle(ctx)` | Invoke the hook manually. |

```ts
interface RingAddedEvent   { ring: RingData; tokenId: string }
interface RingRemovedEvent { ringId: string; tokenId: string }
interface RingsClearedEvent { tokenId: string; count: number }
```

### Style-resolution hook

`rings:resolve-style` is a `syncWaterfall` hook. Every ring's rendered style passes through it (on add, update, relayout, and `refreshStyles`), so other plugins can override styles without touching ring documents:

```ts
interface RingStyleContext {
  readonly ring: { id: string; tokenId: string; preset?: string; label?: string };
  readonly style: RingStyle;
}
```

```ts
ringsBus(canvas.bus).tapResolveStyle('initiative', (ctx) => {
  if (ctx.ring.tokenId !== activeCombatantId) return ctx;
  return { ...ctx, style: { ...ctx.style, pulse: true } };
});
rings.refreshStyles(); // re-resolve already-rendered rings
```

Return the context unchanged when the tap does not apply; the next tap in the chain receives whatever the previous one returned.

### Underlying bus events

| Event | Payload | Description |
|-------|---------|-------------|
| `ring:added` | `{ ring: RingData, tokenId }` | A ring document was created. |
| `ring:removed` | `{ ringId, tokenId }` | A ring document was deleted. |
| `rings:cleared` | `{ tokenId, count }` | All rings of a token were cleared. |
| `ring:create` / `ring:update` / `ring:delete` | `RingData` / `RingData` / `{ id }` | Document-layer events emitted on create/update/delete. |

For persistence, apps round-trip `scene.rings` by listening to the document-layer events (`ring:create`, `ring:update`, `ring:delete`, or the generic `document:create` / `document:update` / `document:delete` filtered to `type: 'ring'`) and rebuilding the payload.

## Undo and redo

Rings are documents, so the canvas history manager tracks them for free:

- `addRing` / `removeRing` record a single history unit each.
- Context-menu operations on multi-selections, `clearRings`, and `pruneOrphans` are wrapped in one batched unit per invocation.
- Deleting a token cascade-deletes its rings in one batched unit. Undo restores in two steps: first the token, then the rings.

Use `canvas.undo()` / `canvas.redo()` (also bound to the standard keyboard shortcuts) as with any other document.

## Scene ingestion

`canvas.draw(scene)` instantiates rings from the scene payload. Rings live under the scene key `rings` (equivalently `scene.documents.ring`) as an array of `RingDataInput`, referencing tokens by id:

```ts
import { v7 } from 'uuid';

const heroId = v7();
const foeId = v7();

await canvas.draw({
  width: 2000,
  height: 1500,
  grid: { type: 'square', size: 50 },
  tokens: [
    { id: heroId, x: 250, y: 250, size: 1, label: 'Hero' },
    { id: foeId, x: 600, y: 400, size: 2, label: 'Ogre' },
  ],
  rings: [
    { tokenId: heroId, preset: 'blessed' },
    { tokenId: heroId, style: { color: '#ffd433' } },
    { tokenId: foeId, preset: 'bloodied', order: 0 },
  ],
});
```

Rings whose `tokenId` matches no token are hidden rather than dropped; call `pruneOrphans()` to delete them for good.

## `class Ring`

The ring placeable (a `PlaceableObject<RingData>` rendered with pixi.js `Graphics`). Rings are non-interactive and driven by the plugin's frame sync; apps rarely touch them directly.

| Member | Type | Description |
|--------|------|-------------|
| objectType | `'ring'` | Document type. |
| document | `RingData` | Backing document. |
| resolvedStyle | `RingStyle` | Style after the resolve-style hook. |
| slot | `RingSlot` | Layout slot (`{ index, inset }`) assigned on relayout. |
| bounds | getter | Bounds box derived from slot inset and stroke width. |
| alphaMultiplier | getter | Current graphics alpha multiplier. |
| `applyGeometry(geom)` | method | Applies `{ x, y, radius, rotation, hidden }` from the owning token. |
| `setAlphaMultiplier(m)` | method | Clamps and sets the alpha multiplier (0–1). |
| `refresh()` | method | Redraws stroke, dash arcs, square shape, and glow filter. |

## Worked example

A complete setup: canvas with the standard preset, a scene with tokens and rings, a custom preset, an API toggle, and a style hook:

```ts
import { v7 } from 'uuid';
import { createStandardCanvas } from '@openvtt/canvas-preset-standard';
import { RingsPlugin, ringsBus } from '@openvtt/canvas-plugin-rings';

const heroId = v7();
const foeId = v7();

const canvas = createStandardCanvas(container);
await canvas.initialize();

await canvas.draw({
  width: 2000,
  height: 1500,
  grid: { type: 'square', size: 50 },
  tokens: [
    { id: heroId, x: 250, y: 250, size: 1, label: 'Hero' },
    { id: foeId, x: 600, y: 400, size: 2, label: 'Ogre' },
  ],
  rings: [{ tokenId: foeId, preset: 'bloodied' }],
});

const rings = canvas.plugins.get<RingsPlugin>('rings')!;

rings.registerPreset({ id: 'shielded', label: 'Shielded', style: { color: '#44e0f1', glow: true } });
await rings.addRing(heroId, 'shielded');
await rings.toggleRing(heroId, 'blue');

ringsBus(canvas.bus).tapResolveStyle('initiative', (ctx) => {
  if (ctx.ring.tokenId !== heroId) return ctx;
  return { ...ctx, style: { ...ctx.style, pulse: true } };
});
rings.refreshStyles();

ringsBus(canvas.bus).onRingAdded(({ ring, tokenId }) => {
  console.log('ring added', ring.preset ?? ring.style.color, 'on token', tokenId);
});
```

## Behavior notes

- Rings follow their token every frame: position, radius (`token size × grid / 2` + slot inset), rotation, and visibility (hidden tokens hide their rings).
- `pulse` animates alpha with a sine wave, phase-shifted per slot so stacked rings don't blink in unison.
- `glow` applies a pixi-filters `GlowFilter` (outer strength 1.5, distance derived from the stroke width).
- `dash` patterns are specified in world units and projected onto the circumference; `square` rings ignore dash.
- The singleton `ringsPlugin` shares no state with instances created via `new RingsPlugin(...)`; each has its own preset registry and layout.
- Installing without the tokens plugin throws: install `tokensPlugin` first.

## See also

- [Events and hooks guide](../guides/events-and-hooks.md)
- [@openvtt/events](./events.md)
- `@openvtt/canvas` and `@openvtt/canvas-plugin-tokens` — canvas core and the tokens plugin
- `@openvtt/canvas-preset-standard` — ships `ringsPlugin` in `standardPlugins`
