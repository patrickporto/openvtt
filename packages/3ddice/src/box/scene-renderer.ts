import * as THREE from 'three';

import type { AntialiasMode, EnvironmentHandle, EnvironmentSpec, PostFXOptions } from '@openvtt/render3d';
import { PostFX, loadEnvironment } from '@openvtt/render3d';

import { CAMERA } from '../constants/camera';
import { POSITION } from '../constants/position';
import { SHADOW_MAP_SIZES, type ShadowQuality } from './config';
import type { CameraHeights, DisplayConfig } from './types';
import type { DiceMesh } from '../services/dice-mesh';

export interface SceneRendererInitOptions {
  antialias: AntialiasMode;
  maxPixelRatio: number;
  shadows: ShadowQuality;
}

export interface EnvironmentRequest {
  spec: EnvironmentSpec;
  fallback: EnvironmentSpec;
  assetPath: string;
  resolver: (url: string) => string;
  intensity: number;
}

export class SceneRenderer {
  readonly scene = new THREE.Scene();

  #renderer?: THREE.WebGLRenderer;
  #camera?: THREE.PerspectiveCamera;
  #light?: THREE.DirectionalLight;
  #lightAmb?: THREE.HemisphereLight;
  #desk?: THREE.Mesh;
  #deskGeometry?: THREE.PlaneGeometry;
  #postFX?: PostFX;
  #envHandle?: EnvironmentHandle;
  #envSeq = 0;

  get renderer(): THREE.WebGLRenderer | undefined {
    return this.#renderer;
  }

  get camera(): THREE.PerspectiveCamera | undefined {
    return this.#camera;
  }

  get postFX(): PostFX | undefined {
    return this.#postFX;
  }

