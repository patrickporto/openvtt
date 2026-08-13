import { CacheStorageAdapter, MemoryStorageAdapter, type StorageAdapter } from './adapters';
import { createAssetsBus, type AssetsBus } from './bus';
import { assetCacheKey, parseManifest, type AssetEntry, type AssetManifest } from './manifest';

interface RegisteredAsset {
  entry: AssetEntry;
  pack: string;
  absoluteUrl: string;
  key: string;
}

interface CachedBlob {
  blob: Blob;
  objectUrl?: string;
}

export interface AssetManagerOptions {
  adapters?: StorageAdapter[];
  bus?: AssetsBus;
  fetcher?: typeof fetch;
  verifyHashes?: boolean;
}

export interface PreloadOptions {
  includeLazy?: boolean;
  concurrency?: number;
}

export interface PreloadSummary {
  pack: string;
  loaded: number;
  total: number;
  failed: number;
}

function joinUrl(base: string | undefined, url: string): string {
  if (!url) return url;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const root = (base || './').endsWith('/') ? (base || './') : `${base}/`;
  return root + url.replace(/^\.\//, '').replace(/^\//, '');
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class AssetManager {
  readonly bus: AssetsBus;

  #ownsBus: boolean;
  #adapters: StorageAdapter[];
  #fetcher: typeof fetch;
  #verifyHashes: boolean;
  #packs = new Map<string, AssetManifest>();
  #assets = new Map<string, RegisteredAsset>();
  #byKey = new Map<string, RegisteredAsset>();
  #blobs = new Map<string, CachedBlob>();
  #inflight = new Map<string, Promise<Blob>>();

  constructor(options: AssetManagerOptions = {}) {
    this.#ownsBus = !options.bus;
    this.bus = options.bus ?? createAssetsBus();
    this.#fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.#verifyHashes = options.verifyHashes ?? true;
    this.#adapters = options.adapters ?? [
      new MemoryStorageAdapter(),
      ...(CacheStorageAdapter.isSupported() ? [new CacheStorageAdapter()] : []),
    ];
  }

  registerPack(manifest: AssetManifest): void {
    const parsed = parseManifest(manifest);
    this.#packs.set(parsed.name, parsed);
    for (const entry of parsed.assets) {
      const absoluteUrl = joinUrl(parsed.baseUrl, entry.url);
      const registered: RegisteredAsset = {
        entry,
        pack: parsed.name,
        absoluteUrl,
        key: assetCacheKey(entry) === entry.url ? absoluteUrl : assetCacheKey(entry),
      };
      this.#assets.set(entry.id, registered);
      if (!this.#byKey.has(registered.key)) {
        this.#byKey.set(registered.key, registered);
      }
    }
  }

  has(id: string): boolean {
    return this.#assets.has(id);
  }

  listPacks(): string[] {
    return [...this.#packs.keys()];
  }

  getEntry(id: string): AssetEntry | undefined {
    return this.#assets.get(id)?.entry;
  }

  urlFor(id: string): string | undefined {
    return this.#assets.get(id)?.absoluteUrl;
  }

  isCached(id: string): boolean {
    const asset = this.#assets.get(id);
    return asset ? this.#blobs.has(asset.key) : false;
  }

  resolveUrl(idOrUrl: string): string {
    const byId = this.#assets.get(idOrUrl);
    if (byId) {
      const cached = this.#blobs.get(byId.key);
      if (cached) return this.#objectUrl(byId.key, cached);
      return byId.absoluteUrl;
    }
    const byKey = this.#byKey.get(idOrUrl);
    if (byKey) {
      const cached = this.#blobs.get(byKey.key);
      if (cached) return this.#objectUrl(byKey.key, cached);
    }
    return idOrUrl;
  }

  #objectUrl(key: string, cached: CachedBlob): string {
    cached.objectUrl ??= URL.createObjectURL(cached.blob);
    return cached.objectUrl;
  }

  async load(id: string): Promise<Blob> {
    const asset = this.#assets.get(id);
    if (!asset) throw new Error(`[@openvtt/assets] Unknown asset: "${id}"`);

    const inflight = this.#inflight.get(asset.key);
    if (inflight) return inflight;

    const promise = this.#loadAsset(asset).finally(() => {
      this.#inflight.delete(asset.key);
    });
    this.#inflight.set(asset.key, promise);
    return promise;
  }

  async #loadAsset(asset: RegisteredAsset): Promise<Blob> {
    const { id } = asset.entry;

    const memoryHit = this.#blobs.get(asset.key);
    if (memoryHit) {
      this.bus.emit('asset:load', { id, key: asset.key, source: 'memory', bytes: memoryHit.blob.size });
      return memoryHit.blob;
    }

    for (const adapter of this.#adapters) {
      if (!adapter.persistent) continue;
      const blob = await adapter.get(asset.key);
      if (blob) {
        this.#remember(asset.key, blob);
        this.bus.emit('asset:load', { id, key: asset.key, source: 'adapter', bytes: blob.size });
        return blob;
      }
    }

    try {
      const response = await this.#fetcher(asset.absoluteUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${asset.absoluteUrl}`);
      }
      const blob = await response.blob();

      if (this.#verifyHashes && asset.entry.hash?.startsWith('sha256:')) {
        const expected = asset.entry.hash.slice('sha256:'.length);
        const actual = await sha256Hex(blob);
        if (actual !== expected) {
          this.bus.emit('asset:error', {
            id,
            message: `Hash mismatch (expected ${expected}, got ${actual}) — serving without caching`,
          });
          return blob;
        }
      }

      this.#remember(asset.key, blob);
      await Promise.all(this.#adapters.map((adapter) => adapter.set(asset.key, blob)));
      this.bus.emit('asset:load', { id, key: asset.key, source: 'network', bytes: blob.size });
      return blob;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.bus.emit('asset:error', { id, message });
      throw error;
    }
  }

  #remember(key: string, blob: Blob): void {
    if (!this.#blobs.has(key)) {
      this.#blobs.set(key, { blob });
    }
  }

  async preload(packName: string, options: PreloadOptions = {}): Promise<PreloadSummary> {
    const pack = this.#packs.get(packName);
    if (!pack) throw new Error(`[@openvtt/assets] Unknown pack: "${packName}"`);

    const concurrency = Math.max(1, options.concurrency ?? 4);
    const entries = pack.assets
      .filter((entry) => options.includeLazy || !entry.lazy)
      .map((entry) => this.#assets.get(entry.id)!)
      .sort((a, b) => (b.entry.priority ?? 0) - (a.entry.priority ?? 0));

    const total = entries.length;
    let loaded = 0;
    let failed = 0;

    this.bus.emit('preload:start', { pack: packName, total });

    let cursor = 0;
    const worker = async () => {
      while (cursor < entries.length) {
        const asset = entries[cursor++];
        try {
          await this.load(asset.entry.id);
        } catch {
          failed++;
        }
        loaded++;
        this.bus.emit('preload:progress', { pack: packName, id: asset.entry.id, loaded, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));

    const summary: PreloadSummary = { pack: packName, loaded, total, failed };
    this.bus.emit('preload:finish', summary);
    return summary;
  }

  async preloadAll(options: PreloadOptions = {}): Promise<PreloadSummary[]> {
    const summaries: PreloadSummary[] = [];
    for (const name of this.#packs.keys()) {
      summaries.push(await this.preload(name, options));
    }
    return summaries;
  }

  async clearPersistent(): Promise<void> {
    await Promise.all(this.#adapters.map((adapter) => adapter.clear()));
  }

  destroy(): void {
    for (const cached of this.#blobs.values()) {
      if (cached.objectUrl) URL.revokeObjectURL(cached.objectUrl);
    }
    this.#blobs.clear();
    this.#inflight.clear();
    this.#assets.clear();
    this.#byKey.clear();
    this.#packs.clear();
    if (this.#ownsBus) {
      this.bus.destroy();
    }
  }
}
