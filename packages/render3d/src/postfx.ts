import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export type AntialiasMode = 'none' | 'msaa' | 'smaa';

export interface BloomOptions {
  strength?: number;
  radius?: number;
  threshold?: number;
}

export interface OutlineOptions {
  edgeStrength?: number;
  pulsePeriod?: number;
  visibleEdgeColor?: string;
  hiddenEdgeColor?: string;
}

export interface PostFXOptions {
  enabled?: boolean;
  bloom?: false | BloomOptions;
  outline?: false | OutlineOptions;
  antialias?: AntialiasMode;
}

export class PostFX {
  #composer?: EffectComposer;
  #renderPass?: RenderPass;
  #bloomPass?: UnrealBloomPass;
  #smaaPass?: SMAAPass;
  #renderer: THREE.WebGLRenderer;
  #scene: THREE.Scene;
  #camera: THREE.Camera;

  outlinePass?: OutlinePass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: PostFXOptions,
    width: number,
    height: number
  ) {
    this.#renderer = renderer;
    this.#scene = scene;
    this.#camera = camera;

    const enabled = options.enabled ?? false;
    if (!enabled) return;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const samples = options.antialias === 'msaa' ? 4 : 0;
    const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      samples,
      type: THREE.HalfFloatType,
    });

    this.#composer = new EffectComposer(renderer, renderTarget);
    this.#composer.setSize(width, height);

    this.#renderPass = new RenderPass(scene, camera);
    this.#composer.addPass(this.#renderPass);

    if (options.outline) {
      this.outlinePass = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
      this.outlinePass.edgeStrength = options.outline.edgeStrength ?? 4;
      this.outlinePass.pulsePeriod = options.outline.pulsePeriod ?? 1.5;
      if (options.outline.visibleEdgeColor) {
        this.outlinePass.visibleEdgeColor.set(options.outline.visibleEdgeColor);
      }
      if (options.outline.hiddenEdgeColor) {
        this.outlinePass.hiddenEdgeColor.set(options.outline.hiddenEdgeColor);
      }
      this.#composer.addPass(this.outlinePass);
    }

    if (options.bloom) {
      this.#bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        options.bloom.strength ?? 0.4,
        options.bloom.radius ?? 0.6,
        options.bloom.threshold ?? 0.85
      );
      this.#composer.addPass(this.#bloomPass);
    }

    if (options.antialias === 'smaa') {
      this.#smaaPass = new SMAAPass();
      this.#composer.addPass(this.#smaaPass);
    }

    this.#composer.addPass(new OutputPass());
  }

  get enabled(): boolean {
    return !!this.#composer;
  }

  setCamera(camera: THREE.Camera): void {
    this.#camera = camera;
    if (this.#renderPass) this.#renderPass.camera = camera;
    if (this.outlinePass) this.outlinePass.renderCamera = camera;
  }

  setSize(width: number, height: number): void {
    this.#composer?.setSize(width, height);
  }

  render(): void {
    if (this.#composer) {
      this.#composer.render();
    } else {
      this.#renderer.render(this.#scene, this.#camera);
    }
  }

  dispose(): void {
    this.#composer?.dispose();
    this.outlinePass?.dispose();
    this.#bloomPass?.dispose();
    this.#smaaPass?.dispose();
    this.#composer = undefined;
    this.outlinePass = undefined;
  }
}
