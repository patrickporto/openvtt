# @openvtt/assets

Declarative asset packs for the openvtt monorepo. Manifests describe named assets (textures, audio, HDR environments, models, fonts, arbitrary blobs); the `AssetManager` loads them through a layered cache (in-memory, then persistent storage adapters, then network), verifies content hashes, deduplicates in-flight requests, and preloads packs with progress events delivered over an `@openvtt/events` bus.

**Version:** 0.1.0
**Dependencies:** `@openvtt/events`, `valibot`
**Browser globals required:** `fetch`, `crypto.subtle`, `caches`, `URL.createObjectURL`

## Installation

```bash
bun add @openvtt/assets
```

```ts
import { AssetManager, defineManifest } from '@openvtt/assets';
```

See the [assets and rendering guide](../guides/assets-and-rendering.md) for a conceptual walkthrough.

## Quick start

```ts
import { AssetManager, defineManifest } from '@openvtt/assets';

const manifest = defineManifest({
  name: 'core',
  version: '1.0.0',
  baseUrl: '/assets/',
  assets: [
    { id: 'wood', url: 'textures/wood.png', type: 'texture' },
    { id: 'env-tavern', url: 'environments/tavern.hdr', type: 'hdr', lazy: true },
  ],
});

const manager = new AssetManager();
manager.registerPack(manifest);

manager.bus.on('preload:progress', ({ id, loaded, total }) => {
  console.log(`${id}: ${loaded}/${total}`);
});

await manager.preload('core', { concurrency: 4 });

const blob = await manager.load('wood');
const textureUrl = manager.resolveUrl('wood'); // object URL when cached
```

## Manifests and schemas

### `AssetType`

```ts
type AssetType =
  | 'texture' | 'audio' | 'hdr' | 'cubemap'
  | 'model' | 'font' | 'binary' | 'json';
```

`AssetTypeSchema` is the corresponding Valibot schema.

### `AssetEntry`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| id | `string` | — | Unique asset id within the manifest. |
| url | `string` | — | Asset URL (absolute, or relative to the manifest `baseUrl`). |
| hash | `string` | — | Content hash in the form `'sha256:<hex>'`; verified after download. |
| type | `AssetType` | — | Hint for consumers; not enforced by the loader. |
| lazy | `boolean` | `false` | Excluded from `preload` unless `includeLazy` is set. |
| priority | `number` | — | Higher-priority entries preload first. |
| size | `number` | — | Expected byte size (informational). |

Entries are loose objects: additional fields are preserved. `AssetEntrySchema` is the corresponding Valibot schema.

### `AssetManifest`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| name | `string` | — | Pack name (unique per manager). |
| version | `string` | — | Pack version (informational). |
| baseUrl | `string` | — | Base URL joined to relative entry URLs. |
| assets | `AssetEntry[]` | — | Entries in the pack. |

Manifests are loose objects; `AssetManifestSchema` is the corresponding Valibot schema.

### `defineManifest(manifest)`

Validates a manifest against `AssetManifestSchema` and returns it typed. Intended for authoring manifests in TypeScript with inference.

```ts
function defineManifest(manifest: AssetManifest): AssetManifest;
```

### `parseManifest(input)`

Parses unknown input into an `AssetManifest`; throws a Valibot validation error on invalid input.

### `assetCacheKey(entry): string`

Returns the cache key for an entry: `hash ?? url ?? id`. Entries with the same key across different packs share the same cache entry.

```ts
function assetCacheKey(entry: AssetEntry): string;
```

## Storage adapters

### `StorageAdapter` interface

```ts
interface StorageAdapter {
  name: string;
  persistent: boolean;
  get(key: string): Promise<Blob | undefined>;
  set(key: string, value: Blob): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
```

### `class MemoryStorageAdapter`

Ephemeral in-memory adapter (`name: 'memory'`, `persistent: false`). Always available.

### `class CacheStorageAdapter`

Persistent adapter backed by the Cache Storage API (`name: 'cache-api'`, `persistent: true`). Adapter failures are swallowed (treated as cache misses).

```ts
class CacheStorageAdapter implements StorageAdapter {
  constructor(options?: CacheStorageAdapterOptions);
  static isSupported(): boolean;
}

interface CacheStorageAdapterOptions {
  cacheName?: string; // default 'openvtt-assets'
  baseUrl?: string;   // default 'https://assets.openvtt.local/'
}
```

