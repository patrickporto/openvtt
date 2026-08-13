import * as THREE from 'three';

import type { ShapeDescriptor } from '@openvtt/physics';

import { MATERIALTYPES } from '../constants/materialtypes';
import type { DiceShape } from '../constants/dice';
import { defaultRegistries, type DiceRegistries, type DiceModelRegistration } from '../registries';
import {
  createDiceMesh,
  createDiceMeshFromModel,
  type DiceColorData,
  type DiceMaterial,
  type DiceMesh,
  type DiceObject,
} from './dice-mesh';
import {
  createBasicDiceGeometry,
  createChamferedGeometry,
  createD10Geometry,
  createGeometryForShape,
  createProceduralGeometry,
  type ChamferResult,
  type DiceGeometryType,
  type GeometryCreationFunction,
} from './geometry';
import {
  attachPhysicsShape,
  createConvexShape,
  physicsShapeForGeometry,
  shapeToDescriptor,
} from './shapes';
import { DiceAssetLoaders } from './loaders';
import {
  TextureLRUCache,
  calculateTextureSize,
  createNoiseTexture,
  normalTextureFromHeight,
  paintFaceTextures,
  type FaceTextureSource,
  type MaterialCacheEntry,
} from './face-textures';
import { DicePresetRegistry, createDefaultPresetRegistry } from './preset-registry';

type MaterialType = keyof typeof MATERIALTYPES;

export interface DiceFactoryConfig {
  baseScale: number;
  bumpMapping: boolean;
  scale?: number;
  assetPath?: string;
  normalMaps?: boolean;
  dracoPath?: string;
  resolver?: (url: string) => string;
}

export interface DiceFactoryDeps {
  presets?: DicePresetRegistry;
  registries?: DiceRegistries;
  loaders?: DiceAssetLoaders;
}

interface ModelBounds {
  radius: number;
  halfExtents: [number, number, number];
  effectiveScale: number;
}

const DEFAULT_CONFIG: DiceFactoryConfig = {
  baseScale: 100,
  bumpMapping: true,
};

const MATERIAL_OPTIONS = {
  specular: 0xffffff,
  color: 0xb5b5b5,
  shininess: 5,
  flatShading: true,
};

const ROUGHNESS_MAP_FILES: Record<string, string> = {
  roughnessMap_fingerprint: 'finger.webp',
  roughnessMap_metal: 'metal.webp',
  roughnessMap_wood: 'wood.webp',
  roughnessMap_stone: 'stone.webp',
};

export class DiceFactory {
  #presets: DicePresetRegistry;
  #registries: DiceRegistries;
  #loaders: DiceAssetLoaders;

  #geometries = new Map<string, THREE.BufferGeometry>();
  #materialsCache = new TextureLRUCache();
  #normalsTextures = new Map<string, THREE.Texture>();
  #roughnessMapsCache = new Map<string, THREE.Texture>();
  #modelsCache = new Map<string, THREE.Group>();
  #modelBounds = new Map<string, ModelBounds>();

  #labelColor: string | string[] = '';
  #diceColor: string | string[] = '';
  #edgeColor: string | string[] = '';
  #labelOutline: string | string[] = '';
  #diceTexture: any = '';
  #diceMaterial: string | string[] = '';
  #diceFont = 'Arial';
  #diceLabels: Record<string, any[]> = {};
  #diceFontOffsetY = 0;
  #diceEmissive = false;
  #materialOverrides: DiceColorData['materialOptions'] = undefined;

  private baseScale: number;
  private bumpMapping: boolean;
  private normalMaps: boolean;
  private assetPath: string;
  private resolver: (url: string) => string;
  private colordata?: DiceColorData;
  private diceColorRand: any = '';
  private labelColorRand = '';
  private labelOutlineRand = '';
  private diceTextureRand: any = '';
  private diceMaterialRand = '';
  private edgeColorRand = '';

