export { DiceBox, createDiceBox } from './box/dice-box';
export type { DiceBoxEvents } from './box/dice-box';
export {
  DiceBoxOptionsSchema,
  normalizeOptions,
  normalizeShadows,
  validateOptions,
} from './box/config';
export type { DiceBoxOptions, NormalizedConfig, QueueMode, ShadowQuality } from './box/config';
export { RollQueue } from './box/roll-queue';
export { SoundManager } from './box/sounds';
export { SelectionController } from './box/selection';
export type { SelectionDeps } from './box/selection';

export { DiceNotation } from './services/notation';
export { DicePreset } from './services/preset';
export { DiceColors } from './services/colors';
export { DiceFactory } from './services/factory';

export {
  registerTheme,
  getTheme,
  hasTheme,
  listThemes,
  registerTexture,
  getTexture,
  listTextures,
  registerMaterial,
  getMaterial,
  listMaterials,
  registerDiceModel,
  getDiceModel,
} from './registries';
export type { DiceModelRegistration } from './registries';

export { DiceError, RollCancelledError, AssetLoadError } from './errors';
export { createDiceBus, diceContract, DieResultSchema, RollResultSchema, RerollContextSchema } from './bus';
export type { DiceBus, DiceBusEvents, RerollContext } from './bus';

export { createPhysicsHost } from '@openvtt/physics';
export type {
  PhysicsHost,
  PhysicsConfig,
  ShapeDescriptor,
  SpawnPayload,
  BodyState,
  StepResult,
  CollideEvent,
} from '@openvtt/physics';

export type { AntialiasMode, BloomOptions, OutlineOptions, PostFXOptions } from '@openvtt/render3d';
export type { EnvironmentSpec, EnvironmentName, EnvironmentHandle } from '@openvtt/render3d';

export { DICE, DICE_GEOM, DiceShapes } from './constants/dice';
export type { DiceShape } from './constants/dice';
export { THEMES } from './constants/themes';
export type { DiceTheme, DiceStyle } from './constants/themes';
export { TEXTURELIST } from './constants/texturelist';
export type { TextureEntry } from './constants/texturelist';
export { MATERIALTYPES } from './constants/materialtypes';
export type { MaterialOptions, MaterialType } from './constants/materialtypes';
export { PHYSICS } from './constants/physics';
export { MATERIALS } from './constants/materials';
export { CAMERA } from './constants/camera';
export { POSITION } from './constants/position';
export { ANIMATION } from './constants/animation';

export interface DieResult {
  type: string;
  sides: number;
  id: number;
  value: number;
  label: string;
  reason: string;
}

export interface RollResult {
  id: string;
  notation: string;
  sets: Array<{
    num: number;
    type: string;
    sides: number;
    rolls: DieResult[];
    total: number;
  }>;
  modifier: number;
  total: number;
}
