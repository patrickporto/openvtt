# @openvtt/render3d

Three.js rendering toolkit used across the openvtt monorepo. It bundles a configurable post-processing pipeline (outline, bloom, SMAA/MSAA antialiasing), image-based-lighting environment loading with named presets and HDR/cubemap sources, a height-map to normal-map converter, and a small asset-path resolver. The package targets `three` with `three/addons` imports.

**Version:** 0.1.0
**Peer dependencies:** `three`

## Installation

```bash
bun add @openvtt/render3d three
```

```ts
import { PostFX, loadEnvironment, heightCanvasToNormalCanvas } from '@openvtt/render3d';
```

See the [assets and rendering guide](../guides/assets-and-rendering.md) for usage in context.

## Antialiasing

### `AntialiasMode`

```ts
type AntialiasMode = 'none' | 'msaa' | 'smaa';
```

- `none`: no antialiasing pass.
- `msaa`: renders into a `HalfFloatType` render target with 4 samples.
- `smaa`: appends an `SMAAPass` to the post-processing chain.

## Post-processing

### `BloomOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| strength | `number` | `0.4` | Bloom intensity. |
| radius | `number` | `0.6` | Bloom spread. |
| threshold | `number` | `0.85` | Luminance threshold. |

### `OutlineOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| edgeStrength | `number` | `4` | Outline thickness/intensity. |
| pulsePeriod | `number` | `1.5` | Pulse animation period in seconds; `0` disables pulsing. |
| visibleEdgeColor | `string` | — | Color for visible edges. |
| hiddenEdgeColor | `string` | — | Color for occluded edges. |

### `PostFXOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| enabled | `boolean` | `false` | Master switch. When disabled, all passes are no-ops and rendering falls back to a direct `renderer.render`. |
| bloom | `false \| BloomOptions` | `false` | Bloom pass configuration. |
| outline | `false \| OutlineOptions` | `false` | Outline pass configuration. |
| antialias | `AntialiasMode` | `'smaa'` | Antialiasing mode for the pipeline. |

### `class PostFX`

Composer wrapper. Pass order: Render → Outline → Bloom → SMAA → Output.

```ts
class PostFX {
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: PostFXOptions,
    width: number,
    height: number,
  );
  outlinePass?: OutlinePass; // public; set selectedObjects to highlight meshes
  get enabled(): boolean;
  setCamera(camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}
```

```ts
const postfx = new PostFX(renderer, scene, camera, {
  enabled: true,
  antialias: 'smaa',
  bloom: { strength: 0.5, radius: 0.5, threshold: 0.8 },
  outline: {
    edgeStrength: 5,
    pulsePeriod: 0,
    visibleEdgeColor: '#ffb347',
    hiddenEdgeColor: '#7a5b20',
  },
}, width, height);

postfx.outlinePass!.selectedObjects = [selectedDieMesh];

function animate() {
  postfx.render();
  requestAnimationFrame(animate);
}
```

## Environments

### `EnvironmentName` and `EnvironmentSpec`

```ts
type EnvironmentName = 'neutral' | 'tavern' | 'neon' | 'none';

type EnvironmentSpec =
  | EnvironmentName
  | { source: string }      // HDR URL (absolute or relative to assetPath)
  | { cubeMap: string[] };  // 6 face URLs
```

### `EnvironmentHandle`

| Name | Type | Description |
|------|------|-------------|
| texture | `THREE.Texture` | PMREM-processed texture, ready to assign to `scene.environment`. |
| owned | `boolean` | `true` means the handle owns the texture exclusively (procedural fallback); `false` means it shares a cached, reference-counted texture. |
| dispose() | method | Releases the handle: decrements the refcount for shared textures (destroying them at zero) or disposes owned textures directly. Idempotent. |

### `loadEnvironment(renderer, spec, assetPath, resolve?): Promise<EnvironmentHandle>`

Loads an environment and returns a PMREM-ready texture.

```ts
function loadEnvironment(
  renderer: THREE.WebGLRenderer,
  spec: EnvironmentSpec | undefined, // undefined resolves to 'none'
  assetPath: string,
  resolve?: (url: string) => string, // defaults to identity
): Promise<EnvironmentHandle>;
```

Behavior:

- Named specs resolve to `<assetPath>/environments/<name>.hdr` and are loaded with `HDRLoader` as `HalfFloatType`.
- A failed HDR load logs a warning and falls back to a procedural 512px gradient environment (marked `owned`).
- Results are cached module-wide by resolved URL and shared via reference counting; each call returns a handle that must be released with `dispose()`. The shared texture is destroyed when the last handle is released.

```ts
import { loadEnvironment, disposeEnvironmentCache } from '@openvtt/render3d';

const env = await loadEnvironment(renderer, 'tavern', '/', (url) =>
  assetManager.resolveUrl(url),
);
scene.environment = env.texture;

// with an explicit source
const custom = await loadEnvironment(renderer, { source: '/envs/custom.hdr' }, '/');
```

### `disposeEnvironmentCache(): void`

Force-disposes all cached environment textures and clears the module-wide cache, even if consumers still hold handles. Prefer per-handle `dispose()`; reserve this for full app teardown.

## Normal maps

### `heightCanvasToNormalCanvas(source, strength?): HTMLCanvasElement`

Converts a height map into a tangent-space normal map using a Sobel filter. Edges wrap around, and the output alpha channel is set to 255. Useful for converting grayscale bump maps to normal maps at runtime.

```ts
function heightCanvasToNormalCanvas(
  source: HTMLCanvasElement,
  strength?: number, // default 2
): HTMLCanvasElement;
```

```ts
const normalCanvas = heightCanvasToNormalCanvas(bumpCanvas, 2);
const normalMap = new THREE.CanvasTexture(normalCanvas);
material.normalMap = normalMap;
```

## Asset paths

### `resolveAssetPath(assetPath, source): string`

Joins a base asset path with a source URL.

```ts
function resolveAssetPath(assetPath: string | undefined, source: string): string;
```

Behavior:

- Absolute URLs and `data:`/`blob:` URLs pass through unchanged.
- Otherwise, `assetPath` (default `'./'`) is joined with `source` after stripping a leading `./` or `/` from the source.

```ts
resolveAssetPath('/assets/', 'textures/wood.png'); // '/assets/textures/wood.png'
resolveAssetPath('./', './themes/default/dice.png'); // './themes/default/dice.png'
resolveAssetPath('/assets/', 'https://cdn.example.com/a.png'); // passthrough
```

## See also

- [Assets and rendering guide](../guides/assets-and-rendering.md)
- [3D dice guide](../guides/3d-dice.md)
- [Getting started](../guides/getting-started.md)
- [@openvtt/dice](./dice.md), [@openvtt/assets](./assets.md)
