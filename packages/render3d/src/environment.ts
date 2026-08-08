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
  /** true when the consumer owns the texture and must dispose it */
  owned: boolean;
  dispose: () => void;
}

const cache = new Map<string, EnvironmentHandle>();

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
  assetPath: string
): Promise<EnvironmentHandle> {
  const resolved = spec ?? 'none';

  if (typeof resolved === 'object' && 'cubeMap' in resolved && resolved.cubeMap?.length === 6) {
    const urls = resolved.cubeMap.map((face) => resolveAssetPath(assetPath, face));
    const cacheKey = `cube:${urls.join('|')}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const cubeTexture = await loadCubeTexture(urls);
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileCubemapShader();
    const texture = pmremGenerator.fromCubemap(cubeTexture).texture;
    pmremGenerator.dispose();
    cubeTexture.dispose();

    const handle = { texture, owned: false, dispose: () => texture.dispose() };
    cache.set(cacheKey, handle);
    return handle;
  }

  const source =
    typeof resolved === 'object' && 'source' in resolved
      ? resolved.source
      : typeof resolved === 'string' && resolved !== 'none'
        ? `environments/${resolved}.hdr`
        : null;

  if (source) {
    const url = resolveAssetPath(assetPath, source);
    const cacheKey = `hdr:${url}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const hdrTexture = await new HDRLoader()
        .setDataType(THREE.HalfFloatType)
        .loadAsync(url);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const texture = pmremGenerator.fromEquirectangular(hdrTexture).texture;
      pmremGenerator.dispose();
      hdrTexture.dispose();

      const handle = { texture, owned: false, dispose: () => texture.dispose() };
      cache.set(cacheKey, handle);
      return handle;
    } catch (error) {
      console.warn(`Failed to load HDR environment "${url}", using procedural fallback`, error);
    }
  }

  return proceduralGradient(renderer);
}

export function disposeEnvironmentCache(): void {
  cache.forEach((handle) => handle.dispose());
  cache.clear();
}
