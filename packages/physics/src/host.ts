import { LocalPhysicsHost } from './local';
import { WorkerPhysicsHost } from './worker-host';
import type { PhysicsConfig, PhysicsHost } from './types';

export interface PhysicsHostOptions {
  worker?: boolean;
  workerFactory?: () => Worker;
  workerUrl?: string | URL;
  timestep?: number;
  onFallback?: (error: unknown) => void;
}

export function createDefaultWorker(): Worker {
  return new Worker(new URL('./physics.worker.js', import.meta.url), { type: 'module' });
}

export async function createPhysicsHost(
  config: PhysicsConfig,
  options: PhysicsHostOptions = {}
): Promise<PhysicsHost> {
  const timestep = options.timestep ?? 1 / 60;

  if (options.worker !== false && typeof Worker !== 'undefined') {
    try {
      const worker =
        options.workerFactory?.() ??
        (options.workerUrl
          ? new Worker(options.workerUrl, { type: 'module' })
          : createDefaultWorker());
      const host = new WorkerPhysicsHost(worker);
      await host.init(config, timestep);
      return host;
    } catch (error) {
      options.onFallback?.(error);
    }
  }

  const host = new LocalPhysicsHost();
  host.setTimestep(timestep);
  await host.init(config);
  return host;
}
