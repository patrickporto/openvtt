import type { DiceBus } from '../bus';
import type { DiceRegistries } from '../registries';
import type { DiceColors } from '../services/colors';
import type { DiceFactory } from '../services/factory';
import type { NotationParser } from '../services/notation';
import type { DicePresetRegistry } from '../services/preset-registry';
import type { LayoutController } from './layout';
import type { PhysicsController } from './physics-controller';
import type { RollOrchestrator } from './roll-orchestrator';
import type { RollQueue } from './roll-queue';
import type { SceneRenderer } from './scene-renderer';
import type { SelectionController } from './selection';
import type { SoundManager } from './sounds';
import type { DiceSpawner } from './spawner';
import type { ThrowPlanner } from './throw-planner';

export interface DiceBoxDeps {
  bus?: DiceBus;
  registries?: DiceRegistries;
  presets?: DicePresetRegistry;
  parser?: NotationParser;
  colors?: DiceColors;
  factory?: DiceFactory;
  sounds?: SoundManager;
  queue?: RollQueue;
  selection?: SelectionController;
  spawner?: DiceSpawner;
  physics?: PhysicsController;
  planner?: ThrowPlanner;
  sceneRenderer?: SceneRenderer;
  layout?: LayoutController;
  orchestrator?: RollOrchestrator;
}
