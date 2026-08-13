# 3D dice

`@openvtt/dice` (source in `packages/3ddice`) is a framework-agnostic 3D dice roller: three.js rendering, cannon-es physics in a Web Worker, themes and textures, sounds, post-processing, and a full roll lifecycle API. It composes the lower-level packages [@openvtt/physics, @openvtt/render3d, @openvtt/assets](assets-and-rendering.md) — you can use those standalone, but `DiceBox` is the batteries-included entry point.

- [API reference](../api/dice.md)

## Creating a box

```html
<div id="dice-container" style="width: 100%; height: 480px"></div>
```

```ts
import { DiceBox } from '@openvtt/dice';

const container = document.querySelector<HTMLDivElement>('#dice-container')!;

const diceBox = new DiceBox(container, {
  assetPath: '/',
  theme: 'default',
});

diceBox.on('ready', () => console.log('ready to roll'));
await diceBox.initialize();
```

- The container must be a `HTMLDivElement` with a real size; the renderer tracks its `clientWidth`/`clientHeight` (debounced on window resize).
- `assetPath` is the URL prefix for textures, sounds, and environment maps.
- `initialize()` boots the renderer, physics host, assets, environment, and theme, then emits `ready`. Rolling before `ready` is not supported — wait for the event or the returned promise.
- There is also `createDiceBox(element, options)`, a thin factory over the constructor.

## DiceBoxOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `assetPath` | `string` | `'./'` | Base URL for dice assets |
| `worker` | `boolean` | `true` | Run physics in a Web Worker (falls back to main thread) |
| `workerFactory` / `workerUrl` | — | — | Custom worker construction |
| `antialias` | `'none' \| 'msaa' \| 'smaa'` | `'smaa'` | AA mode; changing it later requires a new instance |
| `shadows` | `'none' \| 'low' \| 'medium' \| 'high' \| boolean` | `'medium'` | Shadow quality (`true` → medium, `false` → none) |
| `environment` | `EnvironmentSpec` | `'none'` | `'neutral' \| 'tavern' \| 'neon' \| 'none'`, `{ source }` HDR, or `{ cubeMap }` |
| `environmentIntensity` | `number` | `1` | Scene environment intensity |
| `postprocessing` | `PostFXOptions` | `{ enabled: false, bloom: false, outline: false }` | Bloom/outline/AA composer |
| `normalMaps` | `boolean` | `false` | Use texture bump maps as normal maps |
| `theme` | `string` | `'default'` | Theme id from the theme registry |
| `surface` | `string` | theme's surface | Theme id to take the rolling surface from |
| `customColorset` | `object \| null` | `null` | Inline colorset via `DiceColors.makeColorSet` |
| `texture` | `string` | theme's texture | Texture id from `TEXTURELIST` |
| `material` | `string` | theme's material | Material id from `MATERIALTYPES` |
| `sounds` | `boolean` | `false` | Enable collision sounds |
| `volume` | `number` | `100` | Sound volume 0–100 |
| `strength` | `number` | `1` | Throw strength multiplier |
| `gravityMultiplier` | `number` | `400` | Scales gravity (× −9.8 internally) |
| `lightIntensity` | `number` | `0.7` | Key light intensity |
| `baseScale` | `number` | `100` | Base die size in scene units |
| `timestep` | `number` | `1/60` | Physics fixed timestep |
| `iterationLimit` | `number` | `1000` | Max simulation steps before a throw settles |
| `maxPixelRatio` | `number` | `2` | Cap for `window.devicePixelRatio` |
| `queueMode` | `'serial' \| 'replace' \| 'parallel'` | `'serial'` | How concurrent `roll()` calls are scheduled |
| `dracoPath` | `string` | — | Draco decoder path for compressed models |
| `colorSpotlight` | `number` | `0xefdfd5` | Spotlight color |
| `assets` | `{ manager?, preload?, includeLazy? }` | — | `@openvtt/assets` integration (see below) |

Deprecated snake_case aliases (`theme_colorset`, `gravity_multiplier`, `framerate`, ...) still work and log a deprecation warning.

## Lifecycle

```ts
const diceBox = new DiceBox(container, options);
diceBox.on('ready', () => { /* safe to roll */ });
await diceBox.initialize();

// ... later, when tearing down:
diceBox.destroy();
```

`destroy()` tears down everything: physics host, renderer (including WebGL context loss), post-processing, environment cache, sounds, selection, and the internal event bus. State getters: `initialized`, `disposed`, `rolling`, `running` (any animation in flight), `selectedIds`.

## Rolling

