import { CannonWorld } from './cannon-world';
import { serializeStates } from './types';
import type { PhysicsConfig, SpawnPayload } from './types';

interface WorkerRequest {
  id: number;
  op: string;
  payload?: any;
}

const world = new CannonWorld();
let timestep = 1 / 60;

const ctx = self as unknown as Worker;

function respond(id: number, data: any, transfer: Transferable[] = []): void {
  ctx.postMessage({ id, ok: true, data }, { transfer });
}

function respondError(id: number, error: unknown): void {
  ctx.postMessage({
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

function packStepResult(result: ReturnType<CannonWorld['step']>) {
  const states = serializeStates(result.states);
  return {
    data: {
      states: states.buffer,
      allAsleep: result.allAsleep,
      collideEvents: result.collideEvents,
    },
    transfer: [states.buffer],
  };
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, op, payload } = event.data;
  try {
    switch (op) {
      case 'init': {
        if (payload.timestep !== undefined) timestep = payload.timestep;
        world.init(payload.config as PhysicsConfig);
        respond(id, null);
        break;
      }
      case 'setTimestep': {
        timestep = payload.timestep;
        respond(id, null);
        break;
      }
      case 'updateBarriers': {
        world.updateBarriers(payload.width, payload.height, payload.wallScale);
        respond(id, null);
        break;
      }
      case 'spawnBatch': {
        world.spawnBatch(payload as SpawnPayload[]);
        respond(id, null);
        break;
      }
      case 'remove': {
        world.remove(payload as number[]);
        respond(id, null);
        break;
      }
      case 'clear': {
        world.clear();
        respond(id, null);
        break;
      }
      case 'wake': {
        world.wake(payload as number[]);
        respond(id, null);
        break;
      }
      case 'applyImpulse': {
        world.applyImpulse(payload.indices, payload.velocity, payload.angularVelocity);
        respond(id, null);
        break;
      }
      case 'step': {
        const { data, transfer } = packStepResult(world.step(payload.steps, timestep));
        respond(id, data, transfer);
        break;
      }
      case 'simulate': {
        const { data, transfer } = packStepResult(world.simulate(payload.iterationLimit, timestep));
        respond(id, data, transfer);
        break;
      }
      case 'states': {
        const states = serializeStates(world.states());
        respond(id, states.buffer, [states.buffer]);
        break;
      }
      case 'destroy': {
        world.clear();
        respond(id, null);
        (ctx as any).close();
        break;
      }
      default:
        respondError(id, new Error(`Unknown op: ${op}`));
    }
  } catch (error) {
    respondError(id, error);
  }
};
