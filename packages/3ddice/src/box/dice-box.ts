import * as THREE from 'three';

import type { AssetManager } from '@openvtt/assets';
import type { EnvironmentSpec } from '@openvtt/render3d';

import { defaultRegistries, type DiceRegistries } from '../registries';
import { buildDiceManifest } from '../assets';
import { createDiceBus, type DiceBus } from '../bus';
import type { DieResult, RollResult } from '../results';
import { DiceColors, type ColorSet } from '../services/colors';
import { DiceFactory } from '../services/factory';
import { swapDiceFace, swapDiceFaceD4, type FaceSwapDeps } from '../services/face-swap';
import type { DiceMesh, ThrowVector } from '../services/dice-mesh';
import {
  createDefaultNotationParser,
  type NotationParser,
  type ParsedNotation,
} from '../services/notation';
import {
  configToOptions,
  normalizeOptions,
  normalizeShadows,
  type DiceBoxOptions,
  type NormalizedConfig,
  type ShadowQuality,
} from './config';
import type { DiceBoxDeps } from './deps';
import { LayoutController } from './layout';
import { PhysicsController } from './physics-controller';
import { RollOrchestrator, type SelectorDie } from './roll-orchestrator';
import { RollQueue } from './roll-queue';
import { SceneRenderer } from './scene-renderer';
import { SelectionController } from './selection';
import { SoundManager } from './sounds';
import { DiceSpawner } from './spawner';
import { ThrowPlanner } from './throw-planner';
import type { Vector2D } from './types';

export interface DiceBoxEvents {
  ready: void;
  'roll:start': { id: string; notation: string };
  'roll:finish': any;
  'roll:cancel': { id?: string };
  'die:click': { id: number; value: any };
  'theme:change': { theme: string };
  error: Error;
}

type RethrowFunction = (dicemesh: DiceMesh, args: string | string[]) => boolean;

export class DiceBox {
  #initialized = false;
  #disposed = false;

  private container: HTMLDivElement;
  private config: NormalizedConfig;
  private surface = 'wood_tray';
  private colorData?: ColorSet;

  readonly bus: DiceBus;
  private queue: RollQueue;
  private sounds: SoundManager;
  private selection: SelectionController;
  private sceneRenderer: SceneRenderer;
  private layout: LayoutController;
  private physics: PhysicsController;
  private spawner: DiceSpawner;
  private planner: ThrowPlanner;
  private orchestrator: RollOrchestrator;

  private registries: DiceRegistries;
  private parser: NotationParser;
  private diceColors: DiceColors;
  private diceFactory: DiceFactory;
  private faceSwapDeps: FaceSwapDeps;

  private assetManager?: AssetManager;
  private assetResolver: (url: string) => string;

