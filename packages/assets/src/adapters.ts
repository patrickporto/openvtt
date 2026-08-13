export interface StorageAdapter {
  readonly name: string;
  readonly persistent: boolean;
  get(key: string): Promise<Blob | undefined>;
  set(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly name = 'memory';
  readonly persistent = false;
  #store = new Map<string, Blob>();

  async get(key: string): Promise<Blob | undefined> {
    return this.#store.get(key);
  }

  async set(key: string, blob: Blob): Promise<void> {
    this.#store.set(key, blob);
  }

  async delete(key: string): Promise<void> {
    this.#store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.#store.has(key);
  }

  async clear(): Promise<void> {
    this.#store.clear();
  }
}

export interface CacheStorageAdapterOptions {
  cacheName?: string;
  baseUrl?: string;
}

export class CacheStorageAdapter implements StorageAdapter {
  readonly name = 'cache-api';
  readonly persistent = true;
  #cacheName: string;
  #baseUrl: string;
  #cachePromise?: Promise<Cache>;

  constructor(options: CacheStorageAdapterOptions = {}) {
    this.#cacheName = options.cacheName ?? 'openvtt-assets';
    this.#baseUrl = options.baseUrl ?? 'https://assets.openvtt.local/';
  }

  static isSupported(): boolean {
    return typeof caches !== 'undefined';
  }

  #toRequest(key: string): Request {
    return new Request(this.#baseUrl + encodeURIComponent(key));
  }

  async #cache(): Promise<Cache> {
    this.#cachePromise ??= caches.open(this.#cacheName);
    return this.#cachePromise;
  }

  async get(key: string): Promise<Blob | undefined> {
    try {
      const response = await (await this.#cache()).match(this.#toRequest(key));
      if (!response) return undefined;
      return await response.blob();
    } catch {
      return undefined;
    }
  }

  async set(key: string, blob: Blob): Promise<void> {
    try {
      const response = new Response(blob, {
        headers: { 'content-type': blob.type || 'application/octet-stream' },
      });
      await (await this.#cache()).put(this.#toRequest(key), response);
    } catch {
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await (await this.#cache()).delete(this.#toRequest(key));
    } catch {
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const response = await (await this.#cache()).match(this.#toRequest(key));
      return response !== undefined;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await caches.delete(this.#cacheName);
      this.#cachePromise = undefined;
    } catch {
    }
  }
}
