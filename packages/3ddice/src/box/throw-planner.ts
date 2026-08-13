import { DICE } from '../constants/dice';
import { POSITION } from '../constants/position';
import type { DiceObject } from '../services/dice-mesh';
import type { ParsedNotation } from '../services/notation';
import type { DisplayConfig, Vector2D } from './types';

export interface ThrowPlannerDeps {
  getDisplay: () => DisplayConfig;
  getPreset: (type: string) => DiceObject;
}

export class ThrowPlanner {
  constructor(private deps: ThrowPlannerDeps) {}

  vectorRand({ x, y }: Vector2D): Vector2D {
    const angle = (Math.random() * Math.PI) / 5 - Math.PI / 5 / 2;
    const vec = {
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
    };
    if (vec.x == 0) vec.x = 0.01;
    if (vec.y == 0) vec.y = 0.01;
    return vec;
  }

  plan(parsed: ParsedNotation, vector: Vector2D, boost: number, dist: number, startIndex: number): number {
    const display = this.deps.getDisplay();
    let index = startIndex;

    for (const set of parsed.set) {
      const diceobj = this.deps.getPreset(set.type);
      if (!diceobj) continue;
      const numdice = set.num;

      for (let k = 0; k < numdice; k++) {
        const vec = this.vectorRand(vector);
        vec.x /= dist;
        vec.y /= dist;

        const pos = {
          x: display.containerWidth * (vec.x > 0 ? -1 : 1) * POSITION.WALL_SCALE,
          y: display.containerHeight * (vec.y > 0 ? -1 : 1) * POSITION.WALL_SCALE,
          z: Math.random() * (DICE.RANDOM_Z_MAX - DICE.RANDOM_Z_MIN) + DICE.RANDOM_Z_MIN,
        };

        const projector = Math.abs(vec.x / vec.y);
        if (projector > 1.0) pos.y /= projector;
        else pos.x *= projector;

        const velvec = this.vectorRand(vector);
        velvec.x /= dist;
        velvec.y /= dist;
        let velocity, angle, axis;

        if (diceobj.shape != 'd2') {
          velocity = { x: velvec.x * boost, y: velvec.y * boost, z: -10 };
          angle = {
            x: -(Math.random() * vec.y * 5 + diceobj.inertia * vec.y),
            y: Math.random() * vec.x * 5 + diceobj.inertia * vec.x,
            z: 0,
          };
          axis = { x: Math.random(), y: Math.random(), z: Math.random(), a: Math.random() };
        } else {
          velocity = {
            x: (velvec.x * boost) / 10,
            y: (velvec.y * boost) / 10,
            z: DICE.COIN_VELOCITY_Z,
          };
          angle = {
            x: DICE.COIN_ANGLE_X * diceobj.inertia,
            y: DICE.COIN_ANGLE_Y * diceobj.inertia,
            z: 0,
          };
          axis = { x: 1, y: 1, z: Math.random(), a: Math.random() };
        }

        parsed.vectors.push({
          index: index++,
          type: diceobj.type ?? set.type,
          op: set.op,
          sid: set.sid,
          gid: set.gid,
          glvl: set.glvl,
          func: set.func,
          args: set.args,
          style: set.style,
          pos,
          velocity,
          angle,
          axis,
        });
      }
    }

    return index;
  }
}
