import * as THREE from 'three';

import { newId } from '@openvtt/events';
import type { PhysicsConfig, PhysicsHost, SpawnPayload, StepResult } from '@openvtt/physics';
import { createPhysicsHost } from '@openvtt/physics';
import type { EnvironmentSpec } from '@openvtt/render3d';
import { PostFX, disposeEnvironmentCache, loadEnvironment } from '@openvtt/render3d';

import { DiceNotation } from '../services/notation';
import { DiceFactory } from '../services/factory';
import { DiceColors } from '../services/colors';
import { getTheme } from '../registries';
import { PHYSICS } from '../constants/physics';
import { MATERIALS } from '../constants/materials';
import { CAMERA } from '../constants/camera';
import { POSITION } from '../constants/position';
import { DICE } from '../constants/dice';
import { debounce } from '../utils';
import { RollCancelledError } from '../errors';
import { createDiceBus, type DiceBus, type RerollContext } from '../bus';
import {
  SHADOW_MAP_SIZES,
  configToOptions,
  normalizeOptions,
  normalizeShadows,
  type DiceBoxOptions,
  type NormalizedConfig,
  type ShadowQuality,
} from './config';
import { RollQueue } from './roll-queue';
import { SoundManager } from './sounds';
import { SelectionController } from './selection';

const BODY_SLEEPING = 2;

export interface DiceBoxEvents {
  ready: void;
  'roll:start': { id: string; notation: string };
  'roll:finish': any;
  'roll:cancel': { id?: string };
  'die:click': { id: number; value: any };
  'theme:change': { theme: string };
  error: Error;
}

interface DisplayConfig {
  currentWidth: number;
  currentHeight: number;
  containerWidth: number;
  containerHeight: number;
  aspect: number;
  scale: number;
}

interface Vector2D {
  x: number;
  y: number;
}

interface DieStub {
  quaternion: THREE.Quaternion;
  sleepState: number;
  type: number;
}

type RethrowFunction = (dicemesh: any, args: string | string[]) => boolean;

export class DiceBox {
  #initialized = false;
  #disposed = false;
  #rolling = false;
  #animState: 'idle' | 'throw' | 'selector' | 'afterthrow' | 'simulate' = 'idle';
  #threadId = 0;
  #dieIndex = 0;
  #iteration = 0;
  #rollToken = 0;
  #currentRollId = '';

  private container: HTMLDivElement;
  private dimensions: THREE.Vector2;
  private diceList: any[] = [];
  private display: DisplayConfig = {
    currentWidth: 0,
    currentHeight: 0,
    containerWidth: 0,
    containerHeight: 0,
    aspect: 1,
    scale: 1,
  };
  private cameraHeight = { max: 0, close: 0, medium: 0, far: 0 };
  private scene: THREE.Scene;
  private diceColors: DiceColors;
  private diceFactory: DiceFactory;
  private physics!: PhysicsHost;
  private config: NormalizedConfig;
  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.PerspectiveCamera;
  private light!: THREE.DirectionalLight;
  private lightAmb!: THREE.HemisphereLight;
  private desk!: THREE.Mesh;
  private deskGeometry?: THREE.PlaneGeometry;
  private postFX?: PostFX;
  private envTexture?: THREE.Texture;
  private envOwned = false;
  private colorData: any;
  private notationVectors: any;
  private surface = 'wood_tray';
  private selector: { dice: string[] } = { dice: [] };
  private resizeHandler?: ReturnType<typeof debounce>;

  readonly bus: DiceBus;
  private queue: RollQueue;
  private sounds: SoundManager;
  private selection: SelectionController;