  constructor(element: HTMLDivElement, options: DiceBoxOptions = {}) {
    this.container = element;
    this.config = normalizeOptions(options);
    const deps = options.deps ?? {};

    this.assetManager = this.config.assets?.manager;
    this.assetResolver = (url) => this.assetManager?.resolveUrl(url) ?? url;

    this.registries = deps.registries ?? defaultRegistries;
    this.parser = deps.parser ?? createDefaultNotationParser();
    this.bus = deps.bus ?? createDiceBus();

    this.queue = deps.queue ?? new RollQueue(
      () => this.config.queueMode,
      () => this.orchestrator.cancel()
    );
    this.sounds = deps.sounds ?? new SoundManager(this.config.assetPath);
    this.sounds.resolver = this.assetResolver;

    this.diceColors = deps.colors ?? new DiceColors({
      assetPath: this.config.assetPath,
      resolver: this.assetResolver,
      registries: this.registries,
    });
    this.diceFactory = deps.factory ?? new DiceFactory(
      {
        baseScale: this.config.baseScale,
        assetPath: this.config.assetPath,
        normalMaps: this.config.normalMaps,
        dracoPath: this.config.dracoPath,
        resolver: this.assetResolver,
      },
      { registries: this.registries, presets: deps.presets }
    );
    this.diceFactory.setBumpMapping(true);

    this.faceSwapDeps = {
      getPreset: (type) => this.diceFactory.ensure(type),
      createMaterials: (diceobj, size, margin, allowcache, d4specialindex) =>
        this.diceFactory.createMaterials(diceobj, size, margin, allowcache, d4specialindex),
    };

    const themeId = this.config.surface ?? this.config.theme;
    this.surface =
      this.registries.getTheme(themeId)?.surface ??
      this.registries.getTheme('default')?.surface ??
      'wood_tray';

    this.sceneRenderer = deps.sceneRenderer ?? new SceneRenderer();
    this.physics = deps.physics ?? new PhysicsController();
    this.layout = deps.layout ?? new LayoutController({
      container: this.container,
      onLayout: () => this.#handleLayout(),
    });
    this.planner = deps.planner ?? new ThrowPlanner({
      getDisplay: () => this.layout.display,
      getPreset: (type) => this.diceFactory.ensure(type),
    });
    this.spawner = deps.spawner ?? new DiceSpawner({
      scene: this.sceneRenderer.scene,
      factory: this.diceFactory,
      colors: this.diceColors,
      getConfig: () => ({ theme: this.config.theme, shadows: this.config.shadows }),
    });
    this.selection = deps.selection ?? new SelectionController({
      getDice: () => this.spawner.dice,
      getCamera: () => this.sceneRenderer.camera,
      getOutlinePass: () => this.sceneRenderer.postFX?.outlinePass,
      requestRender: () => {
        if (this.orchestrator.idle) this.renderFrame();
      },
      onDieClick: (id, value) => this.bus.emit('die:click', { id, value }),
    });
    this.orchestrator = deps.orchestrator ?? new RollOrchestrator({
      bus: this.bus,
      queue: this.queue,
      physics: this.physics,
      planner: this.planner,
      spawner: this.spawner,
      parser: this.parser,
      sounds: this.sounds,
      shapes: this.diceFactory,
      swapFace: (mesh, result) => swapDiceFace(mesh, result, this.faceSwapDeps),
      getConfig: () => ({
        timestep: this.config.timestep,
        iterationLimit: this.config.iterationLimit,
        strength: this.config.strength,
      }),
      getDisplay: () => this.layout.display,
      relayout: () => this.setDimensions(this.layout.dimensions),
      renderFrame: () => this.renderFrame(),
      clearSelection: () => this.selection.clear(),
      isDisposed: () => this.#disposed,
    });
  }

  get initialized(): boolean {
    return this.#initialized;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  get rolling(): boolean {
    return this.orchestrator.rolling;
  }

  get running(): boolean {
    return this.orchestrator.running;
  }

  get selectedIds(): Set<number> {
    return this.selection.selectedIds;
  }

  on<K extends keyof DiceBoxEvents & string>(event: K, handler: (payload: DiceBoxEvents[K]) => void): () => void {
    return this.bus.on(event as never, (payload: unknown) => handler(payload as DiceBoxEvents[K]));
  }

  off<K extends keyof DiceBoxEvents & string>(event: K, handler: (payload: DiceBoxEvents[K]) => void): void {
    this.bus.off(event as never, handler as never);
  }

  once<K extends keyof DiceBoxEvents & string>(event: K, handler: (payload: DiceBoxEvents[K]) => void): () => void {
    return this.bus.once(event as never, (payload: unknown) => handler(payload as DiceBoxEvents[K]));
  }

  registerRethrowFunction(name: string, fn: RethrowFunction): void {
    const key = name.toLowerCase();
    this.bus.tap('shouldReroll', key, (ctx) =>
      (ctx.func === key ? !!fn(ctx.die as DiceMesh, ctx.args) : undefined) as never
    );
  }