```ts
const result = await diceBox.roll('2d20+1d6');   // fresh throw, clears previous dice
await diceBox.add('1d6');        // throw more dice onto the existing ones
await diceBox.reroll([2, 3]);    // re-toss dice by id
await diceBox.remove([1]);       // remove dice by id
diceBox.clear();                 // remove all dice (no event)
diceBox.cancel();                // abort the in-flight roll, emits 'roll:cancel'
```

`roll` accepts a string or an array of strings (joined with `+`). It resolves with the full `RollResult` once all dice are asleep. If a queued or in-flight roll is superseded (`clear`, `cancel`, or `queueMode: 'replace'`), its promise rejects with `RollCancelledError` — always catch it:

```ts
try {
  const result = await diceBox.roll('6d6');
} catch (error) {
  if (!(error instanceof RollCancelledError)) throw error;
}
```

### Queue modes

| Mode | Behavior |
|---|---|
| `serial` (default) | Rolls run one at a time, in call order |
| `replace` | A new roll cancels whatever is queued/running |
| `parallel` | Rolls are not serialized |

## Box notation

The 3D box parser is its own dialect (separate from the canonical IR notation in [Dice rolling](dice-rolling.md)):

```text
2d6+1d20        sets joined by +, -, *, /
3d6[boon]       style variants: [boon], [bane] (colored per theme)
2d6@1,4         forced results — dice land on the listed faces
1d20!           rage boost: '!' multiplies throw force (up to 3 bangs)
2d6{even}       rethrow function call: re-roll dice until fn says stop
```

Rethrow functions are registered by name and receive the die mesh plus the args from `{name,args}`:

```ts
diceBox.registerRethrowFunction('even', (dicemesh, args) => {
  return dicemesh.getLastValue().value % 2 === 0;   // true → keep, false → reroll
});
await diceBox.roll('6d6{even}');
```

Under the hood, `{func,args}` dispatches through the `shouldReroll` **syncBail hook** on the box's event bus — the first tap returning a boolean wins.

## RollResult shape

```ts
interface RollResult {
  id: string;          // UUID v7 of this roll
  notation: string;    // normalized notation that was rolled
  sets: Array<{
    num: number;       // dice in the set
    type: string;      // e.g. 'd20'
    sides: number;
    rolls: DieResult[];// { type, sides, id, value, label, reason }
    total: number;
  }>;
  modifier: number;    // constant part, e.g. the +3 in '1d20+3'
  total: number;       // modifier + all set totals
}
```

Each `DieResult.id` is the die's stable index, used by `reroll`, `remove`, and selection.

## Events

Subscribe with `diceBox.on(event, handler)` (also `once` / `off`; every `on` returns an unsubscribe):

| Event | Payload | When |
|---|---|---|
| `ready` | — | `initialize()` completed |
| `roll:start` | `{ id, notation }` | A roll begins (`id` is a UUID v7) |
| `roll:finish` | `RollResult` | All dice settled |
| `roll:cancel` | `{ id? }` | Roll cancelled |
| `die:click` | `{ id, value }` | A die was clicked |
| `theme:change` | `{ theme }` | Theme changed via `updateConfig` |
| `error` | `Error` | Initialization or runtime failure |

## Selection

Clicking a die emits `die:click`; highlight it with the outline pass:

```ts
diceBox.on('die:click', ({ id }) => diceBox.select([id]));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') diceBox.clearSelection();
});
```

`select(ids)` outlines the given dice (requires the outline post-processing pass to be enabled to be visible); `clearSelection()` clears it. `diceBox.selectedIds` exposes the current set.

## Themes, textures, materials

Three registries, all extensible at runtime:

```ts
import {
  registerTheme, listThemes, getTheme,
  registerTexture, listTextures,
  registerMaterial, listMaterials,
  TEXTURELIST, MATERIALTYPES, DiceColors,
} from '@openvtt/dice';

listThemes();     // built-ins plus anything registered
listTextures();   // ~28 textures in TEXTURELIST (metal, wood, galaxy, ...)
listMaterials();  // ~17 material presets in MATERIALTYPES (plastic, metal, glass, ...)

registerTheme('my-theme', { /* DiceTheme */ });
```

Apply per-instance via options or live:

```ts
const diceBox = new DiceBox(container, {
  assetPath: '/',
  theme: 'galaxy',
  texture: 'bronze01',
  material: 'metal',
});

// fully custom colors (foreground/background/texture/material/font):
const diceBox2 = new DiceBox(container2, {
  assetPath: '/',
  customColorset: {
    foreground: '#ffd700',
    background: '#202040',
    outline: '#000000',
    texture: 'none',
    material: 'plastic',
  },
});
```

`customColorset` is processed by `DiceColors.makeColorSet`, the same pipeline themes use, so labels and per-face colors render exactly like a registered theme.

## Custom dice models

Register GLTF/GLB models (optionally Draco-compressed) as dice types:

