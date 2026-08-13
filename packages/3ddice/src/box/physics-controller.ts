import * as THREE from 'three';

import type {
  BodyState,
  PhysicsConfig,
  PhysicsHost,
  SpawnPayload,
  StepResult,
} from '@openvtt/physics';
import { createPhysicsHost } from '@openvtt/physics';

import { PHYSICS } from '../constants/physics';
import { MATERIALS } from '../constants/materials';
import { POSITION } from '../constants/position';
import { DiceError } from '../errors';
import {
  BODY_TYPE_DYNAMIC,
  BODY_TYPE_KINEMATIC,
  type DiceMesh,
} from '../services/dice-mesh';
import type { DiceFactory } from '../services/factory';

export interface PhysicsControllerOptions {
  worker: boolean;
  workerFactory?: () => Worker;
  workerUrl?: string | URL;
  timestep: number;
  gravityMultiplier: number;
}

export class PhysicsController {
  #host?: PhysicsHost;

  get active(): boolean {
    return this.#host !== undefined;
  }

  async initialize(options: PhysicsControllerOptions, width: number, height: number): Promise<void> {
    const physicsConfig: PhysicsConfig = {
      gravity: PHYSICS.GRAVITY_MULTIPLIER * options.gravityMultiplier,
      friction: MATERIALS.FRICTION,
      deskRestitution: MATERIALS.DESK_RESTITUTION,
      barrierRestitution: MATERIALS.BARRIER_RESTITUTION,
      solverIterations: PHYSICS.SOLVER_ITERATIONS,
      sleepSpeedLimit: PHYSICS.SLEEP_SPEED_LIMIT,
      sleepTimeLimit: PHYSICS.SLEEP_TIME_LIMIT,
      linearDamping: PHYSICS.LINEAR_DAMPING,
      angularDamping: PHYSICS.ANGULAR_DAMPING,
    };

    this.#host = await createPhysicsHost(physicsConfig, {
      worker: options.worker,
      workerFactory: options.workerFactory,
      workerUrl: options.workerUrl,
      timestep: options.timestep,
      onFallback: (error) =>
        console.warn('[dice] Physics worker unavailable, falling back to main thread', error),
    });

    await this.#host.updateBarriers(width, height, POSITION.WALL_SCALE);
  }

  updateBarriers(width: number, height: number): void {
    void this.#host?.updateBarriers(width, height, POSITION.WALL_SCALE);
  }

  #requireHost(): PhysicsHost {
    if (!this.#host) throw new DiceError('Physics not initialized', 'PHYSICS_NOT_INITIALIZED');
    return this.#host;
  }

  async spawnBatch(payloads: SpawnPayload[]): Promise<void> {
    await this.#requireHost().spawnBatch(payloads);
  }

  async remove(indices: number[]): Promise<void> {
    await this.#requireHost().remove(indices);
  }

  clear(): void {
    void this.#host?.clear();
  }

  async step(steps: number): Promise<StepResult> {
    return this.#requireHost().step(steps);
  }

  async simulate(iterationLimit: number): Promise<StepResult> {
    return this.#requireHost().simulate(iterationLimit);
  }

  async tossReroll(indices: number[]): Promise<void> {
    await this.#requireHost().applyImpulse(indices, PHYSICS.REROLL_VELOCITY, PHYSICS.REROLL_ANGULAR);
  }

  destroy(): void {
    void this.#host?.destroy();
    this.#host = undefined;
  }

  buildSpawnPayloads(dice: DiceMesh[], factory: Pick<DiceFactory, 'getShapeDescriptor'>): SpawnPayload[] {
    const payloads: SpawnPayload[] = [];
    for (let i = 0; i < dice.length; i++) {
      const dicemesh = dice[i];
      const vectordata = dicemesh.notation;
      const shape = factory.getShapeDescriptor(vectordata.type);
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

  applyStates(states: BodyState[], dice: DiceMesh[]): void {
    for (const state of states) {
      const dicemesh = dice[state.index];
      if (!dicemesh) continue;
      dicemesh.position.set(state.position.x, state.position.y, state.position.z);
      dicemesh.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
      if (dicemesh.body) {
        dicemesh.body.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
        dicemesh.body.sleepState = state.sleepState;
      }
    }
  }

  markAllKinematic(dice: DiceMesh[]): void {
    for (const dicemesh of dice) {
      if (dicemesh?.body) {
        dicemesh.rerolling = false;
        dicemesh.body.type = BODY_TYPE_KINEMATIC;
      }
    }
  }

  resetMeshesToInitial(payloads: SpawnPayload[], dice: DiceMesh[]): void {
    for (const payload of payloads) {
      const dicemesh = dice[payload.index];
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
        dicemesh.body.type = BODY_TYPE_DYNAMIC;
      }
    }
  }
}
