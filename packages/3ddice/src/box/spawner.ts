import * as THREE from 'three';

import type { ShadowQuality } from './config';
import type { DiceFactory } from '../services/factory';
import type { DiceColors } from '../services/colors';
import {
  createDieBodyState,
  type DiceMesh,
  type ThrowVector,
} from '../services/dice-mesh';

export interface DiceSpawnerConfig {
  theme: string;
  shadows: ShadowQuality;
}

export interface DiceSpawnerDeps {
  scene: THREE.Scene;
  factory: DiceFactory;
  colors: DiceColors;
  getConfig: () => DiceSpawnerConfig;
}

export class DiceSpawner {
  readonly dice: DiceMesh[] = [];

  constructor(private deps: DiceSpawnerDeps) {}

  async spawn(vectordata: ThrowVector): Promise<DiceMesh | null> {
    const config = this.deps.getConfig();

    let dicemesh: DiceMesh | null;
    if (vectordata.style && config.theme) {
      const styleColorData = await this.deps.colors.getColorSetForDiceType(
        config.theme,
        vectordata.style
      );
      dicemesh = await this.deps.factory.createWithColorSet(vectordata.type, styleColorData);
    } else {
      dicemesh = await this.deps.factory.create(vectordata.type);
    }
    if (!dicemesh) return null;

    dicemesh.notation = vectordata;
    dicemesh.result = [];
    dicemesh.stopped = 0;
    dicemesh.castShadow = config.shadows !== 'none';
    dicemesh.body = createDieBodyState();

    this.deps.scene.add(dicemesh);
    this.dice.push(dicemesh);
    return dicemesh;
  }

  detach(mesh: DiceMesh): void {
    this.deps.scene.remove(mesh);
  }

  removeAll(): void {
    let dice: DiceMesh | undefined;
    while ((dice = this.dice.pop())) {
      this.deps.scene.remove(dice);
      this.disposeMesh(dice);
    }
  }

  disposeMesh(dice: DiceMesh): void {
    if (dice.userData?.fromModel) return;
    if (dice.geometry?.userData?.owned) {
      dice.geometry.dispose();
    }
    const materials = Array.isArray(dice.material) ? dice.material : dice.material ? [dice.material] : [];
    materials.forEach((mat: THREE.Material) => mat.dispose());
  }
}