```ts
import { registerDiceModel } from '@openvtt/dice';

registerDiceModel({
  type: 'd20',                 // replace or add a die type
  url: 'models/my-d20.glb',
  scale: 1.0,
  physicsShape: 'auto',        // or 'sphere' | 'box' | explicit descriptor
  draco: true,                 // needs dracoPath in DiceBoxOptions
});
```

## Environments

The `environment` option accepts:

- A named HDR: `'neutral'`, `'tavern'`, `'neon'` (loaded from `environments/<name>.hdr` under `assetPath`), or `'none'`.
- `{ source: 'path/to.env.hdr' }` — any HDR file.
- `{ cubeMap: [px, nx, py, ny, pz, nz] }` — six face URLs.

Themes may carry their own `cubeMap`, which takes precedence over the configured environment. HDR/cubemap textures are converted to PMREM and cached globally; a procedural gradient is the fallback when a file fails to load.

## Post-processing

```ts
const diceBox = new DiceBox(container, {
  assetPath: '/',
  postprocessing: {
    enabled: true,
    bloom: { strength: 0.5, radius: 0.5, threshold: 0.8 },
    outline: {
      edgeStrength: 5,
      pulsePeriod: 0,
      visibleEdgeColor: '#ffb347',
      hiddenEdgeColor: '#7a5b20',
    },
  },
});
```

The outline pass doubles as the selection highlight; bloom is independent. Antialiasing (`'none' | 'msaa' | 'smaa'`) is an instance-level option — changing it later logs a warning and requires a new `DiceBox`.

## Sounds

```ts
const diceBox = new DiceBox(container, {
  assetPath: '/',
  sounds: true,
  volume: 60,
  surface: 'wood_tray',      // impacts against the tray
  sound_dieMaterial: 'plastic',
});
```

Sounds are loaded per surface and per die material, and triggered by physics collision events with speed-scaled volume.

## Live reconfiguration

```ts
await diceBox.updateConfig({ theme: 'galaxy' });                       // emits 'theme:change'
await diceBox.updateConfig({ environment: 'tavern' });
await diceBox.updateConfig({ shadows: 'high' });
await diceBox.updateConfig({ postprocessing: { enabled: true, bloom: { strength: 0.6 } } });
await diceBox.updateConfig({ volume: 0, sounds: false });
diceBox.setShadowQuality('low');                                       // direct shadow control
```

Only the changed subsystems are rebuilt; the renderer itself is reused (except for `antialias`, which needs a new instance).

## Asset preloading

Pass an `AssetManager` from `@openvtt/assets` and the box registers its texture/sound manifest and preloads it during `initialize()`:

```ts
import { AssetManager } from '@openvtt/dice';   // re-exported from @openvtt/assets

const assets = new AssetManager();
const diceBox = new DiceBox(container, {
  assetPath: '/',
  assets: { manager: assets, preload: true, includeLazy: false },
});
```

Loaded assets are then served from cache (object URLs) everywhere the box resolves URLs. See [Assets and rendering](assets-and-rendering.md#assets) for the manager API.

## Complete worked example

Based on the playground app (`apps/playground`):

```ts
import { DiceBox, RollCancelledError, listThemes, type RollResult } from '@openvtt/dice';

const container = document.querySelector<HTMLDivElement>('#dice-container')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

const diceBox = new DiceBox(container, {
  assetPath: '/',
  theme: 'default',
  shadows: 'medium',
  antialias: 'smaa',
  environment: 'none',
  postprocessing: {
    enabled: true,
    outline: { edgeStrength: 5, pulsePeriod: 0, visibleEdgeColor: '#ffb347' },
    bloom: false,
  },
});

diceBox.on('ready', () => { statusEl.textContent = 'ready'; });
diceBox.on('error', (error) => console.error('DiceBox error:', error));

let selectedDie: number | null = null;
diceBox.on('die:click', ({ id, value }) => {
  diceBox.select([id]);
  selectedDie = id;
  statusEl.textContent = `selected die #${id} (value: ${value?.value ?? '?'})`;
});

document.addEventListener('keydown', async (event) => {
  if (event.key === 'Escape') { diceBox.clearSelection(); selectedDie = null; }
  if (event.key.toLowerCase() === 'r' && selectedDie !== null) {
    try { await diceBox.reroll([selectedDie]); }
    catch (error) { if (!(error instanceof RollCancelledError)) console.error(error); }
  }
});

await diceBox.initialize();

const result = (await diceBox.roll('2d20+1d6')) as RollResult;
console.log(
  result.notation, '→', result.total,
  result.sets.map((set) => `${set.num}${set.type}: [${set.rolls.map((r) => r.value).join(', ')}]`),
);
```