`baseUrl` is used to synthesize request URLs as cache keys (Cache Storage requires request-like keys); it never hits the network.

## Bus

The package defines an `@openvtt/events` contract, `assetsContract` (namespace `assets`), and a factory `createAssetsBus(): AssetsBus`.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `preload:start` | `{ pack: string; total: number }` | A preload run began. |
| `preload:progress` | `{ pack: string; id: string; loaded: number; total: number }` | An asset finished during preload. |
| `preload:finish` | `{ pack: string; loaded: number; total: number; failed: number }` | A preload run completed. |
| `asset:load` | `{ id: string; key: string; source: 'memory' \| 'adapter' \| 'network'; bytes: number }` | An asset was served, with the cache layer that produced it. |
| `asset:error` | `{ id: string; message: string }` | An asset failed to load or failed hash verification. |

## `AssetManagerOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| adapters | `StorageAdapter[]` | `[memory, cache-api]` (cache-api only when supported) | Cache layers, checked in order. |
| bus | `AssetsBus` | new bus from `createAssetsBus()` | Event bus instance. |
| fetcher | `typeof fetch` | global `fetch` | Network fetch implementation. |
| verifyHashes | `boolean` | `true` | Verify `sha256:<hex>` hashes after download. |

## `PreloadOptions` and `PreloadSummary`

```ts
interface PreloadOptions {
  includeLazy?: boolean; // default false
  concurrency?: number;  // default 4, clamped to >= 1
}

interface PreloadSummary {
  pack: string;
  loaded: number;
  total: number;
  failed: number;
}
```

## `class AssetManager`

```ts
class AssetManager {
  readonly bus: AssetsBus;
  constructor(options?: AssetManagerOptions);
}
```

### `registerPack(manifest: AssetManifest): void`

Registers a pack. Entry URLs are resolved against the manifest `baseUrl` at registration time.

### `has(id: string): boolean`

Whether an asset id is registered in any pack.

### `listPacks(): string[]`

Names of registered packs.

### `getEntry(id: string): AssetEntry`

The manifest entry for an id.

### `urlFor(id: string): string`

The absolute URL for an asset id (joined with the pack `baseUrl`).

### `isCached(id: string): Promise<boolean>`

Whether the asset is present in memory or a storage adapter.

### `resolveUrl(idOrUrl: string): string`

Resolves an id or URL for direct consumption (e.g. `THREE.TextureLoader`):

1. If the id is cached, returns an object URL for the cached blob.
2. If the id is registered but not cached, returns its absolute URL.
3. Anything else passes through unchanged.

### `load(id: string): Promise<Blob>`

Loads an asset through the cache layers:

1. Memory cache.
2. Storage adapters (in order).
3. Network via `fetcher`, followed by hash verification and `adapter.set` for each adapter.

In-flight requests for the same cache key are deduplicated. Emits `asset:load` on success and `asset:error` on failure. Throws for unknown ids and non-OK HTTP responses.

On hash mismatch, emits `asset:error` and serves the downloaded blob without caching it — it does not throw.

```ts
const blob = await manager.load('wood');
```

### `preload(packName: string, options?: PreloadOptions): Promise<PreloadSummary>`

Preloads a pack's entries in descending `priority` order using `concurrency` concurrent workers. Emits `preload:start`, `preload:progress` per asset, and `preload:finish` at the end. Throws for unknown pack names.

### `preloadAll(options?: PreloadOptions): Promise<PreloadSummary[]>`

Preloads every registered pack.

### `clearPersistent(): Promise<void>`

Clears all persistent adapters (e.g. the Cache Storage adapter), leaving memory untouched.

### `destroy(): void`

Revokes outstanding object URLs and destroys the event bus. The manager cannot be used afterwards.

## Behavior notes

- Relative entry URLs are joined to the manifest `baseUrl`; protocol-relative URLs and `data:`/`blob:` URLs pass through unchanged.
- Hash verification uses `crypto.subtle` with SHA-256 and expects hashes in the form `sha256:<hex>`.
- Because cache keys are content hashes when available, two packs referencing the same content share one cache entry and one network request.

## See also

- [Assets and rendering guide](../guides/assets-and-rendering.md)
- [Getting started](../guides/getting-started.md)
- [@openvtt/dice](./dice.md), [@openvtt/render3d](./render3d.md), [@openvtt/events](./events.md)
