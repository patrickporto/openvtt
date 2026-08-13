import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { resolveAssetPath } from '@openvtt/render3d';

export interface DiceLoadersOptions {
  assetPath: string;
  resolver: (url: string) => string;
  dracoPath?: string;
}

export class DiceAssetLoaders {
  #assetPath: string;
  #resolver: (url: string) => string;
  #gltf = new GLTFLoader();
  #draco?: DRACOLoader;
  #texture = new THREE.TextureLoader();

  constructor(options: DiceLoadersOptions) {
    this.#assetPath = options.assetPath;
    this.#resolver = options.resolver;
    if (options.dracoPath) {
      this.#draco = new DRACOLoader();
      this.#draco.setDecoderPath(resolveAssetPath(this.#assetPath, options.dracoPath));
      this.#gltf.setDRACOLoader(this.#draco);
    }
  }

  resolve(source: string): string {
    return this.#resolver(resolveAssetPath(this.#assetPath, source));
  }

  loadModel(modelFile: string): Promise<THREE.Group | null> {
    const url = this.resolve(modelFile);
    return new Promise((resolve) => {
      this.#gltf.load(url, (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.geometry.center();
          }
        });
        resolve(model);
      }, undefined, (error) => {
        console.error('Failed to load dice model:', error);
        resolve(null);
      });
    });
  }

  loadTexture(source: string): Promise<THREE.Texture | null> {
    const url = this.resolve(source);
    return new Promise((resolve) => {
      this.#texture.load(url, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        resolve(texture);
      }, undefined, (error) => {
        console.warn(`Failed to load texture ${source}`, error);
        resolve(null);
      });
    });
  }

  dispose(): void {
    this.#draco?.dispose();
  }
}
