import {
  deserializeStates,
  type BodyState,
  type PhysicsConfig,
  type PhysicsHost,
  type SpawnPayload,
  type StepResult,
  type Vector3Payload,
} from './types';

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
}

export class WorkerPhysicsHost implements PhysicsHost {
  #worker: Worker;
  #nextId = 1;
  #pending = new Map<number, PendingRequest>();
  #destroyed = false;

  constructor(worker: Worker) {
    this.#worker = worker;
    this.#worker.onmessage = (event: MessageEvent) => {
      const { id, ok, data, error } = event.data;
      const pending = this.#pending.get(id);
      if (!pending) return;
      this.#pending.delete(id);
      if (ok) {
        pending.resolve(data);
      } else {
        pending.reject(new Error(error ?? 'Worker request failed'));
      }
    };
    this.#worker.onerror = (event) => {
      const error = new Error(event.message ?? 'Physics worker error');
      for (const pending of this.#pending.values()) {
        pending.reject(error);
      }
      this.#pending.clear();
    };
  }

  #request(op: string, payload?: any): Promise<any> {
    if (this.#destroyed) return Promise.reject(new Error('Physics worker destroyed'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ id, op, payload });
    });
  }

  async init(config: PhysicsConfig, timestep?: number): Promise<void> {
    await this.#request('init', { config, timestep });
  }

  async setTimestep(timestep: number): Promise<void> {
    await this.#request('setTimestep', { timestep });
  }

  async updateBarriers(width: number, height: number, wallScale: number): Promise<void> {
    await this.#request('updateBarriers', { width, height, wallScale });
  }

  async spawnBatch(payloads: SpawnPayload[]): Promise<void> {
    await this.#request('spawnBatch', payloads);
  }

  async remove(indices: number[]): Promise<void> {
    await this.#request('remove', indices);
  }

  async clear(): Promise<void> {
    await this.#request('clear');
  }

  #unpackStepResult(data: any): StepResult {
    return {
      states: deserializeStates(new Float32Array(data.states)),
      allAsleep: data.allAsleep,
      collideEvents: data.collideEvents ?? [],
    };
  }

  async simulate(iterationLimit: number): Promise<StepResult> {
    return this.#unpackStepResult(await this.#request('simulate', { iterationLimit }));
  }

  async step(steps: number): Promise<StepResult> {
    return this.#unpackStepResult(await this.#request('step', { steps }));
  }

  async wake(indices: number[]): Promise<void> {
    await this.#request('wake', indices);
  }

  async applyImpulse(indices: number[], velocity: Vector3Payload, angularVelocity: Vector3Payload): Promise<void> {
    await this.#request('applyImpulse', { indices, velocity, angularVelocity });
  }

  async states(): Promise<BodyState[]> {
    return deserializeStates(new Float32Array(await this.#request('states')));
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    try {
      await this.#request('destroy');
    } catch {
    }
    this.#worker.terminate();
  }
}