  constructor(element: HTMLDivElement, options: DiceBoxOptions = {}) {
    this.container = element;
    this.dimensions = new THREE.Vector2(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.scene = new THREE.Scene();
    this.config = normalizeOptions(options);

    this.bus = createDiceBus();
    this.queue = new RollQueue(
      () => this.config.queueMode,
      () => this.cancel()
    );
    this.sounds = new SoundManager(this.config.assetPath);
    this.selection = new SelectionController({
      getDice: () => this.diceList,
      getCamera: () => this.camera,
      getOutlinePass: () => this.postFX?.outlinePass,
      requestRender: () => {
        if (this.#animState === 'idle') this.renderFrame();
      },
      onDieClick: (id, value) => this.bus.emit('die:click', { id, value }),
    });

    this.diceColors = new DiceColors({ assetPath: this.config.assetPath });
    this.diceFactory = new DiceFactory({
      baseScale: this.config.baseScale,
      assetPath: this.config.assetPath,
      normalMaps: this.config.normalMaps,
      dracoPath: this.config.dracoPath,
    });
    this.diceFactory.setBumpMapping(true);

    const themeId = this.config.surface ?? this.config.theme;
    this.surface = getTheme(themeId)?.surface ?? getTheme('default')?.surface ?? 'wood_tray';
  }

  get initialized(): boolean {
    return this.#initialized;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  get rolling(): boolean {
    return this.#rolling;
  }

  get running(): boolean {
    return this.#animState !== 'idle';
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
      (ctx.func === key ? !!fn(ctx.die, ctx.args) : undefined) as never
    );
  }

  async initialize(): Promise<void> {
    if (this.#initialized || this.#disposed) return;

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.config.antialias === 'msaa',
      alpha: true,
      powerPreference: 'high-performance',
    });

    this.container.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.config.maxPixelRatio));
    this.renderer.shadowMap.enabled = this.config.shadows !== 'none';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    this.setDimensions(this.dimensions);
    this.#createPostFX();
    this.#setupResize();
    this.selection.attach(this.renderer.domElement);

    await this.#initPhysics();
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

  #createPostFX(): void {
    this.postFX?.dispose();
    const pp = this.config.postprocessing;
    this.postFX = new PostFX(
      this.renderer,
      this.scene,
      this.camera,
      { ...pp, antialias: this.config.antialias },
      this.display.currentWidth * 2 || 2,
      this.display.currentHeight * 2 || 2
    );
  }

  async #initPhysics(): Promise<void> {
    const physicsConfig: PhysicsConfig = {
      gravity: PHYSICS.GRAVITY_MULTIPLIER * this.config.gravityMultiplier,
      friction: MATERIALS.FRICTION,
      deskRestitution: MATERIALS.DESK_RESTITUTION,
      barrierRestitution: MATERIALS.BARRIER_RESTITUTION,
      solverIterations: PHYSICS.SOLVER_ITERATIONS,
      sleepSpeedLimit: PHYSICS.SLEEP_SPEED_LIMIT,
      sleepTimeLimit: PHYSICS.SLEEP_TIME_LIMIT,
      linearDamping: PHYSICS.LINEAR_DAMPING,
      angularDamping: PHYSICS.ANGULAR_DAMPING,
    };

    this.physics = await createPhysicsHost(physicsConfig, {
      worker: this.config.worker,
      workerFactory: this.config.workerFactory,
      workerUrl: this.config.workerUrl,
      timestep: this.config.timestep,
      onFallback: (error) =>
        console.warn('[dice] Physics worker unavailable, falling back to main thread', error),
    });

    await this.physics.updateBarriers(
      this.display.containerWidth || this.container.clientWidth,
      this.display.containerHeight || this.container.clientHeight,
      POSITION.WALL_SCALE
    );
  }

  async #applyEnvironment(): Promise<void> {
    const theme = getTheme(this.config.theme);
    const spec: EnvironmentSpec = theme?.cubeMap?.length === 6
      ? { cubeMap: theme.cubeMap }
      : this.config.environment;

    let handle;
    try {
      handle = await loadEnvironment(this.renderer, spec, this.config.assetPath);
    } catch (error) {
      if (spec !== this.config.environment) {
        console.warn('[dice] Theme cubeMap failed to load, falling back to configured environment', error);
        handle = await loadEnvironment(this.renderer, this.config.environment, this.config.assetPath);
      } else {
        throw error;
      }
    }

    if (this.envOwned) {
      this.envTexture?.dispose();
    }
    this.envTexture = handle.texture;
    this.envOwned = handle.owned;
    this.scene.environment = handle.texture;
    if ('environmentIntensity' in this.scene) {
      (this.scene as any).environmentIntensity = this.config.environmentIntensity;
    }
  }

  #setupResize(): void {
    let lastWidth = this.container.clientWidth;
    let lastHeight = this.container.clientHeight;

    const resize = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      this.setDimensions(new THREE.Vector2(width, height));
    };

    this.resizeHandler = debounce(resize);
    window.addEventListener('resize', this.resizeHandler!);
  }

  select(dieIds: number[]): void {
    this.selection.select(dieIds);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  async loadTheme(): Promise<void> {
    let colorData;
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
    this.config.soundDieMaterial = this.sounds.resolveDieMaterial(this.colorData?.texture?.material);
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
      this.bus.emit('theme:change', { theme: next.theme });
    }

    const envChanged =
      options.environment !== undefined ||
      (themeChanged && getTheme(next.theme)?.cubeMap?.length === 6) ||
      options.environmentIntensity !== undefined;

    if (envChanged && this.renderer) {
      await this.#applyEnvironment();
    }

    if (options.shadows !== undefined && this.renderer) {
      this.setShadowQuality(next.shadows);
    }

    if (options.postprocessing !== undefined && this.renderer) {
      this.#createPostFX();
      this.postFX?.setCamera(this.camera);
    }

    if (options.antialias !== undefined && options.antialias !== prev.antialias) {
      console.warn('[dice] "antialias" changes require a new DiceBox instance to take effect');
    }

    if (next.surface !== prev.surface) {
      this.surface = getTheme(next.surface ?? next.theme)?.surface ?? this.surface;
    }

    if (next.sounds !== undefined || next.volume !== undefined) {
      this.sounds.enabled = next.sounds;
      this.sounds.volume = next.volume;
    }

    if (this.#animState === 'idle' && this.renderer && this.camera) {
      this.renderFrame();
    }
  }

  setShadowQuality(quality: ShadowQuality | boolean): void {
    this.config.shadows = normalizeShadows(quality);
    const q = this.config.shadows;

    if (this.renderer) {
      this.renderer.shadowMap.enabled = q !== 'none';
    }
    if (this.light) {
      this.light.castShadow = q !== 'none';
      if (q !== 'none') {
        const size = SHADOW_MAP_SIZES[q];
        this.light.shadow.mapSize.set(size, size);
        this.light.shadow.map?.dispose();
        (this.light.shadow as any).map = null;
      }
    }
    if (this.desk) {
      this.desk.receiveShadow = q !== 'none';
    }
    for (const die of this.diceList) {
      die.castShadow = q !== 'none';
    }
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if ((mesh as any).isMesh) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => mat && (mat.needsUpdate = true));
      }
    });
    if (this.#animState === 'idle' && this.renderer && this.camera) {
      this.renderFrame();
    }
  }

  toggleShadows(enabled: boolean): void {
    this.setShadowQuality(enabled);
  }

  setDimensions(dimensions: THREE.Vector2): void {
    this.display.currentWidth = this.container.clientWidth / 2;
    this.display.currentHeight = this.container.clientHeight / 2;
    if (dimensions) {
      this.display.containerWidth = dimensions.x;
      this.display.containerHeight = dimensions.y;
    } else {
      this.display.containerWidth = this.display.currentWidth;
      this.display.containerHeight = this.display.currentHeight;
    }
    this.display.aspect = Math.min(
      this.display.currentWidth / this.display.containerWidth,
      this.display.currentHeight / this.display.containerHeight
    );
    if (this.display.aspect) {
      this.display.scale =
        Math.sqrt(
          this.display.containerWidth * this.display.containerWidth +
          this.display.containerHeight * this.display.containerHeight
        ) / 13;
    }

    this.physics?.updateBarriers(
      this.display.containerWidth,
      this.display.containerHeight,
      POSITION.WALL_SCALE
    );

    const fullWidth = this.display.currentWidth * 2;
    const fullHeight = this.display.currentHeight * 2;

    this.renderer?.setSize(fullWidth, fullHeight);
    this.postFX?.setSize(fullWidth, fullHeight);

    this.cameraHeight.max =
      this.display.currentHeight / this.display.aspect / POSITION.CAMERA_TAN_ANGLE;
    this.cameraHeight.medium = this.cameraHeight.max / POSITION.MEDIUM_DIVIDER;
    this.cameraHeight.far = this.cameraHeight.max;
    this.cameraHeight.close = this.cameraHeight.max / POSITION.CLOSE_DIVIDER;

    const cameraZ = this.#resolveCameraZ();

    if (this.camera) {
      this.camera.aspect = this.display.currentWidth / this.display.currentHeight;
      this.camera.far = this.cameraHeight.max * CAMERA.FAR_MULTIPLIER;
      this.camera.position.z = cameraZ;
      this.camera.updateProjectionMatrix();
    } else {
      this.camera = new THREE.PerspectiveCamera(
        CAMERA.FOV,
        this.display.currentWidth / this.display.currentHeight,
        CAMERA.NEAR,
        this.cameraHeight.max * CAMERA.FAR_MULTIPLIER
      );
      this.camera.position.z = cameraZ;
    }
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));
    this.postFX?.setCamera(this.camera);

    const maxwidth = Math.max(this.display.containerWidth, this.display.containerHeight);

    if (!this.lightAmb) {
      this.lightAmb = new THREE.HemisphereLight(0xffffff, 0x080820, 4.0);
      this.scene.add(this.lightAmb);
    }

    if (!this.light) {
      this.light = new THREE.DirectionalLight(0xffffff, 1.5);
      this.light.target.position.set(0, 0, 0);
      this.scene.add(this.light);
    }

    this.light.position.set(
      -this.display.containerWidth / 20,
      this.display.containerHeight / 20,
      maxwidth / 2
    );

    const shadowQuality = this.config.shadows;
    this.light.castShadow = shadowQuality !== 'none';
    this.light.shadow.camera.near = maxwidth / 10;
    this.light.shadow.camera.far = maxwidth * 5;
    this.light.shadow.bias = -0.0001;
    if (shadowQuality !== 'none') {
      const size = SHADOW_MAP_SIZES[shadowQuality];
      this.light.shadow.mapSize.set(size, size);
    }

    const halfWidth = this.display.containerWidth / 2;
    const halfHeight = this.display.containerHeight / 2;
    const d = Math.max(halfWidth, halfHeight) * 1.05;
    this.light.shadow.camera.left = -d * 2;
    this.light.shadow.camera.right = d * 2;
    this.light.shadow.camera.top = d;
    this.light.shadow.camera.bottom = -d;
    this.light.shadow.camera.updateProjectionMatrix();

    if (!this.desk) {
      const shadowMaterial = new THREE.ShadowMaterial();
      shadowMaterial.opacity = 0.5;
      this.deskGeometry = new THREE.PlaneGeometry(
        this.display.containerWidth * POSITION.CONTAINER_SCALE,
        this.display.containerHeight * POSITION.CONTAINER_SCALE,
        1,
        1
      );
      this.desk = new THREE.Mesh(this.deskGeometry, shadowMaterial);
      this.desk.receiveShadow = shadowQuality !== 'none';
      this.scene.add(this.desk);
    } else if (this.deskGeometry) {
      this.deskGeometry.dispose();
      this.deskGeometry = new THREE.PlaneGeometry(
        this.display.containerWidth * POSITION.CONTAINER_SCALE,
        this.display.containerHeight * POSITION.CONTAINER_SCALE,
        1,
        1
      );
      this.desk.geometry = this.deskGeometry;
    }

    if (this.#animState === 'idle' && this.renderer) {
      this.renderFrame();
    }
  }

  #resolveCameraZ(): number {
    if (this.#animState === 'selector') {
      const count = this.selector?.dice?.length || 1;
      return count > 9
        ? this.cameraHeight.far
        : count < 6
          ? this.cameraHeight.close
          : this.cameraHeight.medium;
    }
    return this.cameraHeight.far;
  }

  renderFrame(): void {
    if (!this.renderer || !this.camera) return;
    if (this.postFX?.enabled) {
      this.postFX.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  vectorRand({ x, y }: Vector2D): Vector2D {
    const angle = (Math.random() * Math.PI) / 5 - Math.PI / 5 / 2;
    const vec = {
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
    };
    if (vec.x == 0) vec.x = 0.01;
    if (vec.y == 0) vec.y = 0.01;
    return vec;
  }

  getNotationVectors(notation: string, vector: Vector2D, boost: number, dist: number): any {
    const notationVectors = new DiceNotation(notation);

    for (const set of notationVectors.set) {
      const diceobj = this.diceFactory.get(set.type);
      if (!diceobj) continue;
      const numdice = set.num;

      for (let k = 0; k < numdice; k++) {
        const vec = this.vectorRand(vector);
        vec.x /= dist;
        vec.y /= dist;

        const pos = {
          x: this.display.containerWidth * (vec.x > 0 ? -1 : 1) * POSITION.WALL_SCALE,
          y: this.display.containerHeight * (vec.y > 0 ? -1 : 1) * POSITION.WALL_SCALE,
          z: Math.random() * (DICE.RANDOM_Z_MAX - DICE.RANDOM_Z_MIN) + DICE.RANDOM_Z_MIN,
        };

        const projector = Math.abs(vec.x / vec.y);
        if (projector > 1.0) pos.y /= projector;
        else pos.x *= projector;

        const velvec = this.vectorRand(vector);
        velvec.x /= dist;
        velvec.y /= dist;
        let velocity, angle, axis;

        if (diceobj.shape != 'd2') {
          velocity = { x: velvec.x * boost, y: velvec.y * boost, z: -10 };
          angle = {
            x: -(Math.random() * vec.y * 5 + diceobj.inertia * vec.y),
            y: Math.random() * vec.x * 5 + diceobj.inertia * vec.x,
            z: 0,
          };
          axis = { x: Math.random(), y: Math.random(), z: Math.random(), a: Math.random() };
        } else {
          velocity = {
            x: (velvec.x * boost) / 10,
            y: (velvec.y * boost) / 10,
            z: DICE.COIN_VELOCITY_Z,
          };
          angle = {
            x: DICE.COIN_ANGLE_X * diceobj.inertia,
            y: DICE.COIN_ANGLE_Y * diceobj.inertia,
            z: 0,
          };
          axis = { x: 1, y: 1, z: Math.random(), a: Math.random() };
        }

        notationVectors.vectors.push({
          index: this.#dieIndex++,
          type: diceobj.type,
          op: set.op,
          sid: set.sid,
          gid: set.gid,
          glvl: set.glvl,
          func: set.func,
          args: set.args,
          style: set.style,
          pos,
          velocity,
          angle,
          axis,
        });
      }
    }

    return notationVectors;
  }

  swapDiceFace(dicemesh: any, result: number): void {
    const diceobj = this.diceFactory.get(dicemesh.notation.type);

    dicemesh.resultReason = 'forced';

    if (diceobj.shape == 'd4') {
      this.swapDiceFace_D4(dicemesh, result);
      return;
    }

    let value = parseInt(String(dicemesh.getLastValue().value));
    let resultParsed: number = parseInt(String(result));

    if (dicemesh.notation.type == 'd10' && value == 0) value = 10;
    if (dicemesh.notation.type == 'd100' && value == 0) value = 100;
    if (dicemesh.notation.type == 'd100' && value > 0 && value < 10) value *= 10;
    if (dicemesh.notation.type == 'd10' && resultParsed == 0) resultParsed = 10;
    if (dicemesh.notation.type == 'd100' && resultParsed == 0) resultParsed = 100;
    if (dicemesh.notation.type == 'd100' && resultParsed > 0 && resultParsed < 10) resultParsed *= 10;

    const valueindex = diceobj.values.indexOf(value);
    const resultindex = diceobj.values.indexOf(resultParsed);

    if (valueindex < 0 || resultindex < 0) return;
    if (valueindex == resultindex) return;

    const geom = dicemesh.geometry.clone();
    geom.userData.owned = true;

    const geomindex_value = [];
    const geomindex_result = [];

    let magic: number = DICE.MATERIAL_INDEX_DEFAULT;
    if (diceobj.shape == 'd10') magic = DICE.MATERIAL_INDEX_D10;

    let material_value: number, material_result: number;
    if (diceobj.shape != 'd2') {
      material_value = valueindex + magic;
      material_result = resultindex + magic;
    } else {
      material_value = valueindex + 1;
      material_result = resultindex + 1;
    }

    for (let i = 0, l = geom.groups.length; i < l; ++i) {
      const face = geom.groups[i];
      const matindex = face.materialIndex;

      if (matindex == material_value) {
        geomindex_value.push(i);
        continue;
      }
      if (matindex == material_result) {
        geomindex_result.push(i);
        continue;
      }
    }

    if (geomindex_value.length <= 0 || geomindex_result.length <= 0) return;

    for (let i = 0, l = geomindex_result.length; i < l; i++) {
      geom.groups[geomindex_result[i]].materialIndex = material_value;
    }
    for (let i = 0, l = geomindex_value.length; i < l; i++) {
      geom.groups[geomindex_value[i]].materialIndex = material_result;
    }

    dicemesh.geometry = geom;
    dicemesh.result = [];
  }

  swapDiceFace_D4(dicemesh: any, result: number): void {
    const diceobj = this.diceFactory.get(dicemesh.notation.type);
    const value = parseInt(String(dicemesh.getLastValue().value));

    if (!(value >= 1 && value <= 4)) return;

    let num = result - value;
    const geom = dicemesh.geometry.clone();
    geom.userData.owned = true;

    for (let i = 0, l = geom.groups.length; i < l; ++i) {
      const face = geom.groups[i];
      let matindex = face.materialIndex;
      if (matindex == 0) continue;

      matindex += num - 1;
      while (matindex > 4) matindex -= 4;
      while (matindex < 1) matindex += 4;
      face.materialIndex = matindex + 1;
    }
    if (num != 0) {
      if (num < 0) num += 4;
      dicemesh.material = this.diceFactory.createMaterials(diceobj, 0, 0, false, num);
    }

    dicemesh.geometry = geom;
  }

  async spawnDice(vectordata: any): Promise<any> {
    let dicemesh;

    if (vectordata.style && this.config.theme) {
      const styleColorData = await this.diceColors.getColorSetForDiceType(
        this.config.theme,
        vectordata.style
      );
      dicemesh = await this.diceFactory.createWithColorSet(vectordata.type, styleColorData as any);
    } else {
      dicemesh = await this.diceFactory.create(vectordata.type);
    }
    if (!dicemesh) return null;

    dicemesh.notation = vectordata;
    dicemesh.result = [];
    dicemesh.stopped = 0;
    dicemesh.castShadow = this.config.shadows !== 'none';

    const stub: DieStub = {
      quaternion: new THREE.Quaternion(),
      sleepState: 0,
      type: 1,
    };
    dicemesh.body = stub;

    this.scene.add(dicemesh);
    this.diceList.push(dicemesh);
    return dicemesh;
  }

  #buildSpawnPayloads(): SpawnPayload[] {
    const payloads: SpawnPayload[] = [];
    for (let i = 0; i < this.diceList.length; i++) {
      const dicemesh = this.diceList[i];
      const vectordata = dicemesh.notation;
      const shape = this.diceFactory.getShapeDescriptor(vectordata.type);
      if (!shape) continue;
      payloads.push({
        index: i,
        shape,
        mass: dicemesh.mass,
        shapeTag: dicemesh.shape,
        pos: vectordata.pos,
        velocity: vectordata.velocity,
        angle: vectordata.angle,
        axis: vectordata.axis,
      });
    }
    return payloads;
  }

  #applyStates(states: StepResult['states']): void {
    for (const state of states) {
      const dicemesh = this.diceList[state.index];
      if (!dicemesh) continue;
      dicemesh.position.set(state.position.x, state.position.y, state.position.z);
      dicemesh.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
      if (dicemesh.body) {
        dicemesh.body.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
        dicemesh.body.sleepState = state.sleepState;
      }
    }
  }

  #checkForRethrow(dicemesh: any): boolean {
    const func = dicemesh.notation.func?.toLowerCase() || '';
    if (!func) return false;
    const ctx = { die: dicemesh, func, args: dicemesh.notation.args || '' } as RerollContext;
    return (this.bus.call('shouldReroll', ctx) as unknown) === true;
  }

  #evaluateThrow(forcedFinish: boolean): { finished: boolean; rethrow: number[] } {
    const rethrow: number[] = [];

    for (let i = 0; i < this.diceList.length; i++) {
      const dicemesh = this.diceList[i];
      if (!dicemesh?.body) continue;

      if (dicemesh.body.sleepState < BODY_SLEEPING && !forcedFinish) {
        return { finished: false, rethrow: [] };
      }
      if (dicemesh.body.sleepState !== BODY_SLEEPING && !forcedFinish) {
        continue;
      }

      if (dicemesh.result.length === 0) {
        dicemesh.storeRolledValue(dicemesh.resultReason);
      } else if (dicemesh.result.length > 0 && dicemesh.rerolling) {
        dicemesh.rerolling = false;
        dicemesh.storeRolledValue('reroll');
      }

      if (this.#checkForRethrow(dicemesh)) {
        dicemesh.rerolls += 1;
        dicemesh.rerolling = true;
        rethrow.push(i);
      }
    }

    return { finished: true, rethrow };
  }

  #markAllKinematic(): void {
    for (const dicemesh of this.diceList) {
      if (dicemesh?.body) {
        dicemesh.rerolling = false;
        dicemesh.body.type = 3;
      }
    }
  }

  #tossReroll(indices: number[]): Promise<void> | void {
    return this.physics.applyImpulse(indices, PHYSICS.REROLL_VELOCITY, PHYSICS.REROLL_ANGULAR);
  }

  async #simulateThrow(token: number): Promise<void> {
    this.#animState = 'simulate';
    this.#iteration = 0;
    this.#rolling = true;

    for (;;) {
      this.#assertActive(token);
      const result = await this.physics.simulate(this.config.iterationLimit);
      this.#applyStates(result.states);

      const evaluation = this.#evaluateThrow(true);
      if (evaluation.rethrow.length > 0) {
        await this.#tossReroll(evaluation.rethrow);
        continue;
      }
      break;
    }
    this.#animState = 'throw';
  }

  #assertActive(token: number): void {
    if (this.#disposed || token !== this.#rollToken) {
      throw new RollCancelledError();
    }
  }

  async #animateThrow(threadid: number, token: number): Promise<void> {
    this.#animState = 'throw';
    const thread = threadid;
    let lastTime: number | null = null;

    return new Promise((resolve, reject) => {
      const frame = async () => {
        try {
          if (this.#disposed || thread !== this.#threadId || token !== this.#rollToken) {
            reject(new RollCancelledError());
            return;
          }

          const now = performance.now();
          if (lastTime === null) lastTime = now - this.config.timestep * 1000;
          const timeDiff = (now - lastTime) / 1000;
          this.#iteration++;
          const neededSteps = Math.min(Math.floor(timeDiff / this.config.timestep), 5);

          let stepResult: StepResult | null = null;
          if (neededSteps > 0) {
            stepResult = await this.physics.step(neededSteps);
            lastTime = lastTime + neededSteps * this.config.timestep * 1000;
            this.#assertActive(token);
            this.#applyStates(stepResult.states);
            this.sounds.playCollideEvents(stepResult.collideEvents, this.#animState === 'simulate');
          }

          this.renderFrame();

          const forcedFinish = this.#iteration > this.config.iterationLimit;
          const allAsleep = stepResult?.allAsleep ?? false;

          if (allAsleep || forcedFinish) {
            const evaluation = this.#evaluateThrow(forcedFinish);
            if (!evaluation.finished) {
              requestAnimationFrame(frame);
              return;
            }
            if (evaluation.rethrow.length > 0) {
              await this.#tossReroll(evaluation.rethrow);
              this.#assertActive(token);
              requestAnimationFrame(frame);
              return;
            }

            this.#markAllKinematic();
            this.#rolling = false;
            this.#animState = 'afterthrow';
            resolve();
            return;
          }

          requestAnimationFrame(frame);
        } catch (error) {
          reject(error);
        }
      };
      requestAnimationFrame(frame);
    });
  }

  async showSelector(dice: (string | { type: string; style?: string })[] = ['d20']): Promise<void> {
    this.clearDice();
    this.#rolling = false;
    this.#animState = 'selector';
    this.selector = { dice: dice.map((d) => (typeof d === 'string' ? d : d.type)) };
    this.setDimensions(this.dimensions);

    const threadid = ++this.#threadId;

    for (const diceItem of dice) {
      const type = typeof diceItem === 'string' ? diceItem : diceItem.type;
      const style = typeof diceItem === 'string' ? undefined : diceItem.style;
      await this.spawnDice({
        type,
        style,
        pos: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        angle: { x: 0, y: 0, z: 0 },
        axis: { x: 0, y: 0, z: 0, a: 0 },
      });
    }

    const frame = () => {
      if (this.#disposed || threadid !== this.#threadId || this.#animState !== 'selector') return;

      const spacing = 100;
      const totalDice = this.diceList.length;
      const startX = -((totalDice - 1) * spacing) / 2;

      this.diceList.forEach((die, index) => {
        if (die) {
          die.rotation.y += 0.01;
          die.rotation.x += 0.005;
          const xPos = startX + index * spacing;
          die.position.set(xPos, 0, 0);
        }
      });

      this.renderFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  startClickThrow(notation: string): any {
    if (this.#rolling) {
      this.clearDice();
      this.#rolling = false;
    }

    const vector = {
      x: (Math.random() * 2 - 0.5) * this.display.currentWidth,
      y: -(Math.random() * 2 - 0.5) * this.display.currentHeight,
    };
    const dist = Math.sqrt(vector.x * vector.x + vector.y * vector.y) + 100;
    const boost = (Math.random() + 3) * dist * this.config.strength;

    return this.getNotationVectors(notation, vector, boost, dist);
  }

  clearDice(): void {
    this.#threadId++;
    this.#animState = 'idle';

    let dice;
    while ((dice = this.diceList.pop())) {
      this.scene.remove(dice);
      this.#disposeMesh(dice);
    }
    this.selection.clear();
    this.physics?.clear();

    if (this.renderer && this.camera) {
      this.renderFrame();
    }
  }

  #disposeMesh(dice: any): void {
    if (dice.userData?.fromModel) return;
    if (dice.geometry?.userData?.owned) {
      dice.geometry.dispose();
    }
    const materials = Array.isArray(dice.material) ? dice.material : dice.material ? [dice.material] : [];
    materials.forEach((mat: THREE.Material) => mat.dispose());
  }

  clear(): void {
    this.#rollToken++;
    this.#rolling = false;
    this.clearDice();
  }

  cancel(): void {
    if (!this.#rolling && this.#animState === 'idle') return;
    this.#rollToken++;
    this.#rolling = false;
    this.clearDice();
    this.bus.emit('roll:cancel', { id: this.#currentRollId || undefined });
  }

  getDiceResults(): any;
  getDiceResults(id: number): any;
  getDiceResults(id?: number): any {
    if (id !== undefined) {
      const die = this.diceList[id];
      return {
        type: die.shape,
        sides: parseInt(die.shape.substring(1)),
        id,
        ...die.result.at(-1),
      };
    }
    let counter = 0;
    const modifier = this.notationVectors?.constant
      ? parseInt(`${this.notationVectors.op}${this.notationVectors.constant}`)
      : 0;
    let rollTotal = modifier;
    return {
      id: this.#currentRollId,
      notation: this.notationVectors?.notation ?? '',
      sets: (this.notationVectors?.set ?? []).map((set: any) => {
        const endCount = counter + set.num - 1;
        let setTotal = 0;
        const rolls = [];
        for (let index = counter; index <= endCount; index++) {
          const die = this.diceList[counter];
          const lastValue = die?.result?.at(-1);
          if (!lastValue) {
            counter++;
            continue;
          }
          if (lastValue.reason === 'remove') {
            counter++;
            continue;
          }
          rolls.push({
            type: set.type,
            sides: parseInt(set.type.substring(1)),
            id: counter,
            ...lastValue,
          });
          setTotal += lastValue.value;
          counter++;
        }
        rollTotal += setTotal;
        return {
          num: set.num,
          type: set.type,
          sides: parseInt(set.type.substring(1)),
          rolls,
          total: setTotal,
        };
      }),
      modifier,
      total: rollTotal,
    };
  }

  async roll(notationString: string | string[]): Promise<any> {
    const notation = Array.isArray(notationString) ? notationString.join('+') : notationString;
    const token = ++this.#rollToken;
    return this.queue.enqueue(async () => {
      this.#assertActive(token);
      return this.#rollNow(notation, token);
    });
  }

  async #rollNow(notation: string, token: number): Promise<any> {
    this.#currentRollId = newId();
    this.bus.emit('roll:start', { id: this.#currentRollId, notation });
    this.notationVectors = this.startClickThrow(notation);
    if (!this.notationVectors) {
      throw new Error('Invalid notation');
    }
    await this.rollDice(token);
    const results = this.getDiceResults();
    this.bus.emit('roll:finish', results);
    return results;
  }

  async reroll(diceIdArray: number[]): Promise<any[]> {
    const token = ++this.#rollToken;
    return this.queue.enqueue(async () => {
      this.#assertActive(token);
      this.#rolling = true;
      const threadid = ++this.#threadId;
      this.#iteration = 0;

      diceIdArray.forEach((dieId) => {
        const dicemesh = this.diceList[dieId];
        if (!dicemesh) return;
        dicemesh.rerolls += 1;
        dicemesh.rerolling = true;
      });
      await this.#tossReroll(diceIdArray);
      this.#assertActive(token);

      await this.#animateThrow(threadid, token);
      return diceIdArray.map((dieId) => this.getDiceResults(dieId));
    });
  }

  async add(notationString: string): Promise<any[]> {
    const token = ++this.#rollToken;
    return this.queue.enqueue(async () => {
      this.#assertActive(token);
      const dieCount = this.diceList.length;
      if (!dieCount) {
        return this.#rollNow(notationString, token);
      }

      const addNotationVectors = this.startClickThrow(notationString);
      const diceIdArray: number[] = [];

      for (let i = 0, len = addNotationVectors.vectors.length; i < len; ++i) {
        this.#assertActive(token);
        await this.spawnDice(addNotationVectors.vectors[i]);
        diceIdArray.push(dieCount + i);
      }

      const payloads = this.#buildSpawnPayloads().filter((p) => diceIdArray.includes(p.index));
      await this.physics.spawnBatch(payloads);
      await this.#simulateThrow(token);

      await this.physics.spawnBatch(payloads);
      this.#resetMeshesToInitial(payloads);

      if (addNotationVectors.result && addNotationVectors.result.length > 0) {
        for (let i = 0; i < addNotationVectors.result.length; i++) {
          const index = dieCount + i;
          const dicemesh = this.diceList[index];
          if (!dicemesh) continue;
          if (dicemesh.getLastValue().value == addNotationVectors.result[i]) continue;
          this.swapDiceFace(dicemesh, addNotationVectors.result[i]);
        }
      }

      this.notationVectors = DiceNotation.mergeNotation(this.notationVectors, addNotationVectors);

      const threadid = ++this.#threadId;
      this.#rolling = true;
      await this.#animateThrow(threadid, token);
      return diceIdArray.map((dieId) => this.getDiceResults(dieId));
    });
  }

  async remove(diceIdArray: number[]): Promise<any[]> {
    const results = [];
    for (const dieId of diceIdArray) {
      const mesh = this.diceList[dieId];
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.storeRolledValue('remove');
      results.push(this.getDiceResults(dieId));
    }
    await this.physics.remove(diceIdArray);
    this.renderFrame();
    return results;
  }

  #resetMeshesToInitial(payloads: SpawnPayload[]): void {
    for (const payload of payloads) {
      const dicemesh = this.diceList[payload.index];
      if (!dicemesh) continue;
      dicemesh.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(
        new THREE.Vector3(payload.axis.x, payload.axis.y, payload.axis.z),
        payload.axis.a * Math.PI * 2
      );
      dicemesh.quaternion.copy(q);
      if (dicemesh.body) {
        dicemesh.body.quaternion.copy(q);
        dicemesh.body.sleepState = 0;
        dicemesh.body.type = 1;
      }
    }
  }

  async rollDice(token: number): Promise<void> {
    if (this.notationVectors.error) {
      return;
    }

    this.clearDice();

    for (let i = 0, len = this.notationVectors.vectors.length; i < len; ++i) {
      this.#assertActive(token);
      await this.spawnDice(this.notationVectors.vectors[i]);
    }

    const payloads = this.#buildSpawnPayloads();
    await this.physics.spawnBatch(payloads);
    await this.#simulateThrow(token);

    await this.physics.spawnBatch(payloads);
    this.#resetMeshesToInitial(payloads);

    if (this.notationVectors.result && this.notationVectors.result.length > 0) {
      for (let i = 0; i < this.notationVectors.result.length; i++) {
        const dicemesh = this.diceList[i];
        if (!dicemesh) continue;
        if (dicemesh.getLastValue().value == this.notationVectors.result[i]) continue;
        this.swapDiceFace(dicemesh, this.notationVectors.result[i]);
      }
    }

    this.#rolling = true;
    const threadid = ++this.#threadId;
    this.#iteration = 0;
    await this.#animateThrow(threadid, token);
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#rollToken++;
    this.#threadId++;
    this.#rolling = false;
    this.#animState = 'idle';

    if (this.resizeHandler) {
      this.resizeHandler.cancel?.();
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }
    this.selection.detach();

    let dice;
    while ((dice = this.diceList.pop())) {
      this.scene.remove(dice);
      this.#disposeMesh(dice);
    }

    this.physics?.destroy();

    this.postFX?.dispose();
    this.postFX = undefined;

    if (this.envOwned) {
      this.envTexture?.dispose();
    }
    this.scene.environment = null;
    disposeEnvironmentCache();

    this.deskGeometry?.dispose();
    (this.desk?.material as THREE.Material | undefined)?.dispose();
    this.light?.shadow?.map?.dispose();

    this.diceFactory.disposeCachedMaterials();
    this.sounds.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }

    this.bus.destroy();
    this.#initialized = false;
  }
}

export function createDiceBox(element: HTMLDivElement, options: DiceBoxOptions = {}): DiceBox {
  return new DiceBox(element, options);
}
