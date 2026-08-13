# @openvtt/dice

Framework-agnostic 3D dice roller built on three.js for rendering and cannon-es for physics, with physics executed inside a Web Worker via `@openvtt/physics`. It provides a high-level `DiceBox` API (roll dice with RPG notation, watch them settle, read results) plus lower-level services for notation parsing, dice geometry, themes, and physics-shape configuration. The package lives in `packages/3ddice` but is published as `@openvtt/dice`.

**Version:** 0.1.0
**Dependencies:** `@openvtt/assets`, `@openvtt/events`, `@openvtt/physics`, `@openvtt/render3d`, `valibot`
**Peer dependencies:** `three`, `cannon-es`

## Installation

```bash
bun add @openvtt/dice three cannon-es
```

```ts
import { DiceBox, createDiceBox } from '@openvtt/dice';
```

See the [3D dice guide](../guides/3d-dice.md) for a conceptual walkthrough, and the [assets and rendering guide](../guides/assets-and-rendering.md) for how themes and textures are resolved.

## Quick start

Adapted from `apps/playground`:

```ts
import { DiceBox } from '@openvtt/dice';

const box = new DiceBox(container, {
  assetPath: '/',
  theme: 'default',
  shadows: 'medium',
  antialias: 'smaa',
  environment: 'none',
  postprocessing: {
    enabled: true,
    outline: {
      edgeStrength: 5,
      pulsePeriod: 0,
      visibleEdgeColor: '#ffb347',
      hiddenEdgeColor: '#7a5b20',
    },
    bloom: { strength: 0.5, radius: 0.5, threshold: 0.8 },
  },
});

box.on('ready', () => console.log('dice ready'));
box.on('die:click', ({ id, value }) => console.log('clicked', id, value));
box.on('error', (err) => console.error(err));

await box.initialize();
const result = await box.roll('2d20+1d6');
console.log(result.total);

await box.reroll([result.sets[0].rolls[0].id]);
await box.updateConfig({ theme: 'default' });
box.clear();
```

## Result types

### `DieResult`

The outcome of a single die.

```ts
interface DieResult {
  type: string;    // shape id, e.g. 'd20'
  sides: number;
  id: number;      // runtime index of the die inside the box
  value: number;
  label: string;   // face label as rendered on the die
  reason?: string; // why this value was recorded (e.g. reroll bookkeeping)
}
```

### `RollResult`

The outcome of a `roll()` call.

```ts
interface RollResult {
  id: string;      // UUID v7
  notation: string;
  sets: Array<{
    num: number;
    type: string;
    sides: number;
    rolls: DieResult[];
    total: number;
  }>;
  modifier: number;
  total: number;
}
```

## `class DiceBox`

Main API. Owns the renderer, physics host, asset manager, and event bus for one dice tray.

```ts
class DiceBox {
  constructor(element: HTMLDivElement, options?: DiceBoxOptions);
}
```

