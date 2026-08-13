# Assets and rendering

This guide covers the three lower-level building blocks that `@openvtt/dice` is composed of. Most applications use them through `DiceBox` (see [3D dice](3d-dice.md)), but each is independently useful — and independently published:

- `@openvtt/assets` — manifest-driven asset loading, caching, and preloading
- `@openvtt/physics` — cannon-es rigid-body physics in a Web Worker, with a main-thread fallback
- `@openvtt/render3d` — three.js post-processing, environments, and texture utilities

API references: [assets](../api/assets.md), [physics](../api/physics.md), [render3d](../api/render3d.md)

## Assets

### Manifests

Assets are declared in packs — named manifests validated with Valibot:

```ts
import { defineManifest, parseManifest } from '@openvtt/assets';

const pack = defineManifest({
  name: 'dice-core',
  version: '1.0.0',
  baseUrl: '/',
  assets: [
    { id: 'tex-bronze', url: 'textures/bronze01.webp', type: 'texture', hash: 'sha256:ab12…', priority: 10 },
    { id: 'env-tavern', url: 'environments/tavern.hdr', type: 'hdr', lazy: true },
    { id: 'snd-tray', url: 'sounds/wood_tray.mp3', type: 'audio', size: 48211 },
  ],
});

// or validate untrusted JSON:
const parsed = parseManifest(JSON.parse(remoteJson));
```

`AssetEntry` fields:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Lookup key, unique within the manager |
| `url` | `string` | Relative (joined with `baseUrl`) or absolute URL |
| `hash` | `string?` | Integrity hash, `sha256:<hex>` (verified on download) |
| `type` | `'texture' \| 'audio' \| 'hdr' \| 'cubemap' \| 'model' \| 'font' \| 'binary' \| 'json'` | Hint only |
| `lazy` | `boolean?` | Excluded from `preload` unless `includeLazy: true` |
| `priority` | `number?` | Higher loads earlier during preload |
| `size` | `number?` | Byte size (informational) |

### AssetManager

```ts
import { AssetManager } from '@openvtt/assets';

const assets = new AssetManager({ verifyHashes: true });
assets.registerPack(pack);

assets.bus.on('preload:progress', ({ id, loaded, total }) => {
  console.log(`${loaded}/${total}: ${id}`);
});

const summary = await assets.preload('dice-core', { concurrency: 4 });
// { pack: 'dice-core', loaded: 3, total: 3, failed: 0 }

const blob = await assets.load('tex-bronze');      // cache-first load
const url = assets.resolveUrl('tex-bronze');       // cached object URL, or absolute URL
assets.isCached('tex-bronze');                     // true
```

| Method | Behavior |
|---|---|
| `registerPack(manifest)` | Validate and register all entries |
| `load(id)` | Cache-first load: memory → persistent adapters → network; concurrent loads of the same asset share one request |
| `preload(pack, { includeLazy, concurrency })` | Load all non-lazy entries, priority-ordered, with a worker pool (concurrency default 4); resolves with a summary |
| `preloadAll(options)` | Preload every registered pack |
| `resolveUrl(idOrUrl)` | Object URL for cached assets, absolute URL for registered-but-uncached, pass-through otherwise |
| `isCached(id)` | Whether the asset is in memory |
| `has(id)` / `getEntry(id)` / `urlFor(id)` / `listPacks()` | Lookup helpers |
| `clearPersistent()` | Wipe all storage adapters (not the in-memory cache) |
| `destroy()` | Revoke object URLs, drop everything, destroy the bus |

### Storage adapters

The manager layers a memory cache over persistent adapters:

| Adapter | Persistent | Notes |
|---|---|---|
| `MemoryStorageAdapter` | no | Always installed |
| `CacheStorageAdapter` | yes (Cache API) | Auto-installed when `CacheStorageAdapter.isSupported()` (`typeof caches !== 'undefined'`) |

Supply your own via `new AssetManager({ adapters: [...] })` — any object implementing `get/set/delete/has/clear` over `Blob`s.

### Hash verification

With `verifyHashes: true` (default), downloaded bytes for entries with a `sha256:` hash are digested and compared. **On mismatch the asset is still served but not cached**, and an `asset:error` event is emitted — availability beats strictness, and the event gives you the signal to react.

### Events

The manager owns an `assets`-namespaced bus (or pass your own `bus`):

| Event | Payload |
|---|---|
| `preload:start` | `{ pack, total }` |
| `preload:progress` | `{ pack, id, loaded, total }` |
| `preload:finish` | `{ pack, loaded, total, failed }` |
| `asset:load` | `{ id, key, source: 'memory' \| 'adapter' \| 'network', bytes }` |
| `asset:error` | `{ id, message }` |

## Physics

`@openvtt/physics` wraps cannon-es in a host interface that runs in a Web Worker by default and transparently falls back to the main thread.

### Configuration and creation

```ts
import { createPhysicsHost } from '@openvtt/physics';

const physics = await createPhysicsHost(
  {
    gravity: -9.8 * 400,
    friction: 0.6,
    deskRestitution: 0.5,
    barrierRestitution: 1.0,
    solverIterations: 14,
    sleepSpeedLimit: 75,
    sleepTimeLimit: 0.9,
    linearDamping: 0.1,
    angularDamping: 0.1,
  },
  {
    worker: true,                    // default
    timestep: 1 / 60,
    onFallback: (error) => console.warn('worker unavailable, running locally', error),
  },
);
```

`PhysicsConfig` fields are exactly the nine shown above (gravity, friction, the two restitutions, solver iterations, sleep limits, and both dampings). Options:

