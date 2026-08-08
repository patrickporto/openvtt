export type ShapeDescriptor =
  | { kind: 'convex'; vertices: number[][]; faces: number[][] }
  | { kind: 'cylinder'; radiusTop: number; radiusBottom: number; height: number; segments: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'box'; halfExtents: [number, number, number] };

export interface PhysicsConfig {
  gravity: number;
  friction: number;
  deskRestitution: number;
  barrierRestitution: number;
  solverIterations: number;
  sleepSpeedLimit: number;
  sleepTimeLimit: number;
  linearDamping: number;
  angularDamping: number;
}

export interface Vector3Payload {
  x: number;
  y: number;
  z: number;
}

export interface SpawnPayload {
  index: number;
  shape: ShapeDescriptor;
  mass: number;
  shapeTag?: string;
  pos: Vector3Payload;
  velocity: Vector3Payload;
  angle: Vector3Payload;
  axis: { x: number; y: number; z: number; a: number };
}

export interface BodyState {
  index: number;
  position: Vector3Payload;
  quaternion: { x: number; y: number; z: number; w: number };
  sleepState: number;
}

export interface CollideEvent {
  index: number;
  isBody: boolean;
  shapeTag?: string;
  speed: number;
  step: number;
}

export interface StepResult {
  states: BodyState[];
  allAsleep: boolean;
  collideEvents: CollideEvent[];
}

export interface PhysicsHost {
  init(config: PhysicsConfig): Promise<void> | void;
  setTimestep?(timestep: number): Promise<void> | void;
  updateBarriers(width: number, height: number, wallScale: number): Promise<void> | void;
  spawnBatch(payloads: SpawnPayload[]): Promise<void> | void;
  remove(indices: number[]): Promise<void> | void;
  clear(): Promise<void> | void;
  simulate(iterationLimit: number): Promise<StepResult> | StepResult;
  step(steps: number): Promise<StepResult> | StepResult;
  wake(indices: number[]): Promise<void> | void;
  applyImpulse(indices: number[], velocity: Vector3Payload, angularVelocity: Vector3Payload): Promise<void> | void;
  states(): Promise<BodyState[]> | BodyState[];
  destroy(): Promise<void> | void;
}

export function serializeStates(states: BodyState[]): Float32Array {
  const buffer = new Float32Array(states.length * 10);
  states.forEach((state, i) => {
    const o = i * 10;
    buffer[o] = state.index;
    buffer[o + 1] = state.position.x;
    buffer[o + 2] = state.position.y;
    buffer[o + 3] = state.position.z;
    buffer[o + 4] = state.quaternion.x;
    buffer[o + 5] = state.quaternion.y;
    buffer[o + 6] = state.quaternion.z;
    buffer[o + 7] = state.quaternion.w;
    buffer[o + 8] = state.sleepState;
    buffer[o + 9] = 0;
  });
  return buffer;
}

export function deserializeStates(buffer: Float32Array): BodyState[] {
  const states: BodyState[] = [];
  for (let o = 0; o + 9 < buffer.length; o += 10) {
    states.push({
      index: buffer[o],
      position: { x: buffer[o + 1], y: buffer[o + 2], z: buffer[o + 3] },
      quaternion: { x: buffer[o + 4], y: buffer[o + 5], z: buffer[o + 6], w: buffer[o + 7] },
      sleepState: buffer[o + 8],
    });
  }
  return states;
}
