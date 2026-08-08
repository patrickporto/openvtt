'use strict';
import { DicePreset } from './preset';
import { MATERIALTYPES } from '../constants/materialtypes';
import { DICE_GEOM } from '../constants/dice';
import type { DiceShape } from '../constants/dice';

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createCanvas } from './platform';
import { heightCanvasToNormalCanvas, resolveAssetPath } from '@openvtt/render3d';
import type { ShapeDescriptor } from '@openvtt/physics';
import { getDiceModel } from '../registries';


type MaterialType = keyof typeof MATERIALTYPES;

interface DiceFactoryConfig {
  baseScale: number;
  bumpMapping: boolean;
  scale?: number;
  assetPath?: string;
  normalMaps?: boolean;
  dracoPath?: string;
}

interface RotateConfig {
  [key: string]: { even?: number; odd?: number; all?: number };
}

interface DiceColorData {
  id?: string;
  foreground: string;
  background: string;
  outline: string;
  texture: any;
  edge?: string;
  font?: string;
  fontOffsetY?: number;
  labels?: Record<string, any[]>;
  emissive?: boolean;
  materialOptions?: {
    color?: number;
    roughness?: number;
    metalness?: number;
    envMapIntensity?: number;
  };
}

interface DiceObject {
  shape: string;
  scale: number;
  mass: number;
  inertia: number;
  values: number[];
  labels: any[];
  color?: string;
  font?: string;
  normals?: any[];
  type?: string;
  modelFile?: string; // Path to external GLTF/GLB model
}

interface GeometryGroup {
  materialIndex: number;
  start: number;
  count: number;
}

type DiceGeometryType = THREE.BufferGeometry & {
  cannon_shape?: CANNON.Cylinder | CANNON.ConvexPolyhedron;
  faceNormals?: Float32Array;
};

interface DiceValues {
  value: number;
  label: string;
  reason: string;
}

interface DiceResult extends DiceValues {
  ignore?: boolean;
}

interface DiceMesh extends THREE.Mesh {
  result: DiceResult[];
  shape: DiceShape;
  rerolls: number;
  resultReason: string;
  mass: number;
  notation?: { type: string };
  valueGeometry?: DiceGeometryType;
  body?: any;
  geometry: THREE.BufferGeometry & { groups: GeometryGroup[] };
  getFaceValue?: () => DiceValues;
  storeRolledValue?: (reason?: string) => void;
  getLastValue?: () => DiceResult;
  ignoreLastValue?: (ignore: boolean) => void;
  setLastValue?: (result: DiceResult) => void;
}

interface ChamferResult {
  vectors: THREE.Vector3[];
  faces: number[][];
}

const DEFAULT_CONFIG: DiceFactoryConfig = {
  baseScale: 100,
  bumpMapping: true,
};

interface MaterialCacheEntry {
  composite: THREE.Texture;
  bump: THREE.Texture | null;
  emissive: THREE.Texture | null;
  normal?: THREE.Texture | null;
}

const MATERIALS_CACHE_LIMIT = 512;

class TextureLRUCache {
  #map = new Map<string, MaterialCacheEntry>();
  #limit: number;

  constructor(limit = MATERIALS_CACHE_LIMIT) {
    this.#limit = limit;
  }

  get(key: string): MaterialCacheEntry | undefined {
    const entry = this.#map.get(key);
    if (entry) {
      this.#map.delete(key);
      this.#map.set(key, entry);
    }
    return entry;
  }

  set(key: string, entry: MaterialCacheEntry): void {
    this.#map.delete(key);
    this.#map.set(key, entry);
    while (this.#map.size > this.#limit) {
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#disposeEntry(this.#map.get(oldest)!);
      this.#map.delete(oldest);
    }
  }

  #disposeEntry(entry: MaterialCacheEntry): void {
    entry.composite.dispose();
    entry.bump?.dispose();
    entry.emissive?.dispose();
    entry.normal?.dispose();
  }

  clear(dispose = false): void {
    if (dispose) {
      this.#map.forEach((entry) => this.#disposeEntry(entry));
    }
    this.#map.clear();
  }

  get size(): number {
    return this.#map.size;
  }
}

function disposeGeometry(geom: THREE.BufferGeometry): void {
  geom.dispose();
}

const _scratchFaceNormal = new THREE.Vector3();
const _scratchUpVector = new THREE.Vector3();

function computeFaceNormals(geom: DiceGeometryType): Float32Array {
  if (geom.faceNormals) return geom.faceNormals;
  const normals = geom.getAttribute('normal')?.array;
  const groups = geom.groups ?? [];
  const index = geom.index;
  const out = new Float32Array(groups.length * 3);
  if (normals) {
    for (let i = 0; i < groups.length; i++) {
      const start = groups[i].start ?? i * 3;
      const vertexIndex = index ? index.getX(start) : start;
      out[i * 3] = normals[vertexIndex * 3];
      out[i * 3 + 1] = normals[vertexIndex * 3 + 1];
      out[i * 3 + 2] = normals[vertexIndex * 3 + 2];
    }
  }
  geom.faceNormals = out;
  return out;
}

const MATERIAL_OPTIONS = {
  specular: 0xffffff,
  color: 0xb5b5b5,
  shininess: 5,
  flatShading: true,
};

type GeometryCreationFunction = (
  vertices: number[][],
  faces: number[][],
  radius: number,
  tab: number,
  af: number,
  chamfer: number
) => DiceGeometryType | CANNON.ConvexPolyhedron;

export class DiceFactory {
  static #dice = new Map<string, DiceObject>();

  #geometries = new Map<string, THREE.BufferGeometry>();
  #materials_cache = new TextureLRUCache();
  #normals_textures = new Map<string, THREE.Texture>();
  #label_color = '';
  #dice_color = '';
  #edge_color = '';
  #label_outline = '';
  #dice_texture: any = '';
  #dice_material = '';
  #dice_font = 'Arial';
  #dice_labels: Record<string, any[]> = {};
  #dice_font_offset_y = 0;
  #dice_emissive = false;
  #material_overrides: DiceColorData['materialOptions'] = undefined;

  private baseScale: number;
  private bumpMapping: boolean;
  private normalMaps: boolean;
  private assetPath: string;
  private colordata?: DiceColorData;
  private dice_color_rand = '';
  private label_color_rand = '';
  private label_outline_rand = '';
  private dice_texture_rand: any = '';
  private dice_material_rand = '';
  private edge_color_rand = '';

  private loaderGLTF = new GLTFLoader();
  private loaderDRACO?: DRACOLoader;
  private loaderTexture = new THREE.TextureLoader();
  #roughness_maps_cache = new Map<string, THREE.Texture>();

