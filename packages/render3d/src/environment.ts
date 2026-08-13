import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { resolveAssetPath } from './assets';

export type EnvironmentName = 'neutral' | 'tavern' | 'neon' | 'none';

export type EnvironmentSpec =
  | EnvironmentName
  | { source: string }
  | { cubeMap: string[] };

export interface EnvironmentHandle {
  texture: THREE.Texture;
  owned: boolean;
  dispose: () => void;
}

interface CacheEntry {
  texture: THREE.Texture;
  refs: number;
  disposed: boolean;
}

const cache = new Map<string, Promise<CacheEntry>>();

function retainEntry(cacheKey: string, entry: CacheEntry): EnvironmentHandle {
  entry.refs++;
  let released = false;
  return {
    texture: entry.texture,
    owned: false,
    dispose: () => {
      if (released) return;
      released = true;
      entry.refs--;
      if (entry.refs === 0 && !entry.disposed) {
        entry.disposed = true;
        cache.delete(cacheKey);
        entry.texture.dispose();
      }
    },
  };
}

async function acquireCached(
  cacheKey: string,
  create: () => Promise<THREE.Texture>
): Promise<EnvironmentHandle> {
  let pending = cache.get(cacheKey);
  if (!pending) {
    pending = create().then((texture) => ({ texture, refs: 0, disposed: false }));
    cache.set(cacheKey, pending);
    pending.catch(() => {
      if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
    });
  }
  const entry = await pending;
  if (entry.disposed) return acquireCached(cacheKey, create);
  return retainEntry(cacheKey, entry);
}

function proceduralGradient(renderer: THREE.WebGLRenderer): EnvironmentHandle {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.3, '#888888');
  gradient.addColorStop(0.5, '#444444');
  gradient.addColorStop(0.7, '#222222');
  gradient.addColorStop(1, '#111111');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const envTexture = new THREE.CanvasTexture(canvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;

  const texture = pmremGenerator.fromEquirectangular(envTexture).texture;
  pmremGenerator.dispose();
  envTexture.dispose();

  return { texture, owned: true, dispose: () => texture.dispose() };
}

async function loadCubeTexture(urls: string[]): Promise<THREE.CubeTexture> {
  return new Promise((resolve, reject) => {
    new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject);
  });
}

export async function loadEnvironment(
  renderer: THREE.WebGLRenderer,
  spec: EnvironmentSpec | undefined,
  assetPath: string,
  resolve: (url: string) => string = (url) => url
): Promise<EnvironmentHandle> {
  const resolved = spec ?? 'none';

  if (typeof resolved === 'object' && 'cubeMap' in resolved && resolved.cubeMap?.length === 6) {
    const urls = resolved.cubeMap.map((face) => resolve(resolveAssetPath(assetPath, face)));
    return acquireCached(`cube:${urls.join('|')}`, async () => {
      const cubeTexture = await loadCubeTexture(urls);
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileCubemapShader();
      const texture = pmremGenerator.fromCubemap(cubeTexture).texture;
      pmremGenerator.dispose();
      cubeTexture.dispose();
      return texture;
    });
  }

  const source =
    typeof resolved === 'object' && 'source' in resolved
      ? resolved.source
      : typeof resolved === 'string' && resolved !== 'none'
        ? `environments/${resolved}.hdr`
        : null;

  if (source) {
    const url = resolve(resolveAssetPath(assetPath, source));
    try {
      return await acquireCached(`hdr:${url}`, async () => {
        const hdrTexture = await new HDRLoader()
          .setDataType(THREE.HalfFloatType)
          .loadAsync(url);

        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const texture = pmremGenerator.fromEquirectangular(hdrTexture).texture;
        pmremGenerator.dispose();
        hdrTexture.dispose();
        return texture;
      });
    } catch (error) {
      console.warn(`Failed to load HDR environment "${url}", using procedural fallback`, error);
    }
  }

  return proceduralGradient(renderer);
}

export function disposeEnvironmentCache(): void {
  const pending = [...cache.values()];
  cache.clear();
  for (const promise of pending) {
    promise
      .then((entry) => {
        entry.disposed = true;
        entry.texture.dispose();
      })
      .catch(() => {});
  }
}