  initialize(container: HTMLDivElement, options: SceneRendererInitOptions): void {
    this.#renderer = new THREE.WebGLRenderer({
      antialias: options.antialias === 'msaa',
      alpha: true,
      powerPreference: 'high-performance',
    });

    container.appendChild(this.#renderer.domElement);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.maxPixelRatio));
    this.#renderer.shadowMap.enabled = options.shadows !== 'none';
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.2;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.setClearColor(0x000000, 0);
  }

  recreatePostFX(postprocessing: Required<PostFXOptions>, antialias: AntialiasMode, display: DisplayConfig): void {
    this.#postFX?.dispose();
    if (!this.#renderer || !this.#camera) {
      this.#postFX = undefined;
      return;
    }
    this.#postFX = new PostFX(
      this.#renderer,
      this.scene,
      this.#camera,
      { ...postprocessing, antialias },
      display.currentWidth * 2 || 2,
      display.currentHeight * 2 || 2
    );
  }

  syncPostFXCamera(): void {
    if (this.#camera) this.#postFX?.setCamera(this.#camera);
  }

  applyLayout(display: DisplayConfig, heights: CameraHeights, cameraZ: number, shadows: ShadowQuality): void {
    const fullWidth = display.currentWidth * 2;
    const fullHeight = display.currentHeight * 2;

    this.#renderer?.setSize(fullWidth, fullHeight);
    this.#postFX?.setSize(fullWidth, fullHeight);

    if (this.#camera) {
      this.#camera.aspect = display.currentWidth / display.currentHeight;
      this.#camera.far = heights.max * CAMERA.FAR_MULTIPLIER;
      this.#camera.position.z = cameraZ;
      this.#camera.updateProjectionMatrix();
    } else {
      this.#camera = new THREE.PerspectiveCamera(
        CAMERA.FOV,
        display.currentWidth / display.currentHeight,
        CAMERA.NEAR,
        heights.max * CAMERA.FAR_MULTIPLIER
      );
      this.#camera.position.z = cameraZ;
    }
    this.#camera.lookAt(new THREE.Vector3(0, 0, 0));
    this.#postFX?.setCamera(this.#camera);

    const maxwidth = Math.max(display.containerWidth, display.containerHeight);

    if (!this.#lightAmb) {
      this.#lightAmb = new THREE.HemisphereLight(0xffffff, 0x080820, 4.0);
      this.scene.add(this.#lightAmb);
    }

    if (!this.#light) {
      this.#light = new THREE.DirectionalLight(0xffffff, 1.5);
      this.#light.target.position.set(0, 0, 0);
      this.scene.add(this.#light);
    }

    this.#light.position.set(
      -display.containerWidth / 20,
      display.containerHeight / 20,
      maxwidth / 2
    );

    this.#light.castShadow = shadows !== 'none';
    this.#light.shadow.camera.near = maxwidth / 10;
    this.#light.shadow.camera.far = maxwidth * 5;
    this.#light.shadow.bias = -0.0001;
    if (shadows !== 'none') {
      const size = SHADOW_MAP_SIZES[shadows];
      this.#light.shadow.mapSize.set(size, size);
    }

    const halfWidth = display.containerWidth / 2;
    const halfHeight = display.containerHeight / 2;
    const d = Math.max(halfWidth, halfHeight) * 1.05;
    this.#light.shadow.camera.left = -d * 2;
    this.#light.shadow.camera.right = d * 2;
    this.#light.shadow.camera.top = d;
    this.#light.shadow.camera.bottom = -d;
    this.#light.shadow.camera.updateProjectionMatrix();

    if (!this.#desk) {
      const shadowMaterial = new THREE.ShadowMaterial();
      shadowMaterial.opacity = 0.5;
      this.#deskGeometry = new THREE.PlaneGeometry(
        display.containerWidth * POSITION.CONTAINER_SCALE,
        display.containerHeight * POSITION.CONTAINER_SCALE,
        1,
        1
      );
      this.#desk = new THREE.Mesh(this.#deskGeometry, shadowMaterial);
      this.#desk.receiveShadow = shadows !== 'none';
      this.scene.add(this.#desk);
    } else if (this.#deskGeometry) {
      this.#deskGeometry.dispose();
      this.#deskGeometry = new THREE.PlaneGeometry(
        display.containerWidth * POSITION.CONTAINER_SCALE,
        display.containerHeight * POSITION.CONTAINER_SCALE,
        1,
        1
      );
      this.#desk.geometry = this.#deskGeometry;
    }
  }

  async applyEnvironment(request: EnvironmentRequest): Promise<void> {
    if (!this.#renderer) return;

    const seq = ++this.#envSeq;
    let handle: EnvironmentHandle;
    try {
      handle = await loadEnvironment(this.#renderer, request.spec, request.assetPath, request.resolver);
    } catch (error) {
      if (request.spec !== request.fallback) {
        console.warn('[dice] Theme cubeMap failed to load, falling back to configured environment', error);
        handle = await loadEnvironment(this.#renderer, request.fallback, request.assetPath, request.resolver);
      } else {
        throw error;
      }
    }

    if (seq !== this.#envSeq) {
      handle.dispose();
      return;
    }

    this.#envHandle?.dispose();
    this.#envHandle = handle;
    this.scene.environment = handle.texture;
    if ('environmentIntensity' in this.scene) {
      (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = request.intensity;
    }
  }

  renderFrame(): void {
    if (!this.#renderer || !this.#camera) return;
    if (this.#postFX?.enabled) {
      this.#postFX.render();
    } else {
      this.#renderer.render(this.scene, this.#camera);
    }
  }

  setShadowQuality(quality: ShadowQuality, dice: DiceMesh[]): void {
    if (this.#renderer) {
      this.#renderer.shadowMap.enabled = quality !== 'none';
    }
    if (this.#light) {
      this.#light.castShadow = quality !== 'none';
      if (quality !== 'none') {
        const size = SHADOW_MAP_SIZES[quality];
        this.#light.shadow.mapSize.set(size, size);
        this.#light.shadow.map?.dispose();
        this.#light.shadow.map = null;
      }
    }
    if (this.#desk) {
      this.#desk.receiveShadow = quality !== 'none';
    }
    for (const die of dice) {
      die.castShadow = quality !== 'none';
    }
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => mat && (mat.needsUpdate = true));
      }
    });
  }

  dispose(): void {
    this.#postFX?.dispose();
    this.#postFX = undefined;

    this.#envHandle?.dispose();
    this.#envHandle = undefined;
    this.scene.environment = null;

    this.#deskGeometry?.dispose();
    (this.#desk?.material as THREE.Material | undefined)?.dispose();
    this.#light?.shadow?.map?.dispose();

    if (this.#renderer) {
      this.#renderer.dispose();
      this.#renderer.forceContextLoss();
      this.#renderer.domElement.remove();
      this.#renderer = undefined;
    }
  }
}
