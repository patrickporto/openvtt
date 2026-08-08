import * as v from 'valibot';
import type { AntialiasMode, EnvironmentSpec, PostFXOptions } from '@openvtt/render3d';

export type ShadowQuality = 'none' | 'low' | 'medium' | 'high';
export type QueueMode = 'serial' | 'replace' | 'parallel';

export const SHADOW_MAP_SIZES: Record<Exclude<ShadowQuality, 'none'>, number> = {
  low: 1024,
  medium: 2048,
  high: 4096,
};

export interface DiceBoxOptions {
  assetPath?: string;
  worker?: boolean;
  workerFactory?: () => Worker;
  workerUrl?: string | URL;
  antialias?: AntialiasMode;
  shadows?: ShadowQuality | boolean;
  environment?: EnvironmentSpec;
  environmentIntensity?: number;
  postprocessing?: PostFXOptions;
  normalMaps?: boolean;
  theme?: string;
  surface?: string;
  customColorset?: any | null;
  texture?: string;
  material?: string;
  sounds?: boolean;
  volume?: number;
  strength?: number;
  gravityMultiplier?: number;
  lightIntensity?: number;
  baseScale?: number;
  timestep?: number;
  iterationLimit?: number;
  maxPixelRatio?: number;
  queueMode?: QueueMode;
  dracoPath?: string;
  colorSpotlight?: number;
  /** @deprecated use `timestep` */
  framerate?: number;
  /** @deprecated use `theme` */
  theme_colorset?: string;
  /** @deprecated use `customColorset` */
  theme_customColorset?: any | null;
  /** @deprecated use `surface` */
  theme_surface?: string;
  /** @deprecated use `texture` */
  theme_texture?: string;
  /** @deprecated use `material` */
  theme_material?: string;
  /** @deprecated use `gravityMultiplier` */
  gravity_multiplier?: number;
  /** @deprecated use `lightIntensity` */
  light_intensity?: number;
  /** @deprecated use `colorSpotlight` */
  color_spotlight?: number;
  sound_dieMaterial?: string;
  scale?: number;
  onRollComplete?: () => void;
}

export interface NormalizedConfig {
  assetPath: string;
  worker: boolean;
  workerFactory?: () => Worker;
  workerUrl?: string | URL;
  antialias: AntialiasMode;
  shadows: ShadowQuality;
  environment: EnvironmentSpec;
  environmentIntensity: number;
  postprocessing: Required<PostFXOptions>;
  normalMaps: boolean;
  theme: string;
  surface?: string;
  customColorset: any | null;
  texture?: string;
  material?: string;
  sounds: boolean;
  volume: number;
  strength: number;
  gravityMultiplier: number;
  lightIntensity: number;
  baseScale: number;
  timestep: number;
  iterationLimit: number;
  maxPixelRatio: number;
  queueMode: QueueMode;
  dracoPath?: string;
  colorSpotlight: number;
  soundDieMaterial: string;
}

const AntialiasSchema = v.picklist(['none', 'msaa', 'smaa']);
const ShadowQualitySchema = v.picklist(['none', 'low', 'medium', 'high']);
const QueueModeSchema = v.picklist(['serial', 'replace', 'parallel']);

export const DiceBoxOptionsSchema = v.looseObject({
  assetPath: v.optional(v.string()),
  worker: v.optional(v.boolean()),
  antialias: v.optional(AntialiasSchema),
  shadows: v.optional(v.union([ShadowQualitySchema, v.boolean()])),
  environmentIntensity: v.optional(v.number()),
  normalMaps: v.optional(v.boolean()),
  theme: v.optional(v.string()),
  surface: v.optional(v.string()),
  texture: v.optional(v.string()),
  material: v.optional(v.string()),
  sounds: v.optional(v.boolean()),
  volume: v.optional(v.number()),
  strength: v.optional(v.number()),
  gravityMultiplier: v.optional(v.number()),
  lightIntensity: v.optional(v.number()),
  baseScale: v.optional(v.number()),
  timestep: v.optional(v.number()),
  iterationLimit: v.optional(v.number()),
  maxPixelRatio: v.optional(v.number()),
  queueMode: v.optional(QueueModeSchema),
  dracoPath: v.optional(v.string()),
  colorSpotlight: v.optional(v.number()),
});

export function validateOptions(options: unknown): DiceBoxOptions {
  const result = v.safeParse(DiceBoxOptionsSchema, options ?? {});
  if (!result.success) {
    console.warn(
      '[dice] Invalid DiceBoxOptions:',
      result.issues.map((issue) => `${issue.path?.map((p) => p.key).join('.')}: ${issue.message}`).join('; ')
    );
    return (options ?? {}) as DiceBoxOptions;
  }
  return result.output as DiceBoxOptions;
}

