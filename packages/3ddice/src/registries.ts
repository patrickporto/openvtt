import { THEMES } from './constants/themes';
import type { DiceTheme } from './constants/themes';
import { TEXTURELIST } from './constants/texturelist';
import type { TextureEntry } from './constants/texturelist';
import { MATERIALTYPES } from './constants/materialtypes';
import type { MaterialOptions } from './constants/materialtypes';

const themeRegistry = new Map<string, DiceTheme>(Object.entries(THEMES));
const textureRegistry = new Map<string, TextureEntry>(Object.entries(TEXTURELIST));
const materialRegistry = new Map<string, MaterialOptions>(Object.entries(MATERIALTYPES));

export function registerTheme(id: string, theme: DiceTheme): void {
  themeRegistry.set(id, theme);
}

export function getTheme(id: string): DiceTheme | undefined {
  return themeRegistry.get(id) ?? themeRegistry.get('default');
}

export function hasTheme(id: string): boolean {
  return themeRegistry.has(id);
}

export function listThemes(): Record<string, DiceTheme> {
  return Object.fromEntries(themeRegistry);
}

export function registerTexture(id: string, texture: TextureEntry): void {
  textureRegistry.set(id, texture);
}

export function getTexture(id: string | string[]): TextureEntry | undefined {
  const key = Array.isArray(id) ? id[0] : id;
  return textureRegistry.get(key) ?? textureRegistry.get('none');
}

export function listTextures(): Record<string, TextureEntry> {
  return Object.fromEntries(textureRegistry);
}

export function registerMaterial(id: string, material: MaterialOptions): void {
  materialRegistry.set(id, material);
}

export function getMaterial(id: string): MaterialOptions | undefined {
  return materialRegistry.get(id);
}

export function listMaterials(): Record<string, MaterialOptions> {
  return Object.fromEntries(materialRegistry);
}

export interface DiceModelRegistration {
  type: string;
  url: string;
  scale?: number;
  physicsShape?: 'auto' | 'sphere' | 'box' | { kind: string; [key: string]: any };
  draco?: boolean;
}

const modelRegistry = new Map<string, DiceModelRegistration>();

export function registerDiceModel(registration: DiceModelRegistration): void {
  modelRegistry.set(registration.type, registration);
}

export function getDiceModel(type: string): DiceModelRegistration | undefined {
  return modelRegistry.get(type);
}
