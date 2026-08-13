# @openvtt/physics

Rigid-body physics powered by cannon-es, exposed behind a `PhysicsHost` interface with two interchangeable backends: a Web Worker host that keeps the main thread free, and a synchronous main-thread host used as a fallback. The package provides the world model used by `@openvtt/dice` (a static desk plane with four wall barriers), batched body spawning, fixed-timestep simulation with sleep detection, collision-event reporting, and typed-array state serialization for cheap worker/main-thread transfer.

**Version:** 0.1.0
**Peer dependencies:** `cannon-es`

## Installation

```bash
bun add @openvtt/physics cannon-es
```

```ts
import { createPhysicsHost } from '@openvtt/physics';
```

The package exposes two entry points: `'.'` (API) and `'./worker'` (the worker script entry, used when supplying a custom `workerUrl`).

See the [3D dice guide](../guides/3d-dice.md) for how this package fits into the dice pipeline.

## Quick start

```ts
import { createPhysicsHost, deserializeStates } from '@openvtt/physics';

const host = await createPhysicsHost({
  gravity: -9.8 * 400,
  friction: 0.6,
  deskRestitution: 0.5,
  barrierRestitution: 1.0,
  solverIterations: 14,
  sleepSpeedLimit: 75,
  sleepTimeLimit: 0.9,
  linearDamping: 0.1,
  angularDamping: 0.1,
});

host.updateBarriers(800, 600, 0.93);
host.spawnBatch([
  {
    index: 0,
    shape: { kind: 'convex', vertices, faces },
    mass: 300,
    pos: { x: 0, y: 0, z: 400 },
    velocity: { x: 0, y: 0, z: -2000 },
    angle: { x: 0.3, y: 0.1, z: 0 },
    axis: { x: 1, y: 0, z: 0, a: 0.5 },
  },
]);

const result = host.simulate(1000); // async on worker hosts
console.log(result.allAsleep, result.collideEvents);
```

## Types

### `ShapeDescriptor`

Describes the collision shape of a body.

```ts
type ShapeDescriptor =
  | { kind: 'convex'; vertices: number[][]; faces: number[][] }
  | { kind: 'cylinder'; radiusTop: number; radiusBottom: number; height: number; segments: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'box'; halfExtents: { x: number; y: number; z: number } };
```

### `PhysicsConfig`

World configuration passed to `createPhysicsHost` / `init`.

| Name | Type | Description |
|------|------|-------------|
| gravity | `number` | Gravity along the Z axis (the scene is Z-up). |
| friction | `number` | Contact friction. |
| deskRestitution | `number` | Bounciness of the desk plane. |
| barrierRestitution | `number` | Bounciness of the wall barriers. |
| solverIterations | `number` | cannon-es solver iterations per step. |
| sleepSpeedLimit | `number` | Speed below which bodies may sleep. |
| sleepTimeLimit | `number` | Seconds below the speed limit before sleeping. |
| linearDamping | `number` | Linear velocity damping (0–1). |
| angularDamping | `number` | Angular velocity damping (0–1). |

### `Vector3Payload`

```ts
interface Vector3Payload { x: number; y: number; z: number; }
```

### `SpawnPayload`

| Name | Type | Description |
|------|------|-------------|
| index | `number` | Body slot; re-spawning the same index replaces the existing body. |
| shape | `ShapeDescriptor` | Collision shape. |
| mass | `number` | Body mass. |
| shapeTag | `string` (optional) | Tag reported back in collision events. |
| pos | `Vector3Payload` | Initial position. |
| velocity | `Vector3Payload` | Initial linear velocity. |
| angle | `Vector3Payload` | Initial orientation (Euler angles). |
| axis | `{ x: number; y: number; z: number; a: number }` | Initial angular velocity as an axis and a magnitude in turns. |

### `BodyState`

| Name | Type | Description |
|------|------|-------------|
| index | `number` | Body slot. |
| position | `Vector3Payload` | Current position. |
| quaternion | `{ x; y; z; w }` | Current orientation. |
| sleepState | `number` | cannon-es sleep state; `2` means `SLEEPING`. |

### `CollideEvent`

| Name | Type | Description |
|------|------|-------------|
| index | `number` | Body index; `-1` for the desk or a barrier. |
| isBody | `boolean` | Whether the collision partner was a dynamic body. |
| shapeTag | `string` (optional) | Tag from the `SpawnPayload`, if any. |
| speed | `number` | Impact speed (used for sound volume). |
| step | `number` | Simulation step at which the collision occurred. |

