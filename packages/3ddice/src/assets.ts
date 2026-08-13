import type { AssetEntry, AssetManifest } from '@openvtt/assets';
import { defaultRegistries, type DiceRegistries } from './registries';
import { DIE_MATERIAL_COUNTS, SURFACE_COUNTS } from './box/sounds';
import type { NormalizedConfig } from './box/config';
import type { DiceStyle } from './constants/themes';

const ROUGHNESS_FILES: Record<string, string> = {
  roughnessMap_fingerprint: 'finger.webp',
  roughnessMap_metal: 'metal.webp',
  roughnessMap_wood: 'wood.webp',
  roughnessMap_stone: 'stone.webp',
};

function styleTextureNames(style?: Partial<DiceStyle>): string[] {
  const texture = style?.texture;
  if (!texture) return [];
  return Array.isArray(texture) ? texture : [texture];
}

export function buildDiceManifest(config: NormalizedConfig, surface: string, registries: DiceRegistries = defaultRegistries): AssetManifest {
  const assets: AssetEntry[] = [];
  const seen = new Set<string>();
  const push = (entry: AssetEntry) => {
    if (seen.has(entry.url)) return;
    seen.add(entry.url);
    assets.push(entry);
  };

  const theme = registries.getTheme(config.theme);
  const styles: (Partial<DiceStyle> | undefined)[] = [theme?.dice, theme?.d20, theme?.boon, theme?.bane];

  const textureNames = new Set<string>();
  for (const style of styles) {
    for (const name of styleTextureNames(style)) textureNames.add(name);
  }
  if (config.texture) {
    for (const name of Array.isArray(config.texture) ? config.texture : [config.texture]) {
      textureNames.add(name);
    }
  }

  let soundDieMaterial = config.soundDieMaterial;
  for (const name of textureNames) {
    const texture = registries.getTexture(name);
    if (!texture) continue;
    if (texture.material?.match(/wood|metal/)) {
      soundDieMaterial = texture.material;
    }
    if (texture.source) {
      push({ id: `texture/${name}`, url: texture.source, type: 'texture', priority: 10 });
    }
    if (texture.source_bump) {
      push({ id: `texture-bump/${name}`, url: texture.source_bump, type: 'texture', priority: 6 });
    }
  }

  const materialNames = new Set<string>();
  for (const style of styles) {
    if (style?.material) materialNames.add(style.material);
  }
  if (config.material) materialNames.add(config.material);
  for (const name of materialNames) {
    const material = registries.getMaterial(name);
    const file = material?.roughnessMap ? ROUGHNESS_FILES[material.roughnessMap] : undefined;
    if (file) {
      push({ id: `roughness/${file}`, url: `roughness-map/${file}`, type: 'texture', priority: 5 });
    }
  }

  const env = config.environment;
  if (typeof env === 'string' && env !== 'none') {
    push({ id: `environment/${env}`, url: `environments/${env}.hdr`, type: 'hdr', priority: 8 });
  } else if (typeof env === 'object' && 'source' in env && env.source) {
    push({ id: 'environment/custom', url: env.source, type: 'hdr', priority: 8 });
  } else if (typeof env === 'object' && 'cubeMap' in env && env.cubeMap?.length === 6) {
    env.cubeMap.forEach((face, i) => {
      push({ id: `environment/cubemap/${i}`, url: face, type: 'texture', priority: 8 });
    });
  }
  theme?.cubeMap?.forEach((face, i) => {
    push({ id: `theme-cubemap/${i}`, url: face, type: 'texture', priority: 8 });
  });

  if (config.sounds) {
    const surfaceCount = SURFACE_COUNTS[surface] ?? 7;
    for (let i = 1; i <= surfaceCount; i++) {
      push({ id: `sound/surface/${surface}/${i}`, url: `sounds/surfaces/surface_${surface}${i}.mp3`, type: 'audio', priority: 3 });
    }
    for (const material of new Set(['coin', soundDieMaterial])) {
      const count = DIE_MATERIAL_COUNTS[material] ?? 6;
      for (let i = 1; i <= count; i++) {
        push({ id: `sound/dicehit/${material}/${i}`, url: `sounds/dicehit/dicehit_${material}${i}.mp3`, type: 'audio', priority: 3 });
      }
    }
  }

  for (const [type, model] of Object.entries(registries.listDiceModels())) {
    push({ id: `model/${type}`, url: model.url, type: 'model', lazy: true });
  }

  return {
    name: 'dice',
    version: '1',
    baseUrl: config.assetPath,
    assets,
  };
}