  async initialize(): Promise<void> {
    if (this.#initialized || this.#disposed) return;

    this.sceneRenderer.initialize(this.container, {
      antialias: this.config.antialias,
      maxPixelRatio: this.config.maxPixelRatio,
      shadows: this.config.shadows,
    });

    this.setDimensions(this.layout.dimensions);
    this.sceneRenderer.recreatePostFX(this.config.postprocessing, this.config.antialias, this.layout.display);
    this.layout.startResizeWatcher();

    const canvas = this.sceneRenderer.renderer?.domElement;
    if (canvas) {
      this.selection.attach(canvas);
    }

    await this.physics.initialize(
      {
        worker: this.config.worker,
        workerFactory: this.config.workerFactory,
        workerUrl: this.config.workerUrl,
        timestep: this.config.timestep,
        gravityMultiplier: this.config.gravityMultiplier,
      },
      this.layout.display.containerWidth || this.container.clientWidth,
      this.layout.display.containerHeight || this.container.clientHeight
    );

    await this.#prepareAssets();
    await this.#applyEnvironment();

    try {
      await this.loadTheme();

      if (this.config.sounds) {
        await this.loadSounds();
      }

      this.#initialized = true;
      this.renderFrame();
      this.bus.emit('ready');
    } catch (error) {
      console.error('Initialization failed:', error);
      this.bus.emit('error', error as Error);
      throw error;
    }
  }

  #handleLayout(): void {
    this.physics.updateBarriers(
      this.layout.display.containerWidth,
      this.layout.display.containerHeight
    );
    this.sceneRenderer.applyLayout(
      this.layout.display,
      this.layout.cameraHeight,
      this.orchestrator.resolveCameraZ(this.layout.cameraHeight),
      this.config.shadows
    );
    if (this.orchestrator.idle) {
      this.renderFrame();
    }
  }