### `StepResult`

| Name | Type | Description |
|------|------|-------------|
| states | `Float32Array` (serialized) | Serialized body states (see `deserializeStates`). |
| allAsleep | `boolean` | Whether every body is sleeping. |
| collideEvents | `CollideEvent[]` | Collisions since the previous call. |

## `PhysicsHost` interface

```ts
interface PhysicsHost {
  init(config: PhysicsConfig): void | Promise<void>;
  setTimestep?(timestep: number): void;
  updateBarriers(width: number, height: number, wallScale: number): void | Promise<void>;
  spawnBatch(payloads: SpawnPayload[]): void | Promise<void>;
  remove(indices: number[]): void | Promise<void>;
  clear(): void | Promise<void>;
  simulate(iterationLimit: number): StepResult | Promise<StepResult>;
  step(steps: number): StepResult | Promise<StepResult>;
  wake(indices: number[]): void | Promise<void>;
  applyImpulse(indices: number[], velocity: Vector3Payload, angularVelocity: Vector3Payload): void | Promise<void>;
  states(): BodyState[] | Float32Array | Promise<BodyState[] | Float32Array>;
  destroy(): void | Promise<void>;
}
```

Notes:

- `simulate` steps the world until all bodies are asleep or `iterationLimit` steps have elapsed; `allAsleep` in the result is always `true` once it returns.
- `spawnBatch` with an already-used `index` replaces that body.
- Worker-backed hosts return promises; the local host returns values synchronously.

## State serialization

### `serializeStates(states: BodyState[]): Float32Array`

Packs body states into a flat `Float32Array` (10 floats per body) for zero-copy transfer between worker and main thread.

### `deserializeStates(buffer: Float32Array): BodyState[]`

Unpacks a buffer produced by `serializeStates`.

## Implementations

### `class CannonWorld`

Direct wrapper around a cannon-es world. After `init`, the underlying world is available as the public `world` property. The world contains a static desk plane at `z = 0` plus four wall planes managed by `updateBarriers`.

### `class LocalPhysicsHost`

Synchronous `PhysicsHost` running on the main thread. Used directly or as the automatic fallback when worker creation fails.

### `class WorkerPhysicsHost`

Asynchronous `PhysicsHost` proxying to a worker.

```ts
class WorkerPhysicsHost {
  constructor(worker: Worker);
  init(config: PhysicsConfig, timestep?: number): Promise<void>;
}
```

## Host creation

### `PhysicsHostOptions`

| Name | Type | Default | Description |
|------|------|---------|-------------|
| worker | `boolean` | `true` | Prefer a Web Worker backend. |
| workerFactory | `() => Worker` | — | Custom worker constructor; takes precedence over `workerUrl`. |
| workerUrl | `string \| URL` | — | Custom worker script URL. |
| timestep | `number` | `1/60` | Fixed physics timestep in seconds. |
| onFallback | `(error: unknown) => void` | — | Called before falling back to the local host. |

### `createDefaultWorker(): Worker`

Creates the bundled physics worker:

```ts
new Worker(new URL('./physics.worker.js', import.meta.url), { type: 'module' });
```

### `createPhysicsHost(config, options?): Promise<PhysicsHost>`

Creates a host. A worker backend is preferred; if worker creation or initialization fails, `onFallback` is invoked and a `LocalPhysicsHost` is returned silently.

```ts
function createPhysicsHost(
  config: PhysicsConfig,
  options?: PhysicsHostOptions,
): Promise<PhysicsHost>;
```

```ts
const host = await createPhysicsHost(config, {
  onFallback: (err) => console.warn('physics on main thread', err),
});
```

## Step loop example

```ts
const step = await host.step(5); // max 5 substeps per frame on the consumer side
for (const event of step.collideEvents) {
  if (event.isBody) playImpactSound(event.speed);
}
const states = deserializeStates(step.states);
for (const body of states) {
  meshes[body.index].position.set(body.position.x, body.position.y, body.position.z);
  meshes[body.index].quaternion.set(
    body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
  );
}
```

## See also

- [3D dice guide](../guides/3d-dice.md)
- [Getting started](../guides/getting-started.md)
- [@openvtt/dice](./dice.md)
