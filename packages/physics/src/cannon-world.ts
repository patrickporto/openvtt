import * as CANNON from 'cannon-es';
import type {
  BodyState,
  CollideEvent,
  PhysicsConfig,
  ShapeDescriptor,
  SpawnPayload,
  StepResult,
  Vector3Payload,
} from './types';

interface TrackedBody {
  index: number;
  body: CANNON.Body;
  shapeTag?: string;
}

type TaggedBody = CANNON.Body & { bodyIndex?: number; shapeTag?: string };

export class CannonWorld {
  world!: CANNON.World;
  #config!: PhysicsConfig;
  #bodyMaterial!: CANNON.Material;
  #bodies = new Map<number, TrackedBody>();
  #desk?: CANNON.Body;
  #topWall?: CANNON.Body;
  #bottomWall?: CANNON.Body;
  #leftWall?: CANNON.Body;
  #rightWall?: CANNON.Body;
  #collideEvents: CollideEvent[] = [];
  #stepNumber = 0;

  init(config: PhysicsConfig): void {
    this.#config = config;
    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, config.gravity);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    (this.world.solver as CANNON.GSSolver).iterations = config.solverIterations;
    this.world.allowSleep = true;

    this.#bodyMaterial = new CANNON.Material();
    const deskMaterial = new CANNON.Material();
    const barrierMaterial = new CANNON.Material();

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(deskMaterial, this.#bodyMaterial, {
        friction: config.friction,
        restitution: config.deskRestitution,
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(barrierMaterial, this.#bodyMaterial, {
        friction: config.friction,
        restitution: config.barrierRestitution,
      })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.#bodyMaterial, this.#bodyMaterial, {
        friction: config.friction,
        restitution: config.deskRestitution,
      })
    );

    this.#desk = new CANNON.Body({ allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: deskMaterial });
    this.world.addBody(this.#desk);

    this.#topWall = new CANNON.Body({ allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrierMaterial });
    this.#topWall.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    this.world.addBody(this.#topWall);

    this.#bottomWall = new CANNON.Body({ allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrierMaterial });
    this.#bottomWall.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(this.#bottomWall);

    this.#leftWall = new CANNON.Body({ allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrierMaterial });
    this.#leftWall.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
    this.world.addBody(this.#leftWall);

    this.#rightWall = new CANNON.Body({ allowSleep: false, mass: 0, shape: new CANNON.Plane(), material: barrierMaterial });
    this.#rightWall.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
    this.world.addBody(this.#rightWall);
  }

  updateBarriers(width: number, height: number, wallScale: number): void {
    this.#topWall?.position.set(0, height * wallScale, 0);
    this.#bottomWall?.position.set(0, -height * wallScale, 0);
    this.#leftWall?.position.set(width * wallScale, 0, 0);
    this.#rightWall?.position.set(-width * wallScale, 0, 0);
  }

  #createShape(shape: ShapeDescriptor): CANNON.Shape {
    switch (shape.kind) {
      case 'convex':
        return new CANNON.ConvexPolyhedron({
          vertices: shape.vertices.map((v) => new CANNON.Vec3(v[0], v[1], v[2])),
          faces: shape.faces.map((f) => [...f]),
        });
      case 'cylinder':
        return new CANNON.Cylinder(shape.radiusTop, shape.radiusBottom, shape.height, shape.segments);
      case 'sphere':
        return new CANNON.Sphere(shape.radius);
      case 'box':
        return new CANNON.Box(new CANNON.Vec3(...shape.halfExtents));
    }
  }

  #onCollide = (event: any): void => {
    const body = event.body as TaggedBody;
    const target = event.target as TaggedBody;
    if (!body || body.mass <= 0) {
      const speed = target ? target.velocity.length() : 0;
      if (speed > 0) {
        this.#collideEvents.push({
          index: target?.bodyIndex ?? -1,
          isBody: false,
          speed,
          step: this.#stepNumber,
        });
      }
      return;
    }
    this.#collideEvents.push({
      index: body.bodyIndex ?? -1,
      isBody: true,
      shapeTag: body.shapeTag,
      speed: body.velocity.length(),
      step: this.#stepNumber,
    });
  };

  spawnBatch(payloads: SpawnPayload[]): void {
    for (const payload of payloads) {
      this.remove([payload.index]);

      const body = new CANNON.Body({
        allowSleep: true,
        sleepSpeedLimit: this.#config.sleepSpeedLimit,
        sleepTimeLimit: this.#config.sleepTimeLimit,
        mass: payload.mass,
        shape: this.#createShape(payload.shape),
        material: this.#bodyMaterial,
      }) as TaggedBody;
      body.type = CANNON.Body.DYNAMIC;
      body.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
      body.quaternion.setFromAxisAngle(
        new CANNON.Vec3(payload.axis.x, payload.axis.y, payload.axis.z),
        payload.axis.a * Math.PI * 2
      );
      body.angularVelocity.set(payload.angle.x, payload.angle.y, payload.angle.z);
      body.velocity.set(payload.velocity.x, payload.velocity.y, payload.velocity.z);
      body.linearDamping = this.#config.linearDamping;
      body.angularDamping = this.#config.angularDamping;
      body.sleepState = 0;
      body.bodyIndex = payload.index;
      body.shapeTag = payload.shapeTag;
      body.addEventListener('collide', this.#onCollide);

      this.world.addBody(body);
      this.#bodies.set(payload.index, { index: payload.index, body, shapeTag: payload.shapeTag });
    }
  }

  remove(indices: number[]): void {
    for (const index of indices) {
      const tracked = this.#bodies.get(index);
      if (tracked) {
        tracked.body.removeEventListener('collide', this.#onCollide);
        this.world.removeBody(tracked.body);
        this.#bodies.delete(index);
      }
    }
  }

  clear(): void {
    this.remove([...this.#bodies.keys()]);
    this.#collideEvents = [];
  }

  wake(indices: number[]): void {
    for (const index of indices) {
      const tracked = this.#bodies.get(index);
      if (!tracked) continue;
      tracked.body.wakeUp();
      tracked.body.type = CANNON.Body.DYNAMIC;
    }
  }

  applyImpulse(indices: number[], velocity: Vector3Payload, angularVelocity: Vector3Payload): void {
    for (const index of indices) {
      const tracked = this.#bodies.get(index);
      if (!tracked) continue;
      tracked.body.wakeUp();
      tracked.body.type = CANNON.Body.DYNAMIC;
      tracked.body.angularVelocity = new CANNON.Vec3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
      tracked.body.velocity = new CANNON.Vec3(velocity.x, velocity.y, velocity.z);
    }
  }

  #allAsleep(): boolean {
    for (const { body } of this.#bodies.values()) {
      if (body.type === CANNON.Body.KINEMATIC) continue;
      if (body.sleepState !== CANNON.Body.SLEEPING) return false;
    }
    return true;
  }

  #getStates(): BodyState[] {
    const states: BodyState[] = [];
    for (const { index, body } of this.#bodies.values()) {
      states.push({
        index,
        position: { x: body.position.x, y: body.position.y, z: body.position.z },
        quaternion: {
          x: body.quaternion.x,
          y: body.quaternion.y,
          z: body.quaternion.z,
          w: body.quaternion.w,
        },
        sleepState: body.sleepState,
      });
    }
    return states;
  }

  #drainCollideEvents(): CollideEvent[] {
    const events = this.#collideEvents;
    this.#collideEvents = [];
    return events;
  }

  step(steps: number, timestep: number): StepResult {
    for (let i = 0; i < steps; i++) {
      this.world.step(timestep);
      this.#stepNumber++;
    }
    return {
      states: this.#getStates(),
      allAsleep: this.#allAsleep(),
      collideEvents: this.#drainCollideEvents(),
    };
  }

  simulate(iterationLimit: number, timestep: number): StepResult {
    let iteration = 0;
    while (iteration < iterationLimit && !this.#allAsleep()) {
      this.world.step(timestep);
      this.#stepNumber++;
      iteration++;
    }
    return {
      states: this.#getStates(),
      allAsleep: true,
      collideEvents: this.#drainCollideEvents(),
    };
  }

  states(): BodyState[] {
    return this.#getStates();
  }
}