  async #prepareAssets(): Promise<void> {
    if (!this.assetManager) return;
    const manifest = buildDiceManifest(this.config, this.surface, this.registries);
    this.assetManager.registerPack(manifest);
    if (this.config.assets?.preload === false) return;
    await this.assetManager.preload(manifest.name, {
      includeLazy: this.config.assets?.includeLazy ?? false,
    });
  }

  async #applyEnvironment(): Promise<void> {
    const theme = this.registries.getTheme(this.config.theme);
    const spec: EnvironmentSpec = theme?.cubeMap?.length === 6
      ? { cubeMap: theme.cubeMap }
      : this.config.environment;

    await this.sceneRenderer.applyEnvironment({
      spec,
      fallback: this.config.environment,
      assetPath: this.config.assetPath,
      resolver: this.assetResolver,
      intensity: this.config.environmentIntensity,
    });
  }

  select(dieIds: number[]): void {
    this.selection.select(dieIds);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  async loadTheme(): Promise<void> {
    let colorData: ColorSet;
    if (this.config.customColorset) {
      colorData = await this.diceColors.makeColorSet(this.config.customColorset);
    } else {
      colorData = await this.diceColors.getColorSet({
        colorset: this.config.theme,
        texture: this.config.texture,
        material: this.config.material,
      });
    }
    this.diceFactory.applyColorSet(colorData);
    this.colorData = colorData;
  }

  async loadSounds(): Promise<void> {
    this.sounds.enabled = this.config.sounds;
    this.sounds.volume = this.config.volume;
    this.sounds.surface = this.surface;
    this.sounds.dieMaterial = this.sounds.resolveDieMaterial(this.colorData?.texture?.material);
    await this.sounds.load();
  }

  loadAudio(src: string): Promise<HTMLAudioElement> {
    return this.sounds.loadAudio(src);
  }

  async updateConfig(options: DiceBoxOptions = {}): Promise<void> {
    const prev = this.config;
    const next = normalizeOptions({ ...configToOptions(this.config), ...options });
    this.config = next;

    const themeChanged =
      options.theme !== undefined ||
      options.theme_colorset !== undefined ||
      options.customColorset !== undefined ||
      options.theme_customColorset !== undefined ||
      options.texture !== undefined ||
      options.theme_texture !== undefined ||
      options.material !== undefined ||
      options.theme_material !== undefined;

    if (themeChanged) {
      await this.loadTheme();
      await this.#prepareAssets();
      this.bus.emit('theme:change', { theme: next.theme });
    }

    const envChanged =
      options.environment !== undefined ||
      (themeChanged && this.registries.getTheme(next.theme)?.cubeMap?.length === 6) ||
      options.environmentIntensity !== undefined;

    if (envChanged && this.sceneRenderer.renderer) {
      await this.#applyEnvironment();
    }

    if (options.shadows !== undefined && this.sceneRenderer.renderer) {
      this.setShadowQuality(next.shadows);
    }

    if (options.postprocessing !== undefined && this.sceneRenderer.renderer) {
      this.sceneRenderer.recreatePostFX(next.postprocessing, next.antialias, this.layout.display);
      this.sceneRenderer.syncPostFXCamera();
    }

    if (options.antialias !== undefined && options.antialias !== prev.antialias) {
      console.warn('[dice] "antialias" changes require a new DiceBox instance to take effect');
    }

    if (next.surface !== prev.surface) {
      this.surface = this.registries.getTheme(next.surface ?? next.theme)?.surface ?? this.surface;
    }

    if (next.sounds !== undefined || next.volume !== undefined) {
      this.sounds.enabled = next.sounds;
      this.sounds.volume = next.volume;
    }

    if (this.orchestrator.idle && this.sceneRenderer.renderer && this.sceneRenderer.camera) {
      this.renderFrame();
    }
  }

  setShadowQuality(quality: ShadowQuality | boolean): void {
    this.config = { ...this.config, shadows: normalizeShadows(quality) };
    this.sceneRenderer.setShadowQuality(this.config.shadows, this.spawner.dice);
    if (this.orchestrator.idle && this.sceneRenderer.renderer && this.sceneRenderer.camera) {
      this.renderFrame();
    }
  }

  toggleShadows(enabled: boolean): void {
    this.setShadowQuality(enabled);
  }

  setDimensions(dimensions: THREE.Vector2): void {
    this.layout.setDimensions(dimensions);
  }

  renderFrame(): void {
    this.sceneRenderer.renderFrame();
  }

  vectorRand(vector: Vector2D): Vector2D {
    return this.orchestrator.vectorRand(vector);
  }

  getNotationVectors(notation: string, vector: Vector2D, boost: number, dist: number): ParsedNotation {
    return this.orchestrator.getNotationVectors(notation, vector, boost, dist);
  }

  startClickThrow(notation: string): ParsedNotation {
    return this.orchestrator.startClickThrow(notation);
  }

  swapDiceFace(dicemesh: DiceMesh, result: number): Promise<void> {
    return swapDiceFace(dicemesh, result, this.faceSwapDeps);
  }

  swapDiceFace_D4(dicemesh: DiceMesh, result: number): Promise<void> {
    return swapDiceFaceD4(dicemesh, result, this.faceSwapDeps);
  }

  async spawnDice(vectordata: ThrowVector): Promise<DiceMesh | null> {
    return this.spawner.spawn(vectordata);
  }

  async showSelector(dice: SelectorDie[] = ['d20']): Promise<void> {
    return this.orchestrator.showSelector(dice);
  }

  clearDice(): void {
    this.orchestrator.clearDice();
  }

  clear(): void {
    this.orchestrator.clear();
  }

  cancel(): void {
    this.orchestrator.cancel();
  }

  getDiceResults(): RollResult;
  getDiceResults(id: number): DieResult;
  getDiceResults(id?: number): RollResult | DieResult {
    return id !== undefined
      ? this.orchestrator.getDiceResults(id)
      : this.orchestrator.getDiceResults();
  }

  async roll(notationString: string | string[]): Promise<RollResult> {
    return this.orchestrator.roll(notationString);
  }

  async reroll(diceIdArray: number[]): Promise<DieResult[]> {
    return this.orchestrator.reroll(diceIdArray);
  }

  async add(notationString: string): Promise<DieResult[] | RollResult> {
    return this.orchestrator.add(notationString);
  }

  async remove(diceIdArray: number[]): Promise<DieResult[]> {
    return this.orchestrator.remove(diceIdArray);
  }

  async rollDice(token: number): Promise<void> {
    return this.orchestrator.rollDice(token);
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.orchestrator.interrupt();

    this.layout.stopResizeWatcher();
    this.selection.detach();
    this.spawner.removeAll();
    this.physics.destroy();
    this.sceneRenderer.dispose();
    this.diceFactory.disposeCachedMaterials();
    this.sounds.dispose();
    this.bus.destroy();
    this.#initialized = false;
  }
}

export function createDiceBox(element: HTMLDivElement, options: DiceBoxOptions = {}): DiceBox {
  return new DiceBox(element, options);
}
