export { DiceBox, createDiceBox } from './box/dice-box';
export type { DiceBoxEvents } from './box/dice-box';
export {
  DiceBoxOptionsSchema,
  normalizeOptions,
  normalizeShadows,
  validateOptions,
} from './box/config';
export type { DiceBoxOptions, NormalizedConfig, QueueMode, ShadowQuality } from './box/config';
export type { DiceBoxDeps } from './box/deps';
export { RollQueue } from './box/roll-queue';
export { SoundManager } from './box/sounds';
export { SelectionController } from './box/selection';
export type { SelectionDeps } from './box/selection';
export { SceneRenderer } from './box/scene-renderer';
export type { EnvironmentRequest, SceneRendererInitOptions } from './box/scene-renderer';
export { LayoutController } from './box/layout';
export type { LayoutControllerDeps } from './box/layout';
export { PhysicsController } from './box/physics-controller';
export type { PhysicsControllerOptions } from './box/physics-controller';
export { DiceSpawner } from './box/spawner';
export type { DiceSpawnerDeps } from './box/spawner';
export { ThrowPlanner } from './box/throw-planner';
export type { ThrowPlannerDeps } from './box/throw-planner';
export { RollOrchestrator } from './box/roll-orchestrator';
export type { AnimState, RollOrchestratorDeps, RollTimingConfig, SelectorDie } from './box/roll-orchestrator';
export type { CameraHeights, DisplayConfig, Vector2D } from './box/types';

export { DiceNotation } from './services/notation';
export {
  CanonicalNotationParser,
  LegacyNotationParser,
  createDefaultNotationParser,
  mergeParsedNotation,
  rollExprToParsedNotation,
} from './services/notation';
export type { DiceSet, NotationObject, NotationParser, ParsedNotation } from './services/notation';
export { DicePreset } from './services/preset';
export { DicePresetRegistry, createDefaultPresetRegistry } from './services/preset-registry';
export { DiceColors } from './services/colors';
export type { ColorSet } from './services/colors';
export { DiceFactory } from './services/factory';
export type { DiceFactoryConfig, DiceFactoryDeps } from './services/factory';
export { DiceAssetLoaders } from './services/loaders';
export type { DiceLoadersOptions } from './services/loaders';
export { swapDiceFace, swapDiceFaceD4 } from './services/face-swap';
export type { FaceSwapDeps } from './services/face-swap';
export {
  BODY_SLEEP_STATE,
  BODY_TYPE_DYNAMIC,
  BODY_TYPE_KINEMATIC,
  createDiceMesh,
  createDiceMeshFromModel,
  createDieBodyState,
  createEmptyThrowVector,
} from './services/dice-mesh';
export type {
  DiceColorData,
  DiceMaterial,
  DiceMesh,
  DiceMeshBehavior,
  DiceObject,
  DiceResult,
  DiceSetStyle,
  DiceValues,
  DieBodyState,
  ThrowVector,
} from './services/dice-mesh';

export {
  DiceRegistries,
  createDiceRegistries,
  defaultRegistries,
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
  listDiceModels,
} from './registries';
export type { DiceModelRegistration, DiceRegistriesSeeds } from './registries';

export { DiceError, RollCancelledError, AssetLoadError } from './errors';
export { createDiceBus, diceContract, DieResultSchema, RollResultSchema, RerollContextSchema } from './bus';
export type { DiceBus, DiceBusEvents, RerollContext } from './bus';
export { buildDiceManifest } from './assets';
export type { DieResult, RollResult } from './results';

export { AssetManager } from '@openvtt/assets';
export type { AssetEntry, AssetManifest, AssetType, AssetsBus, StorageAdapter } from '@openvtt/assets';

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