  constructor(options: Partial<DiceFactoryConfig> = {}, deps: DiceFactoryDeps = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };
    this.baseScale = config.baseScale;
    this.bumpMapping = config.bumpMapping;
    this.normalMaps = config.normalMaps ?? false;
    this.assetPath = config.assetPath ?? './';
    this.resolver = config.resolver ?? ((url) => url);

    this.#presets = deps.presets ?? createDefaultPresetRegistry();
    this.#registries = deps.registries ?? defaultRegistries;
    this.#loaders = deps.loaders ?? new DiceAssetLoaders({
      assetPath: this.assetPath,
      resolver: this.resolver,
      dracoPath: config.dracoPath,
    });
  }

  get(type: string): DiceObject | undefined {
    return this.#presets.get(type);
  }

  ensure(type: string): DiceObject {
    return this.#presets.getOrCreate(type);
  }

  getGeometry(type: string): THREE.BufferGeometry | undefined {
    return this.#geometries.get(type);
  }

  async loadModel(diceobj: DiceObject): Promise<THREE.Group | null> {
    if (!diceobj.modelFile) return null;
    return this.#loaders.loadModel(diceobj.modelFile);
  }

  createNoiseTexture(size = 512, intensity = 0.5): THREE.CanvasTexture {
    return createNoiseTexture(size, intensity);
  }

  calculateTextureSize(approx: number): number {
    return calculateTextureSize(approx);
  }

  disposeCachedMaterials(): void {
    this.#materialsCache.clear(true);

    this.#roughnessMapsCache.forEach((texture) => texture.dispose());
    this.#roughnessMapsCache.clear();

    this.#normalsTextures.forEach((texture) => texture.dispose());
    this.#normalsTextures.clear();

    this.#geometries.forEach((geom) => geom.dispose());
    this.#geometries.clear();

    this.#loaders.dispose();
  }

  disposeMaterialCaches(): void {
    this.#materialsCache.clear(true);
  }

  updateConfig(options: Partial<DiceFactoryConfig> = {}): void {
    if (options.baseScale !== undefined) this.baseScale = options.baseScale;
    if (options.bumpMapping !== undefined) this.bumpMapping = options.bumpMapping;
    if (options.normalMaps !== undefined) this.normalMaps = options.normalMaps;
    if (options.assetPath !== undefined) this.assetPath = options.assetPath;
    if (options.resolver !== undefined) this.resolver = options.resolver;
  }

  setBumpMapping(bumpMapping: boolean): void {
    this.bumpMapping = bumpMapping;
    this.disposeMaterialCaches();
  }

  async create(type: string): Promise<DiceMesh | null> {
    const diceobj = this.ensure(type);

    const modelReg = this.#registries.getDiceModel(type);
    if (modelReg) {
      const dicemesh = await this.#createFromModel(type, diceobj, modelReg);
      if (dicemesh) return dicemesh;
    }

    return this.#createProcedural(type, diceobj);
  }

  #geometryFor(type: string, diceobj: DiceObject): DiceGeometryType | null {
    const cached = this.#geometries.get(type) as DiceGeometryType | undefined;
    if (cached) return cached;
    const created = this.createGeometry(type as DiceShape, diceobj.scale * this.baseScale);
    if (created instanceof THREE.BufferGeometry) {
      this.#geometries.set(type, created);
      return created;
    }
    return null;
  }

  async #createFromModel(type: string, diceobj: DiceObject, modelReg: DiceModelRegistration): Promise<DiceMesh | null> {
    let model = this.#modelsCache.get(type);
    if (!model) {
      model = await this.#loaders.loadModel(modelReg.url);
      if (!model) return null;
      this.#modelsCache.set(type, model);

      const box = new THREE.Box3().setFromObject(model);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const size = new THREE.Vector3();
      box.getSize(size);
      this.#modelBounds.set(type, {
        radius: sphere.radius,
        halfExtents: [size.x / 2, size.y / 2, size.z / 2],
        effectiveScale: 1,
      });
    }

    const valueGeometry = this.#geometryFor(type, diceobj);

    const bounds = this.#modelBounds.get(type);
    if (!bounds) return null;
    if (valueGeometry && !valueGeometry.boundingSphere) valueGeometry.computeBoundingSphere();
    const targetRadius = valueGeometry?.boundingSphere?.radius ?? 0;
    const normalize = bounds.radius > 0 && targetRadius > 0 ? targetRadius / bounds.radius : this.baseScale / 100;
    bounds.effectiveScale = normalize * (modelReg.scale ?? 1);

    const mesh = model.clone();
    mesh.scale.set(bounds.effectiveScale, bounds.effectiveScale, bounds.effectiveScale);

    const dicemesh = createDiceMeshFromModel(mesh, diceobj, type);

    if (valueGeometry) {
      dicemesh.valueGeometry = valueGeometry;
    }

    return dicemesh;
  }

  async #createProcedural(type: string, diceobj: DiceObject): Promise<DiceMesh | null> {
    const geom = this.#geometryFor(type, diceobj);
    if (!geom) return null;

    this.setMaterialInfo();

    const materials = await this.createMaterials(diceobj, this.baseScale / 2, 1.0);
    if (!materials || materials.length === 0) return null;

    const mesh = new THREE.Mesh(geom, materials);
    const dicemesh = createDiceMesh(mesh, diceobj, type);

    if (diceobj.color && Array.isArray(dicemesh.material)) {
      const material = dicemesh.material[0] as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
      material.color = new THREE.Color(diceobj.color);
      material.emissive = new THREE.Color(diceobj.color);
      material.emissiveIntensity = 1;
      material.needsUpdate = true;
    }

    return this.#fixMaterials(dicemesh, diceobj.values.length);
  }

  getShapeDescriptor(type: string): ShapeDescriptor | null {
    const diceobj = this.#presets.get(type);
    if (!diceobj) return null;

    const modelReg = this.#registries.getDiceModel(type);
    const bounds = this.#modelBounds.get(type);
    const physicsShape = modelReg?.physicsShape ?? 'auto';

    if (bounds && physicsShape === 'sphere') {
      return { kind: 'sphere', radius: bounds.radius * bounds.effectiveScale };
    }
    if (bounds && physicsShape === 'box') {
      const s = bounds.effectiveScale;
      return {
        kind: 'box',
        halfExtents: [bounds.halfExtents[0] * s, bounds.halfExtents[1] * s, bounds.halfExtents[2] * s],
      };
    }

    const geom = this.#geometryFor(type, diceobj);
    const shape = geom?.cannon_shape;
    if (!shape) return null;

    return shapeToDescriptor(shape);
  }

  async createWithColorSet(type: string, colordata: DiceColorData): Promise<DiceMesh | null> {
    const diceobj = this.ensure(type);

    const geom = this.#geometryFor(type, diceobj);
    if (!geom) return null;

    const originalColorData = this.colordata;
    const originalLabelColor = this.#labelColor;
    const originalDiceColor = this.#diceColor;
    const originalLabelOutline = this.#labelOutline;
    const originalDiceTexture = this.#diceTexture;
    const originalDiceMaterial = this.#diceMaterial;
    const originalEdgeColor = this.#edgeColor;
    const originalDiceFont = this.#diceFont;
    const originalDiceLabels = this.#diceLabels;
    const originalFontOffsetY = this.#diceFontOffsetY;
    const originalEmissive = this.#diceEmissive;
    const originalMaterialOverrides = this.#materialOverrides;

    this.colordata = colordata;
    this.#labelColor = colordata.foreground;
    this.#diceColor = colordata.background;
    this.#labelOutline = colordata.outline;
    this.#diceTexture = colordata.texture;
    this.#diceMaterial = colordata.texture?.material || 'none';
    this.#edgeColor = colordata.edge || colordata.background;
    if (colordata.font) {
      this.#diceFont = colordata.font;
    }
    if (colordata.labels) {
      this.#diceLabels = colordata.labels;
    }
    if (colordata.fontOffsetY !== undefined) {
      this.#diceFontOffsetY = colordata.fontOffsetY;
    }
    this.#diceEmissive = colordata.emissive ?? false;
    this.#materialOverrides = colordata.materialOptions;
    this.setMaterialInfo();

    const materials = await this.createMaterials(diceobj, this.baseScale / 2, 1.0);

    this.colordata = originalColorData;
    this.#labelColor = originalLabelColor;
    this.#diceColor = originalDiceColor;
    this.#labelOutline = originalLabelOutline;
    this.#diceTexture = originalDiceTexture;
    this.#diceMaterial = originalDiceMaterial;
    this.#edgeColor = originalEdgeColor;
    this.#diceFont = originalDiceFont;
    this.#diceLabels = originalDiceLabels;
    this.#diceFontOffsetY = originalFontOffsetY;
    this.#diceEmissive = originalEmissive;
    this.#materialOverrides = originalMaterialOverrides;
    this.setMaterialInfo();

    if (!materials || materials.length === 0) return null;

    const mesh = new THREE.Mesh(geom, materials);
    const dicemesh = createDiceMesh(mesh, diceobj, type);

    if (diceobj.color && Array.isArray(dicemesh.material)) {
      const material = dicemesh.material[0] as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
      material.color = new THREE.Color(diceobj.color);
      material.emissive = new THREE.Color(diceobj.color);
      material.emissiveIntensity = 1;
      material.needsUpdate = true;
    }

    return this.#fixMaterials(dicemesh, diceobj.values.length);
  }

  createGeometry(
    type: DiceShape,
    radius: number,
    geometryFunction: GeometryCreationFunction = this.createDiceGeometry.bind(this)
  ): DiceGeometryType | null {
    const geom = createGeometryForShape(type, radius, geometryFunction);
    if (geom && !geom.cannon_shape) {
      const shape = physicsShapeForGeometry(type, radius);
      if (shape) attachPhysicsShape(geom, shape);
    }
    return geom;
  }

  createDiceGeometry(
    vertices: number[][],
    faces: number[][],
    radius: number,
    tab: number,
    af: number,
    chamfer: number
  ): DiceGeometryType {
    const geom = createProceduralGeometry(vertices, faces, radius, tab, af, chamfer);
    attachPhysicsShape(geom, createConvexShape(vertices, faces, radius));
    return geom;
  }

  createPhysicsShape(vertices: number[][], faces: number[][], radius: number) {
    return createConvexShape(vertices, faces, radius);
  }

  createBasicDiceGeometry(
    vectors: THREE.Vector3[],
    faces: number[][],
    radius: number,
    tab: number,
    af: number
  ): THREE.BufferGeometry {
    return createBasicDiceGeometry(vectors, faces, radius, tab, af);
  }

  createD10Geometry(
    vectors: THREE.Vector3[],
    faces: number[][],
    radius: number,
    tab: number,
    af: number
  ): THREE.BufferGeometry {
    return createD10Geometry(vectors, faces, radius, tab, af);
  }

  createChamferedGeometry(vectors: THREE.Vector3[], faces: number[][], chamfer: number): ChamferResult {
    return createChamferedGeometry(vectors, faces, chamfer);
  }

  #fixMaterials(mesh: DiceMesh, uniqueSides: number): DiceMesh {
    if (Array.isArray(mesh.material) && uniqueSides <= 3) {
      const materials = [...mesh.material];
      const baseIndex = materials.length - uniqueSides;
      for (let i = 0; i < baseIndex; i++) {
        materials[i] = materials[baseIndex];
      }
      mesh.material = materials;
    }
    return mesh;
  }

  async createMaterials(
    diceobj: DiceObject,
    size: number,
    margin: number,
    allowcache = true,
    d4specialindex = 0
  ): Promise<DiceMaterial[]> {
    const materials: DiceMaterial[] = [];
    let labels = diceobj.labels;

    if (diceobj.shape == 'd4') {
      labels = diceobj.labels[d4specialindex];
      size = this.baseScale / 2;
      margin = this.baseScale * 2;
    }

    if (this.#diceLabels[diceobj.type as string]) {
      labels = this.#getProcessedLabels(diceobj.type as string, this.#diceLabels[diceobj.type as string]);
      if (diceobj.shape == 'd4') {
        labels = labels[d4specialindex];
      }
    }

    let roughnessTexture: THREE.Texture | null = null;
    const materialType = this.diceMaterialRand as MaterialType;
    let materialConfig = MATERIALTYPES[materialType];

    if (!materialConfig && this.diceMaterialRand !== 'none') {
      materialConfig = MATERIALTYPES['plastic'] || MATERIALTYPES['none'];
    }

    if (this.bumpMapping && materialConfig?.roughnessMap) {
      const mapName = materialConfig.roughnessMap;

      if (this.#roughnessMapsCache.has(mapName)) {
        roughnessTexture = this.#roughnessMapsCache.get(mapName)!;
      } else {
        const fileName = ROUGHNESS_MAP_FILES[mapName] ?? '';

        if (fileName) {
          roughnessTexture = await this.#loaders.loadTexture(`roughness-map/${fileName}`);
          if (roughnessTexture) {
            this.#roughnessMapsCache.set(mapName, roughnessTexture);
          }
        }

        if (!roughnessTexture) {
          roughnessTexture = createNoiseTexture(512, 0.7);
          this.#roughnessMapsCache.set(mapName, roughnessTexture);
        }
      }
    }

    for (let i = 0; i < labels.length; ++i) {
      let mat: DiceMaterial;

      if (this.diceMaterialRand && this.diceMaterialRand !== 'none') {
        const config = MATERIALTYPES[this.diceMaterialRand as MaterialType];

        if (config && config.type === 'physical') {
          const physMat = new THREE.MeshPhysicalMaterial(MATERIAL_OPTIONS);
          if (config.clearcoat) physMat.clearcoat = config.clearcoat;
          if (config.clearcoatRoughness) physMat.clearcoatRoughness = config.clearcoatRoughness;
          if (config.iridescence) physMat.iridescence = config.iridescence;
          if (config.iridescenceIOR) physMat.iridescenceIOR = config.iridescenceIOR;
          if (config.iridescenceThicknessRange) physMat.iridescenceThicknessRange = config.iridescenceThicknessRange;
          if (config.transmission) physMat.transmission = config.transmission;
          if (config.thickness) physMat.thickness = config.thickness;
          if (config.roughness !== undefined) physMat.roughness = config.roughness;
          if (config.metalness !== undefined) physMat.metalness = config.metalness;
          mat = physMat;
        } else if (config && config.type === 'standard') {
          const stdMat = new THREE.MeshStandardMaterial(MATERIAL_OPTIONS);
          if (config.roughness !== undefined) stdMat.roughness = config.roughness;
          if (config.metalness !== undefined) stdMat.metalness = config.metalness;
          mat = stdMat;
        } else if (config) {
          mat = new THREE.MeshPhongMaterial(MATERIAL_OPTIONS);
        } else {
          mat = new THREE.MeshStandardMaterial(MATERIAL_OPTIONS);
        }

        if (config && config.envMapIntensity !== undefined && 'envMapIntensity' in mat) mat.envMapIntensity = config.envMapIntensity;

        if (this.bumpMapping && roughnessTexture && config?.roughnessMap && mat instanceof THREE.MeshStandardMaterial) {
          mat.roughnessMap = roughnessTexture;
          mat.roughness = 1.0;
        }
      } else {
        mat = new THREE.MeshPhongMaterial(MATERIAL_OPTIONS);
      }

      if (this.#materialOverrides) {
        if (this.#materialOverrides.color !== undefined) {
          mat.color.set(this.#materialOverrides.color);
        }
        if (this.#materialOverrides.roughness !== undefined && 'roughness' in mat) {
          (mat as THREE.MeshStandardMaterial).roughness = this.#materialOverrides.roughness;
        }
        if (this.#materialOverrides.metalness !== undefined && 'metalness' in mat) {
          (mat as THREE.MeshStandardMaterial).metalness = this.#materialOverrides.metalness;
        }
        if (this.#materialOverrides.envMapIntensity !== undefined && 'envMapIntensity' in mat) {
          mat.envMapIntensity = this.#materialOverrides.envMapIntensity;
        }
      }

      let canvasTextures: MaterialCacheEntry | null;
      if (i == 0) {
        let texture = { name: 'none' } as FaceTextureSource;
        if (this.diceTextureRand?.composite != 'source-over') {
          texture = this.diceTextureRand;
        }

        canvasTextures = await this.createTextMaterial(
          diceobj,
          labels,
          i,
          size,
          margin,
          texture,
          this.labelColorRand,
          this.labelOutlineRand,
          this.edgeColorRand,
          allowcache
        );
        if (canvasTextures?.composite) {
          mat.map = canvasTextures.composite;
        }
      } else {
        canvasTextures = await this.createTextMaterial(
          diceobj,
          labels,
          i,
          size,
          margin,
          this.diceTextureRand,
          this.labelColorRand,
          this.labelOutlineRand,
          this.diceColorRand,
          allowcache
        );
        if (canvasTextures?.composite) {
          mat.map = canvasTextures.composite;
        }

        if (this.bumpMapping) {
          let scale = 0.75;
          if (size > 35) scale = 1;
          if (size > 40) scale = 2.5;
          if (size > 45) scale = 4;

          const normalsImage = diceobj.shape != 'd4' ? diceobj.normals?.[i] : null;
          if (normalsImage) {
            const normalsKey = `${diceobj.type}:${i}`;
            let normalsTexture = this.#normalsTextures.get(normalsKey);
            if (!normalsTexture) {
              normalsTexture = new THREE.Texture(normalsImage as TexImageSource);
              normalsTexture.needsUpdate = true;
              this.#normalsTextures.set(normalsKey, normalsTexture);
            }
            mat.bumpMap = normalsTexture;
            mat.bumpScale = 4;
          } else if (this.normalMaps && canvasTextures?.bump) {
            if (!canvasTextures.normal) {
              canvasTextures.normal = normalTextureFromHeight(canvasTextures.bump.image as HTMLCanvasElement, 2);
            }
            mat.normalMap = canvasTextures.normal;
            mat.normalScale = new THREE.Vector2(scale, scale);
          } else if (canvasTextures?.bump) {
            mat.bumpMap = canvasTextures.bump;
            mat.bumpScale = scale;
          }
        }
        if (canvasTextures?.emissive) {
          mat.emissiveMap = canvasTextures.emissive;
          mat.emissive = new THREE.Color(0xffffff);
          mat.emissiveIntensity = 1;
        }
      }
      mat.opacity = 1;
      mat.transparent = false;
      mat.depthTest = true;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = 1;
      mat.polygonOffsetUnits = 1;

      mat.needsUpdate = true;
      materials.push(mat);
    }

    return materials;
  }

  async createTextMaterial(
    diceobj: DiceObject,
    labels: any[],
    index: number,
    size: number,
    margin: number,
    texture: FaceTextureSource,
    forecolor: string,
    outlinecolor: string,
    backcolor: string,
    allowcache: boolean
  ): Promise<MaterialCacheEntry | null> {
    if (labels[index] === undefined) return null;

    texture = texture || this.diceTextureRand;
    forecolor = forecolor || this.labelColorRand;
    outlinecolor = outlinecolor || this.labelOutlineRand;
    backcolor = backcolor || this.diceColorRand;
    allowcache = allowcache == undefined ? true : allowcache;

    const text = labels[index];
    let textCache = '';
    if (text instanceof HTMLImageElement) {
      textCache = text.src;
    } else if (text instanceof Array) {
      textCache = text.map((el) => (el instanceof HTMLImageElement ? el.src : String(el))).join('|');
    } else {
      textCache = String(text);
    }

    const emissiveEnabled = this.#diceEmissive;
    const materialOptionsKey = this.#materialOverrides
      ? JSON.stringify(this.#materialOverrides)
      : '';

    let cachestring = [
      diceobj.type,
      textCache,
      index,
      texture.name,
      forecolor,
      outlinecolor,
      backcolor,
      this.#diceFont,
      this.#diceFontOffsetY,
      this.diceMaterialRand,
      materialOptionsKey,
      emissiveEnabled ? 'e' : '',
      this.normalMaps ? 'n' : '',
    ].join(';');
    if (diceobj.shape == 'd4') {
      cachestring = [
        diceobj.type,
        textCache,
        texture.name,
        forecolor,
        outlinecolor,
        backcolor,
        this.#diceFont,
        this.#diceFontOffsetY,
        this.diceMaterialRand,
        materialOptionsKey,
        emissiveEnabled ? 'e' : '',
        this.normalMaps ? 'n' : '',
      ].join(';');
    }
    if (allowcache) {
      const cached = this.#materialsCache.get(cachestring);
      if (cached != null) return cached;
    }

    const entry = paintFaceTextures({
      shape: diceobj.shape as DiceShape,
      labels,
      index,
      size,
      margin,
      texture,
      forecolor,
      outlinecolor,
      backcolor,
      font: this.#diceFont || diceobj.font || 'Arial',
      fontOffsetY: this.#diceFontOffsetY || 0,
      emissive: emissiveEnabled,
    });

    if (!entry) return null;

    if (allowcache) {
      this.#materialsCache.set(cachestring, entry);
    }

    return entry;
  }

  applyColorSet(colordata: DiceColorData): void {
    this.disposeMaterialCaches();

    this.#diceFont = 'Arial';
    this.#diceLabels = {};

    this.colordata = colordata;
    this.#labelColor = colordata.foreground;
    this.#diceColor = colordata.background;
    this.#labelOutline = colordata.outline;
    this.#diceTexture = colordata.texture;
    this.#diceMaterial = colordata.texture?.material || 'none';
    this.#edgeColor = colordata.edge || colordata.background;
    if (colordata.font) {
      this.#diceFont = colordata.font;
    }
    if (colordata.labels) {
      this.#diceLabels = colordata.labels;
    }
    if (colordata.fontOffsetY !== undefined) {
      this.#diceFontOffsetY = colordata.fontOffsetY;
    }
    this.#diceEmissive = colordata.emissive ?? false;
    this.#materialOverrides = colordata.materialOptions;
  }

  setRandomColors(): void {
    if (Array.isArray(this.#diceColor)) {
      const colorindex = Math.floor(Math.random() * this.#diceColor.length);

      if (
        Array.isArray(this.#labelColor) &&
        this.#labelColor.length == this.#diceColor.length
      ) {
        this.labelColorRand = this.#labelColor[colorindex];

        if (
          Array.isArray(this.#labelOutline) &&
          this.#labelOutline.length == this.#labelColor.length
        ) {
          this.labelOutlineRand = this.#labelOutline[colorindex];
        }
      }
      if (
        Array.isArray(this.#diceTexture) &&
        this.#diceTexture.length == this.#diceColor.length
      ) {
        this.diceTextureRand = this.#diceTexture[colorindex];
        this.diceMaterialRand = this.diceTextureRand.material;
      }

      if (
        Array.isArray(this.#edgeColor) &&
        this.#edgeColor.length == this.#diceColor.length
      ) {
        this.edgeColorRand = this.#edgeColor[colorindex];
      }

      this.diceColorRand = this.#diceColor[colorindex];
    } else {
      this.diceColorRand = this.#diceColor;
    }

    if (this.edgeColorRand === '') {
      if (Array.isArray(this.#edgeColor)) {
        const colorindex = Math.floor(Math.random() * this.#edgeColor.length);
        this.edgeColorRand = this.#edgeColor[colorindex];
      } else {
        this.edgeColorRand = this.#edgeColor as string;
      }
    }

    if (this.labelColorRand === '' && Array.isArray(this.#labelColor)) {
      const colorindex = Math.floor(Math.random() * this.#labelColor.length);

      if (
        Array.isArray(this.#labelOutline) &&
        this.#labelOutline.length == this.#labelColor.length
      ) {
        this.labelOutlineRand = this.#labelOutline[colorindex];
      }

      this.labelColorRand = this.#labelColor[colorindex];
    } else if (this.labelColorRand === '') {
      this.labelColorRand = this.#labelColor as string;
    }

    if (this.labelOutlineRand === '' && Array.isArray(this.#labelOutline)) {
      const colorindex = Math.floor(Math.random() * this.#labelOutline.length);
      this.labelOutlineRand = this.#labelOutline[colorindex];
    } else if (this.labelOutlineRand === '') {
      this.labelOutlineRand = this.#labelOutline as string;
    }

    if (this.diceTextureRand === '' && Array.isArray(this.#diceTexture)) {
      this.diceTextureRand =
        this.#diceTexture[
        Math.floor(Math.random() * this.#diceTexture.length)
        ];
      this.diceMaterialRand =
        this.diceTextureRand.material || this.#diceMaterial;
    } else if (this.diceTextureRand === '') {
      this.diceTextureRand = this.#diceTexture;
      this.diceMaterialRand =
        this.diceTextureRand.material || this.#diceMaterial;
    }

    if (this.diceMaterialRand === '' && Array.isArray(this.#diceMaterial)) {
      this.diceMaterialRand =
        this.#diceMaterial[
        Math.floor(Math.random() * this.#diceMaterial.length)
        ];
    } else if (this.diceMaterialRand === '') {
      this.diceMaterialRand = this.#diceMaterial as string;
    }
  }

  setMaterialInfo(): void {
    const prevcolordata = this.colordata;

    this.diceColorRand = '';
    this.labelColorRand = '';
    this.labelOutlineRand = '';
    this.diceTextureRand = '';
    this.diceMaterialRand = '';
    this.edgeColorRand = '';

    this.setRandomColors();

    if (this.colordata?.id && prevcolordata?.id && this.colordata.id !== prevcolordata.id) {
      this.applyColorSet(prevcolordata);
    }
  }

  #getProcessedLabels(type: string, faces: any[]): any[] {
    const diceobj = this.#presets.get(type);
    if (!diceobj) return faces;

    if (diceobj.shape === 'd4') {
      const [a, b, c, d] = faces;
      return [
        [[], [0, 0, 0], [b, d, c], [a, c, d], [b, a, d], [a, b, c]],
        [[], [0, 0, 0], [b, c, d], [c, a, d], [b, d, a], [c, b, a]],
        [[], [0, 0, 0], [d, c, b], [c, d, a], [d, b, a], [c, a, b]],
        [[], [0, 0, 0], [d, b, c], [a, d, c], [d, a, b], [a, c, b]],
      ];
    }

    const targetArray = ['', ''];
    if (['d2', 'd10'].includes(diceobj.shape)) {
      targetArray.pop();
    }
    return [...targetArray, ...faces];
  }
}