const warnedDeprecations = new Set<string>();

function warnDeprecated(oldKey: string, newKey: string): void {
  if (warnedDeprecations.has(oldKey)) return;
  warnedDeprecations.add(oldKey);
  console.warn(`[dice] "${oldKey}" is deprecated, use "${newKey}" instead`);
}

export function normalizeShadows(shadows: ShadowQuality | boolean | undefined): ShadowQuality {
  if (shadows === undefined) return 'medium';
  if (shadows === true) return 'medium';
  if (shadows === false) return 'none';
  return shadows;
}

export function normalizeOptions(rawOptions: DiceBoxOptions): NormalizedConfig {
  const options = validateOptions(rawOptions);
  const pick = <T>(newVal: T | undefined, oldVal: T | undefined, oldKey: string, newKey: string): T | undefined => {
    if (newVal !== undefined) return newVal;
    if (oldVal !== undefined) {
      warnDeprecated(oldKey, newKey);
      return oldVal;
    }
    return undefined;
  };

  return {
    assetPath: options.assetPath ?? './',
    worker: options.worker ?? true,
    workerFactory: options.workerFactory,
    workerUrl: options.workerUrl,
    antialias: options.antialias ?? 'smaa',
    shadows: normalizeShadows(options.shadows),
    environment: options.environment ?? 'none',
    environmentIntensity: options.environmentIntensity ?? 1,
    postprocessing: {
      enabled: options.postprocessing?.enabled ?? false,
      bloom: options.postprocessing?.bloom ?? false,
      outline: options.postprocessing?.outline ?? false,
      antialias: options.antialias ?? options.postprocessing?.antialias ?? 'smaa',
    },
    normalMaps: options.normalMaps ?? false,
    theme: pick(options.theme, options.theme_colorset, 'theme_colorset', 'theme') ?? 'default',
    surface: pick(options.surface, options.theme_surface, 'theme_surface', 'surface'),
    customColorset: pick(options.customColorset, options.theme_customColorset, 'theme_customColorset', 'customColorset') ?? null,
    texture: pick(options.texture, options.theme_texture, 'theme_texture', 'texture'),
    material: pick(options.material, options.theme_material, 'theme_material', 'material'),
    sounds: options.sounds ?? false,
    volume: options.volume ?? 100,
    strength: options.strength ?? 1,
    gravityMultiplier: pick(options.gravityMultiplier, options.gravity_multiplier, 'gravity_multiplier', 'gravityMultiplier') ?? 400,
    lightIntensity: pick(options.lightIntensity, options.light_intensity, 'light_intensity', 'lightIntensity') ?? 0.7,
    baseScale: options.baseScale ?? 100,
    timestep: pick(options.timestep, options.framerate, 'framerate', 'timestep') ?? 1 / 60,
    iterationLimit: options.iterationLimit ?? 1000,
    maxPixelRatio: options.maxPixelRatio ?? 2,
    queueMode: options.queueMode ?? 'serial',
    dracoPath: options.dracoPath,
    colorSpotlight: pick(options.colorSpotlight, options.color_spotlight, 'color_spotlight', 'colorSpotlight') ?? 0xefdfd5,
    soundDieMaterial: options.sound_dieMaterial ?? 'plastic',
  };
}

export function configToOptions(c: NormalizedConfig): DiceBoxOptions {
  return {
    assetPath: c.assetPath,
    worker: c.worker,
    workerFactory: c.workerFactory,
    workerUrl: c.workerUrl,
    antialias: c.antialias,
    shadows: c.shadows,
    environment: c.environment,
    environmentIntensity: c.environmentIntensity,
    postprocessing: c.postprocessing,
    normalMaps: c.normalMaps,
    theme: c.theme,
    surface: c.surface,
    customColorset: c.customColorset,
    texture: c.texture,
    material: c.material,
    sounds: c.sounds,
    volume: c.volume,
    strength: c.strength,
    gravityMultiplier: c.gravityMultiplier,
    lightIntensity: c.lightIntensity,
    baseScale: c.baseScale,
    timestep: c.timestep,
    iterationLimit: c.iterationLimit,
    maxPixelRatio: c.maxPixelRatio,
    queueMode: c.queueMode,
    dracoPath: c.dracoPath,
    colorSpotlight: c.colorSpotlight,
    sound_dieMaterial: c.soundDieMaterial,
  };
}