  constructor(options: Partial<DiceFactoryConfig> = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };
    this.baseScale = config.baseScale;
    this.bumpMapping = config.bumpMapping;
    this.normalMaps = config.normalMaps ?? false;
    this.assetPath = config.assetPath ?? './';
    if (config.dracoPath) {
      this.loaderDRACO = new DRACOLoader();
      this.loaderDRACO.setDecoderPath(resolveAssetPath(this.assetPath, config.dracoPath));
      this.loaderGLTF.setDRACOLoader(this.loaderDRACO);
    }
  }

  async loadModel(diceobj: DiceObject): Promise<THREE.Group | null> {
    if (!diceobj.modelFile) return null;

    const url = resolveAssetPath(this.assetPath, diceobj.modelFile);
    return new Promise((resolve, reject) => {
      this.loaderGLTF.load(url, (gltf) => {
        const model = gltf.scene;

        // Normalize scale if needed, or rely on baseScale application later
        // model.scale.set(diceobj.scale, diceobj.scale, diceobj.scale);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // Ensure geometry is centered if needed
            mesh.geometry.center();
          }
        });
        resolve(model);
      }, undefined, (error) => {
        console.error(`Failed to load model for ${diceobj.type}:`, error);
        resolve(null); // Resolve null to fallback to generated geometry
      });
    });
  }

  // Generate a procedural noise texture for roughness maps
  createNoiseTexture(size = 512, intensity = 0.5): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);

    context.fillStyle = '#000';
    context.fillRect(0, 0, size, size);

    const imageData = context.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const val = Math.floor(Math.random() * 255 * intensity + (255 * (1 - intensity)));
      data[i] = val;     // r
      data[i + 1] = val; // g
      data[i + 2] = val; // b
      data[i + 3] = 255; // alpha
    }
    context.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  disposeCachedMaterials(): void {
    this.#materials_cache.clear(true);

    this.#roughness_maps_cache.forEach((texture) => texture.dispose());
    this.#roughness_maps_cache.clear();

    this.#normals_textures.forEach((texture) => texture.dispose());
    this.#normals_textures.clear();

    this.#geometries.forEach((geom) => disposeGeometry(geom));
    this.#geometries.clear();

    this.loaderDRACO?.dispose();
  }

  disposeMaterialCaches(): void {
    this.#materials_cache.clear(true);
  }

  updateConfig(options: Partial<DiceFactoryConfig> = {}) {
    if (options.scale) {
      this.#scaleGeometry();
    }
    Object.assign(this, options);
  }

  setBumpMapping(bumpMapping: boolean): void {
    this.bumpMapping = bumpMapping;
    this.disposeMaterialCaches();
  }

  #models_cache = new Map<string, THREE.Group>();
  #model_bounds = new Map<string, { radius: number; halfExtents: [number, number, number]; effectiveScale: number }>();

  async create(type: string): Promise<DiceMesh | null> {
    const diceobj = this.get(type);
    if (!diceobj) return null;

    const modelReg = getDiceModel(type);
    if (modelReg) {
      const dicemesh = await this.#createFromModel(type, diceobj, modelReg);
      if (dicemesh) return dicemesh;
    }

    return this.#createProcedural(type, diceobj);
  }

  async #createFromModel(type: string, diceobj: DiceObject, modelReg: { url: string; scale?: number; physicsShape?: any }): Promise<DiceMesh | null> {
    let model = this.#models_cache.get(type);
    if (!model) {
      model = await this.loadModel({ ...diceobj, modelFile: modelReg.url });
      if (!model) return null;
      this.#models_cache.set(type, model);

      const box = new THREE.Box3().setFromObject(model);
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const size = new THREE.Vector3();
      box.getSize(size);
      this.#model_bounds.set(type, {
        radius: sphere.radius,
        halfExtents: [size.x / 2, size.y / 2, size.z / 2],
        effectiveScale: 1,
      });
    }

    let valueGeometry = this.#geometries.get(type) ?? this.createGeometry(
      type as DiceShape,
      diceobj.scale * this.baseScale,
      this.createDiceGeometry.bind(this)
    );
    if (valueGeometry instanceof THREE.BufferGeometry) {
      this.#geometries.set(type, valueGeometry);
    }

    const bounds = this.#model_bounds.get(type)!;
    if (!valueGeometry.boundingSphere) valueGeometry.computeBoundingSphere();
    const targetRadius = valueGeometry.boundingSphere?.radius ?? 0;
    const normalize = bounds.radius > 0 && targetRadius > 0 ? targetRadius / bounds.radius : this.baseScale / 100;
    bounds.effectiveScale = normalize * (modelReg.scale ?? 1);

    const mesh = model.clone();
    mesh.scale.set(bounds.effectiveScale, bounds.effectiveScale, bounds.effectiveScale);

    const dicemesh = mesh as unknown as DiceMesh;
    Object.assign(dicemesh, {
      result: [],
      shape: diceobj.shape,
      rerolls: 0,
      resultReason: 'natural',
      mass: diceobj.mass,
      notation: { type }
    });

    this.#attachDiceMeshMethods(dicemesh);

    if (valueGeometry instanceof THREE.BufferGeometry) {
      dicemesh.valueGeometry = valueGeometry as DiceGeometryType;
    }

    return dicemesh;
  }

  async #createProcedural(type: string, diceobj: DiceObject): Promise<DiceMesh | null> {
    let geom = this.#geometries.get(type);
    if (!geom) {
      const newGeom = this.createGeometry(
        type as DiceShape,
        diceobj.scale * this.baseScale,
        this.createDiceGeometry.bind(this)
      );
      if (newGeom instanceof THREE.BufferGeometry) {
        this.#geometries.set(type, newGeom);
        geom = newGeom;
      }
    }
    if (!geom) return null;

    this.setMaterialInfo();

    const materials = await this.createMaterials(diceobj, this.baseScale / 2, 1.0);
    if (!materials || materials.length === 0) return null;

    const mesh = new THREE.Mesh(geom, materials);
    const dicemesh = mesh as unknown as DiceMesh;

    Object.assign(dicemesh, {
      result: [],
      shape: diceobj.shape,
      rerolls: 0,
      resultReason: 'natural',
      mass: diceobj.mass,
      notation: { type }
    });

    this.#attachDiceMeshMethods(dicemesh);

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
    const diceobj = this.get(type);
    if (!diceobj) return null;

    const modelReg = getDiceModel(type);
    const bounds = this.#model_bounds.get(type);
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

    let geom = this.#geometries.get(type) as DiceGeometryType | undefined;
    if (!geom) {
      const newGeom = this.createGeometry(
        type as DiceShape,
        diceobj.scale * this.baseScale,
        this.createDiceGeometry.bind(this)
      );
      if (newGeom instanceof THREE.BufferGeometry) {
        this.#geometries.set(type, newGeom);
        geom = newGeom as DiceGeometryType;
      }
    }
    const shape = geom?.cannon_shape;
    if (!shape) return null;

    if (shape instanceof CANNON.Cylinder) {
      return {
        kind: 'cylinder',
        radiusTop: shape.radiusTop,
        radiusBottom: shape.radiusBottom,
        height: shape.height,
        segments: (shape as any).numSegments ?? 8,
      };
    }
    if (shape instanceof CANNON.ConvexPolyhedron) {
      return {
        kind: 'convex',
        vertices: shape.vertices.map((v) => [v.x, v.y, v.z]),
        faces: shape.faces.map((f) => [...f]),
      };
    }
    return null;
  }

  /**
   * Create dice with a specific colorset (for d20, boon, bane styling)
   */
  async createWithColorSet(type: string, colordata: DiceColorData): Promise<DiceMesh | null> {
    const diceobj = this.get(type);
    if (!diceobj) return null;

    let geom = this.#geometries.get(type);
    if (!geom) {
      const newGeom = this.createGeometry(
        type as DiceShape,
        diceobj.scale * this.baseScale,
        this.createDiceGeometry.bind(this)
      );
      if (newGeom instanceof THREE.BufferGeometry) {
        this.#geometries.set(type, newGeom);
        geom = newGeom;
      }
    }
    if (!geom) return null;

    // Save current state
    const originalColorData = this.colordata;
    const originalLabelColor = this.#label_color;
    const originalDiceColor = this.#dice_color;
    const originalLabelOutline = this.#label_outline;
    const originalDiceTexture = this.#dice_texture;
    const originalDiceMaterial = this.#dice_material;
    const originalEdgeColor = this.#edge_color;
    const originalDiceFont = this.#dice_font;
    const originalDiceLabels = this.#dice_labels;
    const originalFontOffsetY = this.#dice_font_offset_y;
    const originalEmissive = this.#dice_emissive;
    const originalMaterialOverrides = this.#material_overrides;

    // Temporarily apply the specific colorset
    this.colordata = colordata;
    this.#label_color = colordata.foreground;
    this.#dice_color = colordata.background;
    this.#label_outline = colordata.outline;
    this.#dice_texture = colordata.texture;
    this.#dice_material = colordata.texture?.material || 'none';
    this.#edge_color = colordata.edge || colordata.background;
    if (colordata.font) {
      this.#dice_font = colordata.font;
    }
    if (colordata.labels) {
      this.#dice_labels = colordata.labels;
    }
    if (colordata.fontOffsetY !== undefined) {
      this.#dice_font_offset_y = colordata.fontOffsetY;
    }
    this.#dice_emissive = colordata.emissive ?? false;
    this.#material_overrides = colordata.materialOptions;
    this.setMaterialInfo();

    const materials = await this.createMaterials(diceobj, this.baseScale / 2, 1.0);

    // Restore original state
    this.colordata = originalColorData;
    this.#label_color = originalLabelColor;
    this.#dice_color = originalDiceColor;
    this.#label_outline = originalLabelOutline;
    this.#dice_texture = originalDiceTexture;
    this.#dice_material = originalDiceMaterial;
    this.#edge_color = originalEdgeColor;
    this.#dice_font = originalDiceFont;
    this.#dice_labels = originalDiceLabels;
    this.#dice_font_offset_y = originalFontOffsetY;
    this.#dice_emissive = originalEmissive;
    this.#material_overrides = originalMaterialOverrides;
    this.setMaterialInfo();

    if (!materials || materials.length === 0) return null;

    const mesh = new THREE.Mesh(geom, materials);
    const dicemesh = mesh as unknown as DiceMesh;

    Object.assign(dicemesh, {
      result: [],
      shape: diceobj.shape,
      rerolls: 0,
      resultReason: 'natural',
      mass: diceobj.mass,
      notation: { type }
    });

    this.#attachDiceMeshMethods(dicemesh);

    if (diceobj.color && Array.isArray(dicemesh.material)) {
      const material = dicemesh.material[0] as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
      material.color = new THREE.Color(diceobj.color);
      material.emissive = new THREE.Color(diceobj.color);
      material.emissiveIntensity = 1;
      material.needsUpdate = true;
    }

    return this.#fixMaterials(dicemesh, diceobj.values.length);
  }

  #attachDiceMeshMethods(dicemesh: DiceMesh): void {
    dicemesh.getFaceValue = function () {
      const reason = this.resultReason;
      _scratchUpVector.set(0, 0, this.shape === 'd4' ? -1 : 1);

      let closest_face: THREE.GeometryGroup | undefined;
      let closest_angle = Math.PI * 2;
      const geom = (this.valueGeometry ?? this.geometry) as DiceGeometryType;
      if (!geom?.groups) return { value: 0, label: '', reason };
      const faceNormals = computeFaceNormals(geom);

      const quaternion = this.body?.quaternion;
      if (!quaternion) return { value: 0, label: '', reason };

      for (let i = 0; i < geom.groups.length; ++i) {
        const face = geom.groups[i];
        if (!face || face.materialIndex === 0) continue;

        _scratchFaceNormal.set(faceNormals[i * 3], faceNormals[i * 3 + 1], faceNormals[i * 3 + 2]);
        const angle = _scratchFaceNormal.applyQuaternion(quaternion as THREE.Quaternion).angleTo(_scratchUpVector);

        if (angle < closest_angle) {
          closest_angle = angle;
          closest_face = face;
        }
      }

      if (!closest_face?.materialIndex) return { value: 0, label: '', reason };

      const matindex = closest_face.materialIndex - 1;
      const diceobj = DiceFactory.#dice.get(this.notation?.type || '');
      if (!diceobj) return { value: 0, label: '', reason };

      if (this.shape === 'd4') {
        const labelindex2 = matindex - 1 === 0 ? 5 : matindex;
        const labels = diceobj.labels[matindex - 1];
        if (!labels) return { value: 0, label: '', reason };

        const labelArray = labels[labelindex2];
        if (!labelArray) return { value: 0, label: '', reason };

        return {
          value: matindex,
          label: labelArray[0] || '',
          reason,
        };
      }

      const offset = ['d10', 'd2'].includes(this.shape) ? 1 : 2;
      const adjustedMatindex = ['d10', 'd2'].includes(this.shape)
        ? matindex + 1
        : matindex;

      const value =
        diceobj.values[(adjustedMatindex - 1) % diceobj.values.length];
      const labelIndex = ((adjustedMatindex - 1) % (diceobj.labels.length - 2)) + offset;
      const label = diceobj.labels[labelIndex] || '';

      return { value, label, reason };
    };

    dicemesh.storeRolledValue = function (reason) {
      this.resultReason = reason || this.resultReason;
      this.result.push(this.getFaceValue());
    };

    dicemesh.getLastValue = function () {
      return this.result?.at(-1) ?? { value: undefined, label: '', reason: '' };
    };

    dicemesh.ignoreLastValue = function (ignore) {
      const lastvalue = this.getLastValue();
      if (lastvalue.value === undefined) return;

      lastvalue.ignore = ignore;
      this.setLastValue(lastvalue);
    };

    dicemesh.setLastValue = function (result) {
      if (!this.result?.length || !result) return;
      return (this.result[this.result.length - 1] = result);
    };
  }

  get(type: string): DiceObject | undefined {
    if (!DiceFactory.#dice.has(type)) {
      DiceFactory.#dice.set(type, new DicePreset(type as DiceShape));
    }
    return DiceFactory.#dice.get(type);
  }

  getGeometry(type: string): THREE.BufferGeometry | undefined {
    return this.#geometries.get(type);
  }

  #scaleGeometry() {
    // Implementation for scaling geometry
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
  ): Promise<Array<THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshPhysicalMaterial>> {
    let materials: Array<THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshPhysicalMaterial> = [];
    let labels = diceobj.labels;

    if (diceobj.shape == 'd4') {
      labels = diceobj.labels[d4specialindex];
      size = this.baseScale / 2;
      margin = this.baseScale * 2;
    }

    // Process overrides if configured
    if (this.#dice_labels[diceobj.type]) {
      labels = this.#getProcessedLabels(diceobj.type, this.#dice_labels[diceobj.type]);
      if (diceobj.shape == 'd4') {
        labels = labels[d4specialindex];
      }
    }

    // Generate or load roughness map only once per material set if needed
    let roughnessTexture: THREE.Texture | null = null;
    let materialType = this.dice_material_rand as MaterialType;
    let materialConfig = MATERIALTYPES[materialType];

    // Ensure we have a valid config, fallback to plastic if needed
    if (!materialConfig && this.dice_material_rand !== 'none') {
      materialConfig = MATERIALTYPES['plastic'] || MATERIALTYPES['none'];
    }

    if (this.bumpMapping && materialConfig?.roughnessMap) {
      const mapName = materialConfig.roughnessMap;

      // Check cache first
      if (this.#roughness_maps_cache.has(mapName)) {
        roughnessTexture = this.#roughness_maps_cache.get(mapName)!;
      } else {
        let fileName = '';
        if (mapName === 'roughnessMap_fingerprint') fileName = 'finger.webp';
        if (mapName === 'roughnessMap_metal') fileName = 'metal.webp';
        if (mapName === 'roughnessMap_wood') fileName = 'wood.webp';
        if (mapName === 'roughnessMap_stone') fileName = 'stone.webp';

        if (fileName) {
          roughnessTexture = await new Promise((resolve) => {
            this.loaderTexture.load(resolveAssetPath(this.assetPath, `roughness-map/${fileName}`), (texture) => {
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              this.#roughness_maps_cache.set(mapName, texture);
              resolve(texture);
            }, undefined, (err) => {
              console.warn(`Failed to load roughness map ${fileName}`, err);
              resolve(null);
            });
          });
        }

        // Fallback to procedural if load fails or mapping missing
        if (!roughnessTexture) {
          roughnessTexture = this.createNoiseTexture(512, 0.7);
          this.#roughness_maps_cache.set(mapName, roughnessTexture);
        }
      }
    }

    for (let i = 0; i < labels.length; ++i) {
      let mat: THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshPhysicalMaterial;

      if (this.dice_material_rand && this.dice_material_rand !== 'none') {
        const config = MATERIALTYPES[this.dice_material_rand as MaterialType];

        if (config && config.type === 'physical') {
          const physMat = new THREE.MeshPhysicalMaterial(MATERIAL_OPTIONS);
          // Apply specific physical properties
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
          // Fallback
          mat = new THREE.MeshStandardMaterial(MATERIAL_OPTIONS);
        }

        if (config && config.envMapIntensity !== undefined && 'envMapIntensity' in mat) mat.envMapIntensity = config.envMapIntensity;

        if (this.bumpMapping && roughnessTexture && config?.roughnessMap && mat instanceof THREE.MeshStandardMaterial) {
          mat.roughnessMap = roughnessTexture;
          mat.roughness = 1.0; // Roughness map modulates the roughness, so set base to 1 or controlled value
        }

      } else {
        mat = new THREE.MeshPhongMaterial(MATERIAL_OPTIONS);
      }

      if (this.#material_overrides) {
        if (this.#material_overrides.color !== undefined) {
          mat.color.set(this.#material_overrides.color);
        }
        if (this.#material_overrides.roughness !== undefined && 'roughness' in mat) {
          (mat as THREE.MeshStandardMaterial).roughness = this.#material_overrides.roughness;
        }
        if (this.#material_overrides.metalness !== undefined && 'metalness' in mat) {
          (mat as THREE.MeshStandardMaterial).metalness = this.#material_overrides.metalness;
        }
        if (this.#material_overrides.envMapIntensity !== undefined && 'envMapIntensity' in mat) {
          mat.envMapIntensity = this.#material_overrides.envMapIntensity;
        }
      }

      let canvasTextures;
      if (i == 0) {
        //edge
        //if the texture is fully opaque, we do not use it for edge
        let texture = { name: 'none' };
        if (this.dice_texture_rand?.composite != 'source-over')
          texture = this.dice_texture_rand;

        canvasTextures = await this.createTextMaterial(
          diceobj,
          labels,
          i,
          size,
          margin,
          texture,
          this.label_color_rand,
          this.label_outline_rand,
          this.edge_color_rand,
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
          this.dice_texture_rand,
          this.label_color_rand,
          this.label_outline_rand,
          this.dice_color_rand,
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
            let normalsTexture = this.#normals_textures.get(normalsKey);
            if (!normalsTexture) {
              normalsTexture = new THREE.Texture(normalsImage);
              normalsTexture.needsUpdate = true;
              this.#normals_textures.set(normalsKey, normalsTexture);
            }
            mat.bumpMap = normalsTexture;
            mat.bumpScale = 4;
          } else if (this.normalMaps && canvasTextures?.bump) {
            if (!canvasTextures.normal) {
              canvasTextures.normal = new THREE.CanvasTexture(
                heightCanvasToNormalCanvas(canvasTextures.bump.image as HTMLCanvasElement, 2)
              );
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
    texture: any,
    forecolor: string,
    outlinecolor: string,
    backcolor: string,
    allowcache: boolean
  ): Promise<MaterialCacheEntry | null> {
    if (labels[index] === undefined) return null;

    texture = texture || this.dice_texture_rand;
    forecolor = forecolor || this.label_color_rand;
    outlinecolor = outlinecolor || this.label_outline_rand;
    backcolor = backcolor || this.dice_color_rand;
    allowcache = allowcache == undefined ? true : allowcache;

    let text = labels[index];
    let isTexture = false;
    let textCache = '';
    if (text instanceof HTMLImageElement) {
      textCache = text.src;
    } else if (text instanceof Array) {
      textCache = text.map((el) => (el instanceof HTMLImageElement ? el.src : String(el))).join('|');
    } else {
      textCache = String(text);
    }

    const emissiveEnabled = this.#dice_emissive;
    const materialOptionsKey = this.#material_overrides
      ? JSON.stringify(this.#material_overrides)
      : '';

    // an attempt at materials caching
    let cachestring = [
      diceobj.type,
      textCache,
      index,
      texture.name,
      forecolor,
      outlinecolor,
      backcolor,
      this.#dice_font,
      this.#dice_font_offset_y,
      this.dice_material_rand,
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
        this.#dice_font,
        this.#dice_font_offset_y,
        this.dice_material_rand,
        materialOptionsKey,
        emissiveEnabled ? 'e' : '',
        this.normalMaps ? 'n' : '',
      ].join(';');
    }
    if (allowcache) {
      const cached = this.#materials_cache.get(cachestring);
      if (cached != null) return cached;
    }

    const { canvas, context } = createCanvas();
    if (!canvas || !context) return null;

    context.globalAlpha = 0;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const { canvas: canvasBump, context: contextBump } = createCanvas();
    if (!canvasBump || !contextBump) return null;

    contextBump.globalAlpha = 0;
    contextBump.clearRect(0, 0, canvasBump.width, canvasBump.height);

    // Create emissive canvas for numbers (black background, white numbers)
    // Only rendered when the colorset opts in via `emissive: true`
    const { canvas: canvasEmissive, context: realEmissiveContext } = createCanvas();
    if (!canvasEmissive || !realEmissiveContext) return null;
    const noopContext = new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D;
    const contextEmissive: CanvasRenderingContext2D = emissiveEnabled ? realEmissiveContext : noopContext;

    contextEmissive.globalAlpha = 0;
    contextEmissive.clearRect(0, 0, canvasEmissive.width, canvasEmissive.height);

    let ts;

    if (diceobj.shape == 'd4') {
      ts = this.calculateTextureSize(size + margin) * 4;
    } else {
      ts = this.calculateTextureSize(size + size * 2 * margin) * 4;
    }

    canvas.width = canvas.height = ts;
    canvasBump.width = canvasBump.height = ts;
    if (emissiveEnabled) {
      canvasEmissive.width = canvasEmissive.height = ts;
    }

    // create color
    context.fillStyle = backcolor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    contextBump.fillStyle = '#FFFFFF';
    contextBump.fillRect(0, 0, canvasBump.width, canvasBump.height);

    // Emissive starts black (no emission)
    contextEmissive.fillStyle = '#000000';
    contextEmissive.fillRect(0, 0, canvasEmissive.width, canvasEmissive.height);

    //create underlying texture
    if (texture.texture && texture.name != '' && texture.name != 'none') {
      context.globalCompositeOperation = texture.composite || 'source-over';
      context.drawImage(texture.texture, 0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = 'source-over';

      if (texture.bump) {
        contextBump.globalCompositeOperation = 'source-over';
        contextBump.drawImage(texture.bump, 0, 0, canvas.width, canvas.height);
      }
    } else {
      context.globalCompositeOperation = 'source-over';
    }

    // create text
    context.globalCompositeOperation = 'source-over';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    contextBump.textAlign = 'center';
    contextBump.textBaseline = 'middle';

    contextEmissive.textAlign = 'center';
    contextEmissive.textBaseline = 'middle';

    if (diceobj.shape != 'd4') {
      // fixes texture rotations on specific dice models
      const rotate: Record<DiceShape, { even?: number; odd?: number; all?: number }> = {
        d2: { all: 0 },
        d4: { all: 0 },
        d6: { all: 0 },
        d8: { even: -7.5, odd: -127.5 },
        d10: { all: -6 },
        d12: { all: 5 },
        d20: { all: -7.5 },
        d100: { all: -6 }
      };

      // fix for some faces being weirdly rotated
      let rotateface = rotate[diceobj.shape as DiceShape];
      if (rotateface) {
        let degrees;
        if (rotateface.hasOwnProperty('all')) {
          degrees = rotateface.all;
        } else {
          if (index > 0 && index % 2 != 0) {
            degrees = rotateface.odd;
          } else {
            degrees = rotateface.even;
          }
        }
        // let degrees = ((rotateface.hasOwnProperty("all") ? rotateface.all : false) || (index > 0 && (index % 2) != 0)) ? rotateface.odd : rotateface.even;

        if (degrees && degrees != 0) {
          var hw = canvas.width / 2;
          var hh = canvas.height / 2;

          context.translate(hw, hh);
          context.rotate(degrees * (Math.PI / 180));
          context.translate(-hw, -hh);

          contextBump.translate(hw, hh);
          contextBump.rotate(degrees * (Math.PI / 180));
          contextBump.translate(-hw, -hh);

          contextEmissive.translate(hw, hh);
          contextEmissive.rotate(degrees * (Math.PI / 180));
          contextEmissive.translate(-hw, -hh);
        }
      }

      //custom texture face
      if (text instanceof HTMLImageElement) {
        isTexture = true;
        context.drawImage(
          text,
          0,
          0,
          text.width,
          text.height,
          0,
          0,
          canvas.width,
          canvas.height
        );

        // text-only face
      } else {
        let fontsize = ts / (1 + 2 * margin);
        let textstarty = canvas.height / 2 + 10 + (this.#dice_font_offset_y || 0);
        let textstartx = canvas.width / 2;

        if (diceobj.shape == 'd10') {
          fontsize = fontsize * 0.75;
          textstarty = textstarty * 1.15 - 10;
        } else if (diceobj.shape == 'd20') {
          textstartx = textstartx * 0.98;
        }

        const font = this.#dice_font || diceobj.font || 'Arial';
        context.font = fontsize + 'pt ' + font;
        contextBump.font = fontsize + 'pt ' + font;
        contextEmissive.font = fontsize + 'pt ' + font;

        let lineHeight = context.measureText('M').width * 1.4;
        let textlines = text.split('\n');

        if (textlines.length > 1) {
          fontsize = fontsize / textlines.length;
          const font = this.#dice_font || diceobj.font || 'Arial';
          context.font = fontsize + 'pt ' + font;
          contextBump.font = fontsize + 'pt ' + font;
          contextEmissive.font = fontsize + 'pt ' + font;
          lineHeight = context.measureText('M').width * 1.2;
          textstarty -= (lineHeight * textlines.length) / 2;
        }

        for (let i = 0, l = textlines.length; i < l; i++) {
          let textline = textlines[i].trim();

          // attempt to outline the text with a meaningful color
          if (outlinecolor != 'none' && outlinecolor != backcolor) {
            context.strokeStyle = outlinecolor;
            context.lineWidth = 5;
            context.strokeText(textlines[i], textstartx, textstarty);

            contextBump.strokeStyle = '#000000';
            contextBump.lineWidth = 5;
            contextBump.strokeText(textlines[i], textstartx, textstarty);

            // Emissive outline (white for glow effect)
            contextEmissive.strokeStyle = forecolor;
            contextEmissive.lineWidth = 5;
            contextEmissive.strokeText(textlines[i], textstartx, textstarty);

            if (textline == '6' || textline == '9') {
              context.strokeText('  .', textstartx, textstarty);
              contextBump.strokeText('  .', textstartx, textstarty);
              contextEmissive.strokeText('  .', textstartx, textstarty);
            }
          }

          context.fillStyle = forecolor;
          context.fillText(textlines[i], textstartx, textstarty);

          contextBump.fillStyle = '#000000';
          contextBump.fillText(textlines[i], textstartx, textstarty);

          // Emissive text (draw with forecolor for the emissive map)
          contextEmissive.fillStyle = forecolor;
          contextEmissive.fillText(textlines[i], textstartx, textstarty);

          if (textline == '6' || textline == '9') {
            context.fillText('  .', textstartx, textstarty);
            contextBump.fillText('  .', textstartx, textstarty);
            contextEmissive.fillText('  .', textstartx, textstarty);
          }
          textstarty += lineHeight * 1.5;
        }
      }
    } else {
      var hw = canvas.width / 2;
      var hh = canvas.height / 2;

      const font = this.#dice_font || diceobj.font || 'Arial';
      context.font = (ts / 128) * 24 + 'pt ' + font;
      contextBump.font = (ts / 128) * 24 + 'pt ' + font;
      contextEmissive.font = (ts / 128) * 24 + 'pt ' + font;

      //draw the numbers
      for (let i = 0; i < text.length; i++) {
        //custom texture face
        if (text[i] instanceof HTMLImageElement) {
          let scaleTexture = text[i].width / canvas.width;
          context.drawImage(
            text[i],
            0,
            0,
            text[i].width,
            text[i].height,
            100 / scaleTexture,
            25 / scaleTexture,
            60 / scaleTexture,
            60 / scaleTexture
          );
        } else {
          // attempt to outline the text with a meaningful color
          const yPos = hh - ts * 0.3 + (this.#dice_font_offset_y || 0);
          if (outlinecolor != 'none' && outlinecolor != backcolor) {
            context.strokeStyle = outlinecolor;
            context.lineWidth = 5;
            context.strokeText(text[i], hw, yPos);

            contextBump.strokeStyle = '#000000';
            contextBump.lineWidth = 5;
            contextBump.strokeText(text[i], hw, yPos);

            contextEmissive.strokeStyle = forecolor;
            contextEmissive.lineWidth = 5;
            contextEmissive.strokeText(text[i], hw, yPos);
          }

          //draw label in top middle section
          context.fillStyle = forecolor;
          context.fillText(text[i], hw, yPos);

          contextBump.fillStyle = '#000000';
          contextBump.fillText(text[i], hw, yPos);

          contextEmissive.fillStyle = forecolor;
          contextEmissive.fillText(text[i], hw, yPos);
        }

        //rotate 1/3 for next label
        context.translate(hw, hh);
        context.rotate((Math.PI * 2) / 3);
        context.translate(-hw, -hh);

        contextBump.translate(hw, hh);
        contextBump.rotate((Math.PI * 2) / 3);
        contextBump.translate(-hw, -hh);

        contextEmissive.translate(hw, hh);
        contextEmissive.rotate((Math.PI * 2) / 3);
        contextEmissive.translate(-hw, -hh);
      }

      //debug side numbering
      // context.fillStyle = forecolor;
      // context.fillText(index, hw, hh);
    }

    var compositetexture = new THREE.CanvasTexture(canvas);
    var bumpMap;
    var emissiveMap;
    if (!isTexture) {
      bumpMap = new THREE.CanvasTexture(canvasBump);
      emissiveMap = emissiveEnabled ? new THREE.CanvasTexture(canvasEmissive) : null;
    } else {
      bumpMap = null;
      emissiveMap = null;
    }

    const entry: MaterialCacheEntry = {
      composite: compositetexture,
      bump: bumpMap,
      emissive: emissiveMap,
    };

    if (allowcache) {
      this.#materials_cache.set(cachestring, entry);
    }

    return entry;
  }

  applyColorSet(colordata: DiceColorData): void {
    // Dispose cached textures to avoid GPU memory leaks on theme change
    this.disposeMaterialCaches();

    // Reset to defaults
    this.#dice_font = 'Arial';
    this.#dice_labels = {};

    this.colordata = colordata;
    this.#label_color = colordata.foreground;
    this.#dice_color = colordata.background;
    this.#label_outline = colordata.outline;
    this.#dice_texture = colordata.texture;
    this.#dice_material = colordata.texture?.material || 'none';
    this.#edge_color = colordata.edge || colordata.background;
    if (colordata.font) {
      this.#dice_font = colordata.font;
    }
    if (colordata.labels) {
      this.#dice_labels = colordata.labels;
    }
    if (colordata.fontOffsetY !== undefined) {
      this.#dice_font_offset_y = colordata.fontOffsetY;
    }
    this.#dice_emissive = colordata.emissive ?? false;
    this.#material_overrides = colordata.materialOptions;
  }

  setRandomColors(): void {
    // set base color first
    if (Array.isArray(this.#dice_color)) {
      const colorindex = Math.floor(Math.random() * this.#dice_color.length);

      // if color list and label list are same length, treat them as a parallel list
      if (
        Array.isArray(this.#label_color) &&
        this.#label_color.length == this.#dice_color.length
      ) {
        this.label_color_rand = this.#label_color[colorindex];

        // if label list and outline list are same length, treat them as a parallel list
        if (
          Array.isArray(this.#label_outline) &&
          this.#label_outline.length == this.#label_color.length
        ) {
          this.label_outline_rand = this.#label_outline[colorindex];
        }
      }
      // if texture list is same length do the same
      if (
        Array.isArray(this.#dice_texture) &&
        this.#dice_texture.length == this.#dice_color.length
      ) {
        this.dice_texture_rand = this.#dice_texture[colorindex];
        this.dice_material_rand = this.dice_texture_rand.material;
      }

      //if edge list and color list are same length, treat them as a parallel list
      if (
        Array.isArray(this.#edge_color) &&
        this.#edge_color.length == this.#dice_color.length
      ) {
        this.edge_color_rand = this.#edge_color[colorindex];
      }

      this.dice_color_rand = this.#dice_color[colorindex];
    } else {
      this.dice_color_rand = this.#dice_color;
    }

    // set edge color if not set
    if (this.edge_color_rand === '') {
      if (Array.isArray(this.#edge_color)) {
        const colorindex = Math.floor(Math.random() * this.#edge_color.length);
        this.edge_color_rand = this.#edge_color[colorindex];
      } else {
        this.edge_color_rand = this.#edge_color;
      }
    }

    // if selected label color is still not set, pick one
    if (this.label_color_rand === '' && Array.isArray(this.#label_color)) {
      const colorindex = Math.floor(Math.random() * this.#label_color.length);

      // if label list and outline list are same length, treat them as a parallel list
      if (
        Array.isArray(this.#label_outline) &&
        this.#label_outline.length == this.#label_color.length
      ) {
        this.label_outline_rand = this.#label_outline[colorindex];
      }

      this.label_color_rand = this.#label_color[colorindex];
    } else if (this.label_color_rand === '') {
      this.label_color_rand = this.#label_color;
    }

    // if selected label outline is still not set, pick one
    if (this.label_outline_rand === '' && Array.isArray(this.#label_outline)) {
      const colorindex = Math.floor(Math.random() * this.#label_outline.length);
      this.label_outline_rand = this.#label_outline[colorindex];
    } else if (this.label_outline_rand === '') {
      this.label_outline_rand = this.#label_outline;
    }

    // same for textures list
    if (this.dice_texture_rand === '' && Array.isArray(this.#dice_texture)) {
      this.dice_texture_rand =
        this.#dice_texture[
        Math.floor(Math.random() * this.#dice_texture.length)
        ];
      this.dice_material_rand =
        this.dice_texture_rand.material || this.#dice_material;
    } else if (this.dice_texture_rand === '') {
      this.dice_texture_rand = this.#dice_texture;
      this.dice_material_rand =
        this.dice_texture_rand.material || this.#dice_material;
    }

    //apply material
    if (this.dice_material_rand === '' && Array.isArray(this.#dice_material)) {
      this.dice_material_rand =
        this.#dice_material[
        Math.floor(Math.random() * this.#dice_material.length)
        ];
    } else if (this.dice_material_rand === '') {
      this.dice_material_rand = this.#dice_material;
    }
  }

  setMaterialInfo(colorset = ''): void {
    const prevcolordata = this.colordata;
    const prevtexture = this.#dice_texture;
    const prevmaterial = this.#dice_material;

    //reset random choices
    this.dice_color_rand = '';
    this.label_color_rand = '';
    this.label_outline_rand = '';
    this.dice_texture_rand = '';
    this.dice_material_rand = '';
    this.edge_color_rand = '';

    this.setRandomColors();

    if (this.colordata?.id && prevcolordata?.id && this.colordata.id !== prevcolordata.id) {
      this.applyColorSet(prevcolordata);
    }
  }

  calculateTextureSize(approx: number): number {
    return Math.pow(2, Math.floor(Math.log(approx) / Math.log(2)));
  }

  createPhysicsShape(vertices: number[][], faces: number[][], radius: number): CANNON.ConvexPolyhedron {
    const vectors = new Array(vertices.length);
    for (let i = 0; i < vertices.length; ++i) {
      vectors[i] = new THREE.Vector3().fromArray(vertices[i]).normalize();
    }
    const cv = new Array(vertices.length);
    const cf = new Array(faces.length);
    for (let i = 0; i < vectors.length; ++i) {
      const v = vectors[i];
      cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
    }
    for (let i = 0; i < faces.length; ++i) {
      cf[i] = faces[i].slice(0, faces[i].length - 1);
    }
    return new CANNON.ConvexPolyhedron({ vertices: cv, faces: cf });
  }

  createBasicDiceGeometry(
    vectors: THREE.Vector3[],
    faces: number[][],
    radius: number,
    tab: number,
    af: number
  ): THREE.BufferGeometry {
    let geom = new THREE.BufferGeometry();

    for (let i = 0; i < vectors.length; ++i) {
      vectors[i] = vectors[i].multiplyScalar(radius);
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();
    let materialIndex: number;
    let faceFirstVertexIndex = 0;

    for (let i = 0; i < faces.length; ++i) {
      const ii = faces[i];
      const fl = ii.length - 1;
      const aa = (Math.PI * 2) / fl;
      materialIndex = ii[fl] + 1;
      for (let j = 0; j < fl - 2; ++j) {
        //Vertices
        positions.push(...vectors[ii[0]].toArray());
        positions.push(...vectors[ii[j + 1]].toArray());
        positions.push(...vectors[ii[j + 2]].toArray());

        // Flat face normals
        cb.subVectors(vectors[ii[j + 2]], vectors[ii[j + 1]]);
        ab.subVectors(vectors[ii[0]], vectors[ii[j + 1]]);
        cb.cross(ab);
        cb.normalize();

        // Vertex Normals
        normals.push(...cb.toArray());
        normals.push(...cb.toArray());
        normals.push(...cb.toArray());

        //UVs
        uvs.push(
          (Math.cos(af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(af) + 1 + tab) / 2 / (1 + tab)
        );
        uvs.push(
          (Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab)
        );
        uvs.push(
          (Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab)
        );
      }

      //Set Group for face materials.
      const numOfVertices = (fl - 2) * 3;
      for (let i = 0; i < numOfVertices / 3; i++) {
        geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
        faceFirstVertexIndex += 3;
      }
    }

    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
    return geom;
  }

  createD10Geometry(
    vectors: THREE.Vector3[],
    faces: number[][],
    radius: number,
    tab: number,
    af: number
  ): THREE.BufferGeometry {
    let geom = new THREE.BufferGeometry();

    for (let i = 0; i < vectors.length; ++i) {
      vectors[i] = vectors[i].multiplyScalar(radius);
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();
    let materialIndex: number;
    let faceFirstVertexIndex = 0;

    for (let i = 0; i < faces.length; ++i) {
      const ii = faces[i];
      const fl = ii.length - 1;
      const aa = (Math.PI * 2) / fl;
      materialIndex = ii[fl] + 1;
      const w = 0.65;
      const h = 0.85;
      const v0 = 1 - 1 * h;
      const v1 = 1 - (0.895 / 1.105) * h;
      const v2 = 1;

      for (let j = 0; j < fl - 2; ++j) {
        //Vertices
        positions.push(...vectors[ii[0]].toArray());
        positions.push(...vectors[ii[j + 1]].toArray());
        positions.push(...vectors[ii[j + 2]].toArray());

        // Flat face normals
        cb.subVectors(vectors[ii[j + 2]], vectors[ii[j + 1]]);
        ab.subVectors(vectors[ii[0]], vectors[ii[j + 1]]);
        cb.cross(ab);
        cb.normalize();

        // Vertex Normals
        normals.push(...cb.toArray());
        normals.push(...cb.toArray());
        normals.push(...cb.toArray());

        //UVs
        if (faces[i][faces[i].length - 1] == -1 || j >= 2) {
          uvs.push(
            (Math.cos(af) + 1 + tab) / 2 / (1 + tab),
            (Math.sin(af) + 1 + tab) / 2 / (1 + tab)
          );
          uvs.push(
            (Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
            (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab)
          );
          uvs.push(
            (Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
            (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab)
          );
        } else if (j == 0) {
          uvs.push(0.5 - w / 2, v1);
          uvs.push(0.5, v0);
          uvs.push(0.5 + w / 2, v1);
        } else if (j == 1) {
          uvs.push(0.5 - w / 2, v1);
          uvs.push(0.5 + w / 2, v1);
          uvs.push(0.5, v2);
        }
      }

      //Set Group for face materials.
      const numOfVertices = (fl - 2) * 3;
      for (let i = 0; i < numOfVertices / 3; i++) {
        geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
        faceFirstVertexIndex += 3;
      }
    }

    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
    return geom;
  }

  createChamferedGeometry(vectors: THREE.Vector3[], faces: number[][], chamfer: number): ChamferResult {
    const chamfer_vectors: THREE.Vector3[] = [];
    const chamfer_faces: number[][] = [];
    const corner_faces = new Array(vectors.length);
    for (let i = 0; i < vectors.length; ++i) corner_faces[i] = [];
    for (let i = 0; i < faces.length; ++i) {
      const ii = faces[i];
      const fl = ii.length - 1;
      const center_point = new THREE.Vector3();
      const face = new Array(fl);
      for (let j = 0; j < fl; ++j) {
        const vv = vectors[ii[j]].clone();
        center_point.add(vv);
        corner_faces[ii[j]].push((face[j] = chamfer_vectors.push(vv) - 1));
      }
      center_point.divideScalar(fl);
      for (let j = 0; j < fl; ++j) {
        const vv = chamfer_vectors[face[j]];
        vv.subVectors(vv, center_point)
          .multiplyScalar(chamfer)
          .addVectors(vv, center_point);
      }
      face.push(ii[fl]);
      chamfer_faces.push(face);
    }
    for (let i = 0; i < faces.length - 1; ++i) {
      for (let j = i + 1; j < faces.length; ++j) {
        const pairs: [number, number][] = [];
        let lastm = -1;
        for (let m = 0; m < faces[i].length - 1; ++m) {
          const n = faces[j].indexOf(faces[i][m]);
          if (n >= 0 && n < faces[j].length - 1) {
            if (lastm >= 0 && m != lastm + 1) pairs.unshift([i, m], [j, n]);
            else pairs.push([i, m], [j, n]);
            lastm = m;
          }
        }
        if (pairs.length != 4) continue;
        chamfer_faces.push([
          chamfer_faces[pairs[0][0]][pairs[0][1]],
          chamfer_faces[pairs[1][0]][pairs[1][1]],
          chamfer_faces[pairs[3][0]][pairs[3][1]],
          chamfer_faces[pairs[2][0]][pairs[2][1]],
          -1,
        ]);
      }
    }
    for (let i = 0; i < corner_faces.length; ++i) {
      const cf = corner_faces[i];
      const face: number[] = [cf[0]];
      let count = cf.length - 1;
      while (count) {
        for (let m = faces.length; m < chamfer_faces.length; ++m) {
          const index = chamfer_faces[m].indexOf(face[face.length - 1]);
          if (index >= 0 && index < 4) {
            const next_vertex = chamfer_faces[m][index === 0 ? 3 : index - 1];
            if (cf.indexOf(next_vertex) >= 0) {
              face.push(next_vertex);
              break;
            }
          }
        }
        --count;
      }
      face.push(-1);
      chamfer_faces.push(face);
    }
    return { vectors: chamfer_vectors, faces: chamfer_faces };
  }

  createDiceGeometry(
    vertices: number[][],
    faces: number[][],
    radius: number,
    tab: number,
    af: number,
    chamfer: number
  ): DiceGeometryType {
    const vectors = new Array(vertices.length);
    for (let i = 0; i < vectors.length; ++i) {
      vectors[i] = new THREE.Vector3().fromArray(vertices[i]).normalize();
    }
    const cg = this.createChamferedGeometry(vectors, faces, chamfer);
    const baseGeom = faces.length !== 10
      ? this.createBasicDiceGeometry(cg.vectors, cg.faces, radius, tab, af)
      : this.createD10Geometry(cg.vectors, cg.faces, radius, tab, af);

    const geom = baseGeom as DiceGeometryType;
    const shape = this.createPhysicsShape(vertices, faces, radius);
    geom.cannon_shape = shape;
    geom.name = 'd' + faces.length;
    computeFaceNormals(geom);
    return geom;
  }

  createGeometry(
    type: DiceShape,
    radius: number,
    geometryFunction: GeometryCreationFunction = this.createDiceGeometry.bind(this)
  ): DiceGeometryType | null {
    switch (type) {
      case 'd2': {
        const geom = new THREE.CylinderGeometry(
          1 * radius,
          1 * radius,
          0.1 * radius,
          32
        ) as DiceGeometryType;
        geom.cannon_shape = new CANNON.Cylinder(
          1 * radius,
          1 * radius,
          0.1 * radius,
          8
        );
        computeFaceNormals(geom);
        return geom;
      }
      case 'd4': {
        return geometryFunction(
          DICE_GEOM.d4.vertices,
          DICE_GEOM.d4.faces,
          radius,
          -0.1,
          (Math.PI * 7) / 6,
          0.96
        ) as DiceGeometryType;
      }
      case 'd6': {
        return geometryFunction(
          DICE_GEOM.d6.vertices,
          DICE_GEOM.d6.faces,
          radius,
          0.1,
          Math.PI / 4,
          0.96
        ) as DiceGeometryType;
      }
      case 'd8': {
        return geometryFunction(
          DICE_GEOM.d8.vertices,
          DICE_GEOM.d8.faces,
          radius,
          0,
          -Math.PI / 4 / 2,
          0.965
        ) as DiceGeometryType;
      }
      case 'd10': {
        return geometryFunction(
          DICE_GEOM.d10.vertices,
          DICE_GEOM.d10.faces,
          radius,
          0.3,
          Math.PI,
          0.945
        ) as DiceGeometryType;
      }
      case 'd12': {
        return geometryFunction(
          DICE_GEOM.d12.vertices,
          DICE_GEOM.d12.faces,
          radius,
          0.2,
          -Math.PI / 4 / 2,
          0.968
        ) as DiceGeometryType;
      }
      case 'd20': {
        return geometryFunction(
          DICE_GEOM.d20.vertices,
          DICE_GEOM.d20.faces,
          radius,
          -0.2,
          -Math.PI / 4 / 2,
          0.955
        ) as DiceGeometryType;
      }
      default: {
        console.error(`Geometry for ${type} is not available`);
        return null;
      }
    }
  }

  #getProcessedLabels(type: string, faces: any[]): any[] {
    const diceobj = DiceFactory.#dice.get(type);
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