| Option | Default | Description |
|---|---|---|
| `worker` | `true` | Use a Web Worker when available |
| `workerFactory` / `workerUrl` | — | Custom worker construction; the default worker is the package's own entry `@openvtt/physics/worker` |
| `timestep` | `1/60` | Fixed simulation step |
| `onFallback` | — | Called with the error when worker creation/init fails, before the local host is used |

If bundling the worker yourself, point your bundler at the worker entry:

```ts
new Worker(new URL('@openvtt/physics/worker', import.meta.url), { type: 'module' });
```

### The PhysicsHost interface

```ts
await physics.updateBarriers(width, height, wallScale);   // desk + invisible walls
await physics.spawnBatch(payloads);                        // add bodies
await physics.remove(indices);                             // remove bodies
await physics.clear();                                     // remove all bodies

const result = await physics.simulate(1000);               // run until all asleep (or limit)
const partial = await physics.step(5);                     // run exactly N steps

const states = await physics.states();                     // BodyState[] snapshot
await physics.wake(indices);
await physics.applyImpulse(indices, velocity, angularVelocity);
await physics.destroy();
```

`simulate(iterationLimit)` and `step(steps)` both resolve with a `StepResult`:

```ts
interface StepResult {
  states: BodyState[];         // per body: index, position, quaternion, sleepState
  allAsleep: boolean;          // true → the throw has settled
  collideEvents: CollideEvent[]; // { index, isBody, shapeTag?, speed, step }
}
```

Use `simulate` for "roll until rest" and `step` when you drive the animation loop yourself (this is what `DiceBox` does: it pre-simulates, then replays the same trajectory visually). `CollideEvent`s carry impact speed — `DiceBox` uses them to trigger sounds.

Bodies are spawned from `SpawnPayload`s:

```ts
interface SpawnPayload {
  index: number;               // your stable body id
  shape: ShapeDescriptor;      // convex | cylinder | sphere | box
  mass: number;
  shapeTag?: string;           // echoed back on collide events
  pos: { x, y, z };
  velocity: { x, y, z };
  angle: { x, y, z };
  axis: { x, y, z, a };        // initial orientation
}
```

Worker state transfer uses packed `Float32Array`s (`serializeStates`/`deserializeStates` are exported if you build your own protocol).

## Render3d

### PostFX

A thin composer over three.js post-processing:

```ts
import { PostFX } from '@openvtt/render3d';

const postFX = new PostFX(renderer, scene, camera, {
  enabled: true,
  bloom: { strength: 0.5, radius: 0.5, threshold: 0.8 },
  outline: {
    edgeStrength: 5,
    pulsePeriod: 1.5,
    visibleEdgeColor: '#ffb347',
    hiddenEdgeColor: '#7a5b20',
  },
  antialias: 'msaa',          // 'none' | 'msaa' | 'smaa'
}, width, height);

postFX.outlinePass!.selectedObjects = [selectedMesh];   // highlight selection
postFX.render();
postFX.dispose();
```

`'msaa'` uses a multisampled render target (4 samples); `'smaa'` adds an `SMAAPass`. `bloom`/`outline` accept `false` or an options object. The `outlinePass` is exposed publicly so you can drive `selectedObjects` for selection highlighting — this is exactly how `DiceBox` implements click-to-select.

### Environments

```ts
import { loadEnvironment, disposeEnvironmentCache } from '@openvtt/render3d';

const handle = await loadEnvironment(renderer, 'tavern', '/');
scene.environment = handle.texture;

// other specs:
await loadEnvironment(renderer, { source: 'environments/custom.hdr' }, '/');
await loadEnvironment(renderer, { cubeMap: [px, nx, py, ny, pz, nz] }, '/');
await loadEnvironment(renderer, 'none', '/');     // procedural gradient

handle.dispose();   // on teardown
```

- Named environments (`'neutral' | 'tavern' | 'neon'`) load `environments/<name>.hdr` relative to `assetPath`; `'none'` and load failures fall back to a generated gradient.
- `{ source }` loads any HDR path; `{ cubeMap }` takes six face URLs.
- Everything is converted through PMREM for correct PBR lighting.
- Results are **cached globally** by URL and reference-counted: every `loadEnvironment` call retains the shared texture and `handle.dispose()` releases it, destroying the texture only when the last handle is released (no double-dispose). `disposeEnvironmentCache()` force-disposes all cached textures, even with active handles — reserve it for full app teardown.
- An optional fourth argument, `resolve: (url) => url`, lets you route URLs through an `AssetManager.resolveUrl` — which is how `DiceBox` serves environments from the asset cache.

### Texture utilities

```ts
import { heightCanvasToNormalCanvas, resolveAssetPath } from '@openvtt/render3d';

const normalCanvas = heightCanvasToNormalCanvas(heightCanvas, 2);  // Sobel height→normal
const url = resolveAssetPath('/assets/', 'textures/bronze01.webp'); // '/assets/textures/bronze01.webp'
```

`heightCanvasToNormalCanvas(source, strength = 2)` generates a tangent-space normal map from a grayscale height canvas (used for dice bump maps when `normalMaps` is enabled). `resolveAssetPath` joins a base path with a source, passing through absolute/`data:`/`blob:` URLs untouched.

## How the pieces fit

`DiceBox` wires these together so you rarely have to:

1. `@openvtt/assets` preloads the theme/texture/sound manifest and hands out cached object URLs.
2. `@openvtt/physics` pre-simulates each throw in a worker until all bodies sleep, then steps interactively during the visual throw, emitting collide events for sounds.
3. `@openvtt/render3d` provides the HDR environment, bloom/outline composer, and normal-map generation.

Reach for the standalone packages when you build something the box does not cover — a token mover with physics, a map renderer with HDR lighting, or an asset pipeline for non-dice content.