| Name | Type | Default | Description |
|------|------|---------|-------------|
| element | `HTMLDivElement` | — | Container element the canvas is mounted into. |
| options | `DiceBoxOptions` | `{}` | See [DiceBoxOptions](#diceboxoptions). |

### Properties

| Name | Type | Description |
|------|------|-------------|
| bus | `DiceBus` (readonly) | Underlying `@openvtt/events` bus for this box. |
| initialized | `boolean` | Whether `initialize()` has completed. |
| disposed | `boolean` | Whether `destroy()` has been called. |
| rolling | `boolean` | Whether a roll is currently in flight. |
| running | `boolean` | Whether the render loop is active. |
| selectedIds | `Set<number>` | Ids of dice currently selected in the tray. |

### Lifecycle methods

#### `initialize(): Promise<void>`

Loads assets, starts the physics worker, and prepares the scene. Emits `ready` when done. Must be awaited before rolling.

#### `destroy(): void`

Disposes the renderer, physics host, worker, and event subscriptions. The instance cannot be reused afterwards.

### Rolling methods

#### `roll(notation): Promise<RollResult>`

Clears the tray, throws the given notation, simulates physics to completion, animates playback, and resolves with the result. Rolls are queued according to `queueMode`. Rejects with `RollCancelledError` if `clear()` or `cancel()` is called while pending.

```ts
const result = await box.roll('2d20+1d6+3');
```

#### `add(notation): Promise<DieResult[]>`

Throws additional dice into the tray without clearing existing dice.

#### `reroll(diceIds: number[]): Promise<DieResult[]>`

Re-throws the dice with the given runtime ids and returns their new results. Consults the `shouldReroll` hook (see `registerRethrowFunction`) before each die.

#### `remove(diceIds: number[]): Promise<DieResult[]>`

Removes dice from the tray and returns the results they had recorded.

#### `clear(): void`

Removes all dice and rejects any pending roll promise with `RollCancelledError`.

#### `cancel(): void`

Cancels the current roll; the pending `roll()` promise rejects with `RollCancelledError`.

#### `getDiceResults(): RollResult` / `getDiceResults(id: number): DieResult`

Reads results without rolling. With no argument, returns the aggregated result for everything currently in the tray; with an id, returns that die's result.

### Configuration methods

#### `updateConfig(options?: Partial<DiceBoxOptions>): Promise<void>`

Applies incremental changes at runtime. Supports `theme`, `environment`, `shadows`, `postfx`, and `sounds`. Other options (notably `antialias`) require a new instance.

#### `setShadowQuality(quality: ShadowQuality | boolean): void`

Sets shadow quality. `true` maps to `'medium'`, `false` to `'none'`.

#### `toggleShadows(enabled: boolean): void`

Shortcut for enabling/disabling shadows.

#### `setDimensions(dimensions: THREE.Vector2): void`

Resizes the tray to the given pixel dimensions.

#### `renderFrame(): void`

Renders a single frame. Useful when the render loop is paused.

#### `loadTheme(): Promise<void>` / `loadSounds(): Promise<void>` / `loadAudio(src): Promise<HTMLAudioElement>`

Asset-loading helpers; normally driven internally by `initialize()` and `updateConfig()`.

### Throw and face helpers

| Method | Description |
|--------|-------------|
| `vectorRand(v)` | Randomizes a throw vector. |
| `getNotationVectors(notation, vector, boost, dist)` | Computes per-die throw vectors for a notation. |
| `startClickThrow(notation)` | Begins an interactive click-and-drag throw. |
| `spawnDice(vectordata)` | Spawns dice from precomputed vector data. |
| `swapDiceFace(dicemesh, result): Promise<void>` | Rotates a die mesh so the given result faces up. Async: awaits material generation. |
| `swapDiceFace_D4(dicemesh, result): Promise<void>` | D4-specific variant (result is read from the base). Async. |

### Selection methods

| Method | Description |
|--------|-------------|
| `showSelector(dice?)` | Shows the dice selector overlay, optionally restricted to given shapes. |
| `select(dieIds)` | Marks dice as selected (updates `selectedIds`). |
| `clearSelection()` | Clears the current selection. |
| `clearDice()` | Removes all dice meshes from the scene. |

### Events

#### `on(event, handler)` / `off(event, handler)` / `once(event, handler)`

Subscribe to [DiceBoxEvents](#diceboxevents). `on` and `once` return an unsubscribe function.

```ts
const off = box.on('roll:finish', (result) => console.log(result.total));
off();
```

#### `registerRethrowFunction(name, fn): void`

Registers a named tap on the `shouldReroll` `syncBail` hook. The function decides whether a given die should be rerolled.

```ts
box.registerRethrowFunction('rage', (dicemesh, args) => {
  return dicemesh.getLastValue() === 1;
});
```

| Name | Type | Description |
|------|------|-------------|
| name | `string` | Tap name (used for ordering/debugging). |
| fn | `(dicemesh: DiceMesh, args: unknown[]) => boolean` | Return `true` to reroll the die. |

## `createDiceBox(element, options?)`

Factory equivalent of `new DiceBox(...)`.

```ts
function createDiceBox(element: HTMLDivElement, options?: DiceBoxOptions): DiceBox;
```

## `DiceBoxEvents`

Event map emitted on `DiceBox.bus` and through `on`/`off`/`once`.

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | `void` | `initialize()` completed. |
| `roll:start` | `{ id: string; notation: string }` | A roll began. |
| `roll:finish` | `RollResult` | A roll completed. |
| `roll:cancel` | `{ id?: string }` | A roll was cancelled. |
| `die:click` | `{ id: number; value: number }` | A die was clicked. |
| `theme:change` | `{ theme: string }` | The active theme changed. |
| `error` | `Error` | An error occurred. |

## `DiceBoxOptions`

All fields are optional; defaults shown below.

| Name | Type | Default | Description |
|------|------|---------|-------------|
| assetPath | `string` | `'./'` | Base path for themes, textures, environments, and models. |
| worker | `boolean` | `true` | Run physics in a Web Worker (falls back to main thread on failure). |
| workerFactory | `() => Worker` | — | Custom worker constructor. Takes precedence over `workerUrl`. |
| workerUrl | `string \| URL` | — | Custom worker script URL. |
| antialias | `'none' \| 'msaa' \| 'smaa'` | `'smaa'` | Antialiasing mode. Changing it requires a new `DiceBox` instance. |
| shadows | `ShadowQuality \| boolean` | `'medium'` | Shadow quality; `true` → `'medium'`, `false` → `'none'`. |
| environment | `EnvironmentSpec` | `'none'` | IBL environment (named, HDR URL, or 6-face cubemap). |
| environmentIntensity | `number` | `1` | Intensity multiplier for the environment map. |
| postprocessing | `PostFXOptions` | `{ enabled: false, bloom: false, outline: false, antialias: 'smaa' }` | Post-processing pipeline options. |
| normalMaps | `boolean` | `false` | Convert bump maps to normal maps. |
| theme | `string` | `'default'` | Theme id from the theme registry. |
| surface | — | — | Custom surface override. |
| customColorset | `DiceStyle \| null` | `null` | Ad-hoc colorset applied on top of the theme. |
| texture | — | — | Texture override. |
| material | — | — | Material override. |
| sounds | `boolean` | `false` | Enable collision/roll sounds. |
| volume | `number` | `100` | Sound volume (0–100). |
| strength | `number` | `1` | Throw strength multiplier. |
| gravityMultiplier | `number` | `400` | Scene gravity multiplier. |
| lightIntensity | `number` | `0.7` | Spotlight intensity. |
| baseScale | `number` | `100` | Base dice scale used by the factory. |
| timestep | `number` | `1/60` | Physics timestep in seconds. |
| iterationLimit | `number` | `1000` | Max physics iterations per simulation. |
| maxPixelRatio | `number` | `2` | Renderer pixel-ratio cap. |
| queueMode | `QueueMode` | `'serial'` | How concurrent `roll()` calls are scheduled. |
| dracoPath | `string` | — | Path to Draco decoder for compressed models. |
| colorSpotlight | `number` | `0xefdfd5` | Spotlight color. |
| sound_dieMaterial | `string` | `'plastic'` | Material key used to pick impact sounds. |
| scale | `number` | — | Per-die scale override. |
| onRollComplete | `(result: RollResult) => void` | — | Convenience callback invoked after each roll. |
| assets | `{ manager?, preload?, includeLazy? }` | — | Asset manager injection and preload behavior. |

### Deprecated option aliases

Each alias still works but logs a one-time warning. Prefer the new name.

| Deprecated | Replacement |
|------------|-------------|
| `framerate` | `timestep` |
| `theme_colorset` | `theme` |
| `theme_customColorset` | `customColorset` |
| `theme_surface` | `surface` |
| `theme_texture` | `texture` |
| `theme_material` | `material` |
| `gravity_multiplier` | `gravityMultiplier` |
| `light_intensity` | `lightIntensity` |
| `color_spotlight` | `colorSpotlight` |

## Config helpers

### `DiceBoxOptionsSchema`

Valibot schema (`v.GenericSchema`) validating `DiceBoxOptions`.

### `validateOptions(options)`

Validates options against `DiceBoxOptionsSchema`; throws on invalid input.

### `normalizeShadows(shadows): ShadowQuality`

Normalizes `boolean | ShadowQuality` to a `ShadowQuality` (`true` → `'medium'`, `false` → `'none'`).

### `normalizeOptions(rawOptions): DiceBoxOptions`

Applies defaults, resolves deprecated aliases, and normalizes fields into a fully-populated options object.

### Types

```ts
type ShadowQuality = 'none' | 'low' | 'medium' | 'high';
type QueueMode = 'serial' | 'replace' | 'parallel';
```

- `serial`: rolls run one at a time, in call order.
- `replace`: a new roll cancels the pending (not yet started) rolls ahead of it.
- `parallel`: rolls are simulated independently.

## `class DiceNotation`

RPG notation parser.

```ts
class DiceNotation {
  constructor(notation: string | { notation: string });
  get error(): boolean;
  get notation(): string;
  get result(): unknown;  // forced results declared after '@'
  get boost(): number;
  get set(): DiceSet[];
  get constant(): number;
  get op(): string | undefined;
  get vectors(): unknown;
  stringify(full?: boolean): string; // full defaults to true
  addSet(...args): void;
  static mergeNotation(prev, next): string;
}
```

Supported syntax:

- Standard sets: `2d20`, `1d6`, `d%`
- Operators between sets/constants: `+`, `-`, `*`, `/`, `%`, `^`
- Parenthesized groups: `(2d6+3)*2`
- Styles in brackets: `1d20[boon]`, `1d20[bane]`
- Registered face functions: `1dF{func,args}` style via `{func,args}` after a set
- Forced results after `@`: `2d6@3,4`
- `!` rage boost: rerolls maximum results, up to 4 boosts and a maximum of 12 dice

### `DiceSet`

```ts
interface DiceSet {
  num: number;     // number of dice
  type: string;    // shape id, e.g. 'd20'
  sid: number;     // set id
  gid: number;     // group id
  glvl: number;    // group nesting level
  func?: string;
  args?: string;
  op?: string;
  style?: string;  // 'boon' | 'bane' | custom
}
```

## `class DicePreset`

Per-shape configuration (labels, mass, geometry) for one dice shape.

```ts
class DicePreset {
  constructor(name: DiceShape); // throws 'Dice type unavailable' for unknown shapes
  get shape(): DiceShape;
  get type(): string;
  get labels(): string[];
  get normals(): number[][];
  get valueMap(): Record<number, number>;
  get values(): { min: number; max: number };
  get font(): string;
  get color(): string;
  get mass(): number;
  get inertia(): number;
  get scale(): number;
  get geometry(): THREE.BufferGeometry;
  get display(): unknown;
  get system(): unknown;
  get bumpMaps(): unknown;
  setValues(min?: number, max?: number, step?: number): void; // defaults 1, 20, 1
  setValueMap(map: Record<number, number>): void;
  registerFaces(faces, type?): void;
  setLabels(labels: string[]): void;
  setBumpMaps(normals): void;
}
```

## `class DiceColors`

Colorset construction and lookup.

```ts
class DiceColors {
  constructor(options?: { assetPath?: string; resolver?: (url: string) => string });
  getColorSet(options): DiceStyle;
  getColorSetForDiceType(themeName: string, kind: 'd20' | 'boon' | 'bane' | 'default'): DiceStyle;
  makeColorSet(options: {
    name?: string;
    foreground?: string; // default '#ffffff'
    background?: string; // default '#000000'
    outline?: string;
    edge?: string;
    font?: string;
    texture?: string;
    material?: string;   // default 'plastic'
    emissive?: boolean;  // default false
    labels?: string[];
  }): DiceStyle;
}
```

## `class DiceFactory`

Creates dice meshes, geometries, materials, and physics shapes.

```ts
class DiceFactory {
  constructor(options?: {
    baseScale?: number;    // default 100
    bumpMapping?: boolean; // default true
    scale?: number;
    assetPath?: string;    // default './'
    normalMaps?: boolean;  // default false
    dracoPath?: string;
    resolver?: (url: string) => string;
  });
}
```

| Method | Description |
|--------|-------------|
| `create(type)` | Creates a dice mesh for the given shape. |
| `createWithColorSet(type, colordata)` | Creates a dice mesh with an explicit colorset. |
| `get(type)` | Returns the preset for a shape. |
| `getGeometry(type)` | Returns the cached geometry for a shape. |
| `getShapeDescriptor(type)` | Returns the physics `ShapeDescriptor` for a shape. |
| `loadModel(diceobj)` | Loads a registered external model (see `registerDiceModel`). |
| `createNoiseTexture(size = 512, intensity = 0.5)` | Generates a procedural noise texture. |
| `createMaterials(...)` / `createTextMaterial(...)` | Builds body and face-label materials. |
| `applyColorSet(colordata)` | Applies a colorset to newly created dice. |
| `setRandomColors()` | Randomizes foreground/background colors. |
| `setMaterialInfo(colorset?)` | Rebuilds material cache info. |
| `setBumpMapping(enabled: boolean)` | Toggles bump mapping. |
| `updateConfig(options)` | Incrementally updates factory options. |
| `calculateTextureSize(approx)` | Picks a texture size near the requested value. |
| `createPhysicsShape(vertices, faces, radius)` | Builds a convex physics shape. |
| `createBasicDiceGeometry(...)` / `createD10Geometry(...)` | Shape-specific geometry builders. |
| `createChamferedGeometry(vectors, faces, chamfer)` | Chamfers a polyhedron. |
| `createDiceGeometry(...)` / `createGeometry(type, radius, geometryFunction?)` | Geometry entry points. |
| `disposeCachedMaterials()` / `disposeMaterialCaches()` | Frees cached materials. |

### `DiceMesh`

Dice meshes are `THREE.Mesh` instances extended at runtime:

| Member | Type | Description |
|--------|------|-------------|
| `getFaceValue()` | `() => number` | Reads the currently upward face value. |
| `storeRolledValue(reason?)` | method | Records the face value as this die's result. |
| `getLastValue()` | `() => number` | Last recorded result. |
| `ignoreLastValue(ignore: boolean)` | method | Excludes/includes the last value in aggregations. |
| `setLastValue(result)` | method | Overrides the last recorded result. |
| `result` | `number[]` | Recorded results (multiple entries for reroll chains). |
| `shape` | `DiceShape` | Shape id. |
| `rerolls` | `number` | Number of times this die was rerolled. |
| `resultReason` | `string` | Why the last result was recorded. |
| `mass` | `number` | Physics mass. |
| `notation` | `object` | Back-reference to the parsed notation entry. |
| `body` | `object` | Physics body handle. |

## Registries

### Themes

```ts
function registerTheme(id: string, theme: DiceTheme): void;
function getTheme(id: string): DiceTheme;
function listThemes(): string[];
function hasTheme(id: string): boolean;
```

### Textures

```ts
function registerTexture(id: string, texture: TextureEntry): void;
function getTexture(id: string): TextureEntry;
function listTextures(): string[];
```

### Materials

```ts
function registerMaterial(id: string, material: MaterialOptions): void;
function getMaterial(id: string): MaterialOptions;
function listMaterials(): string[];
```

### Dice models

Register an external GLTF/GLB model as a dice shape.

```ts
function registerDiceModel(model: {
  type: string;
  url: string;
  scale?: number;
  physicsShape?: 'auto' | 'sphere' | 'box' | { kind: string; /* ... */ }; // default 'auto'
  draco?: boolean;
}): void;
function getDiceModel(type: string): RegisteredDiceModel;
function listDiceModels(): string[];
```

## Bus

The package defines an `@openvtt/events` contract used by every `DiceBox`.

### `diceContract`

Namespace `dice`. Events match [DiceBoxEvents](#diceboxevents). Hooks:

| Hook | Strategy | Context |
|------|----------|---------|
| `shouldReroll` | `syncBail` | `RerollContext` |

```ts
interface RerollContext {
  die: DiceMesh;
  func: string;   // registered rethrow function name
  args: unknown[];
}
```

### `createDiceBus(): DiceBus`

Creates a standalone bus from `diceContract`. `DiceBusEvents` is the exported event-map type.

## Errors

```ts
class DiceError extends Error {
  code?: string;
}

class RollCancelledError extends DiceError {
  code = 'ROLL_CANCELLED';
}

class AssetLoadError extends DiceError {
  code = 'ASSET_LOAD';
}
```

`roll()` promises reject with `RollCancelledError` when `clear()` or `cancel()` interrupts them. `AssetLoadError` wraps theme/texture/model loading failures.

## `buildDiceManifest(config, surface): AssetManifest`

Builds an `@openvtt/assets` manifest for the assets a given configuration needs (theme textures, environments, sounds, models). Useful for preloading; see the [assets and rendering guide](../guides/assets-and-rendering.md).

## Constants

### `DiceShapes` and `DiceShape`

```ts
const DiceShapes = {
  d2: 'd2', d4: 'd4', d6: 'd6', d8: 'd8',
  d10: 'd10', d12: 'd12', d20: 'd20', d100: 'd100',
} as const;

type DiceShape = keyof typeof DiceShapes;
```

### `DICE`

Per-shape presets: labels, values, mass, inertia, scale, plus tuning constants such as `COIN_VELOCITY_Z = 3000`.

### `DICE_GEOM`

Geometry vertex/face data per shape.

### `THEMES`

Built-in theme registry. Only `'default'` ships with the package; register more with `registerTheme`.

```ts
interface DiceStyle {
  foreground: string;
  background: string;
  outline?: string;
  edge?: string;
  texture: string;
  material: string;
  font: string;
  fontOffsetY?: number;
  labels?: string[];
  emissive?: boolean;
  materialOptions?: Partial<MaterialOptions>;
}

interface DiceTheme {
  name: string;
  description?: string;
  author?: string;
  showColorPicker?: boolean;
  surface: unknown;
  category: string;
  dice: DiceStyle;
  d20?: Partial<DiceStyle>;
  boon?: Partial<DiceStyle>;
  bane?: Partial<DiceStyle>;
  cubeMap?: string[]; // 6 faces; overrides the global environment when present
}
```

### `TEXTURELIST` and `TextureEntry`

Approximately 28 built-in textures: `none`, `astral`, `bronze01`–`bronze04`, `cheetah`, `cloudy`, `dragon`, `feather`, `fire`, `glitter`, `ice`, `leopard`, `lizard`, `marble`, `metal`, `paper`, `skulls`, `speckles`, `stainedglass`, `stars`, `stone`, `tiger`, `water`, `wood`.

```ts
interface TextureEntry {
  name: string;
  composite?: string;
  source: string;      // diffuse texture URL (relative to assetPath)
  source_bump: string; // bump map URL
  material: string;    // material key from MATERIALTYPES
}
```

### `MATERIALTYPES` and `MaterialOptions`

Approximately 17 material presets: `none`, `perfectmetal`, `metal`, `wood`, `glass`, `chrome`, `pristine`, `iridescent`, `stone`, `ice`, `marble`, `glitter`, `paper`, `silk`, `astral`, `gem`.

```ts
interface MaterialOptions {
  name: string;
  type?: 'standard' | 'physical' | 'phong';
  color?: string;
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  iridescenceThicknessRange?: [number, number];
  roughnessMap?: string;
  transmission?: number;
  thickness?: number;
}
```

### Physics and scene tuning

| Constant | Selected fields | Description |
|----------|-----------------|-------------|
| `PHYSICS` | `GRAVITY_MULTIPLIER: -9.8`, `SOLVER_ITERATIONS: 14`, `LINEAR_DAMPING: 0.1`, `ANGULAR_DAMPING: 0.1`, `SLEEP_SPEED_LIMIT: 75`, `SLEEP_TIME_LIMIT: 0.9`, `REROLL_VELOCITY`, `REROLL_ANGULAR` | cannon-es world tuning. |
| `MATERIALS` | `FRICTION: 0.6`, `DESK_RESTITUTION: 0.5`, `BARRIER_RESTITUTION: 1.0` | Contact material parameters. |
| `CAMERA` | `FOV: 20`, `NEAR: 1`, `FAR_MULTIPLIER: 1.3`, `ANGLE: Math.PI / 4` | Camera setup. |
| `POSITION` | `WALL_SCALE: 0.93`, `CONTAINER_SCALE: 6` | Tray and wall sizing. |
| `ANIMATION` | `SOUND_DELAY: 10`, `MIN_SOUND_SPEED: 250`, `SOUND_VOLUME_DIVIDER: 8000`, `AFTER_THROW_TIME_DIFF: 3` | Playback and sound timing. |

## Re-exports

The package re-exports selected APIs from its dependencies for convenience:

- From `@openvtt/assets`: `AssetManager` and asset types (`AssetManifest`, `AssetEntry`, etc.). See [assets API](./assets.md).
- From `@openvtt/physics`: `createPhysicsHost` and physics types (`PhysicsHost`, `ShapeDescriptor`, etc.). See [physics API](./physics.md).
- From `@openvtt/render3d`: `AntialiasMode`, `BloomOptions`, `OutlineOptions`, `PostFXOptions`, `EnvironmentSpec`, `EnvironmentName`, `EnvironmentHandle`. See [render3d API](./render3d.md).

## Behavior notes

- The roll pipeline simulates physics to completion off-screen, then animates the recorded states as playback. What you see is a replay of a fully determined simulation.
- Playback advances at most 5 physics substeps per rendered frame.
- The renderer uses ACES tone mapping with exposure 1.2, sRGB output, and `PCFSoftShadowMap` shadows.
- Display coordinates use half-pixel units internally.
- A theme's `cubeMap` (6 faces) overrides the global `environment` while that theme is active.
- `clear()` and `cancel()` reject pending roll promises with `RollCancelledError`.

## See also

- [3D dice guide](../guides/3d-dice.md)
- [Assets and rendering guide](../guides/assets-and-rendering.md)
- [Getting started](../guides/getting-started.md)
- [@openvtt/assets](./assets.md), [@openvtt/physics](./physics.md), [@openvtt/render3d](./render3d.md), [@openvtt/events](./events.md)
