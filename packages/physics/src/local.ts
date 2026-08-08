import { CannonWorld } from './cannon-world';
import type {
  BodyState,
  PhysicsConfig,
  PhysicsHost,
  SpawnPayload,
  StepResult,
  Vector3Payload,
} from './types';

export class LocalPhysicsHost implements PhysicsHost {
  #world = new CannonWorld();
  #timestep = 1 / 60;

  setTimestep(timestep: number): void {
    this.#timestep = timestep;
  }

  init(config: PhysicsConfig): void {
    this.#world.init(config);
  }

  updateBarriers(width: number, height: number, wallScale: number): void {
    this.#world.updateBarriers(width, height, wallScale);
  }

  spawnBatch(payloads: SpawnPayload[]): void {
    this.#world.spawnBatch(payloads);
  }

  remove(indices: number[]): void {
    this.#world.remove(indices);
  }

  clear(): void {
    this.#world.clear();
  }

  simulate(iterationLimit: number): StepResult {
    return this.#world.simulate(iterationLimit, this.#timestep);
  }

  step(steps: number): StepResult {
    return this.#world.step(steps, this.#timestep);
  }

  wake(indices: number[]): void {
    this.#world.wake(indices);
  }

  applyImpulse(indices: number[], velocity: Vector3Payload, angularVelocity: Vector3Payload): void {
    this.#world.applyImpulse(indices, velocity, angularVelocity);
  }

  states(): BodyState[] {
    return this.#world.states();
  }

  destroy(): void {
    this.#world.clear();
  }
}
