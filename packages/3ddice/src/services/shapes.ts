import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { DICE_GEOM } from '../constants/dice';
import type { DiceShape } from '../constants/dice';
import type { ShapeDescriptor } from '@openvtt/physics';
import type { DiceGeometryType } from './geometry';

export type DicePhysicsShape = CANNON.Cylinder | CANNON.ConvexPolyhedron;

export function createConvexShape(vertices: number[][], faces: number[][], radius: number): CANNON.ConvexPolyhedron {
  const vectors = new Array(vertices.length);
  for (let i = 0; i < vertices.length; ++i) {
    vectors[i] = new THREE.Vector3().fromArray(vertices[i]).normalize();
  }
  const cv = new Array(vertices.length);
  const cf = new Array(faces.length);
  for (let i = 0; i < vectors.length; ++i) {
    const v = vectors[i];
    cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
  }
  for (let i = 0; i < faces.length; ++i) {
    cf[i] = faces[i].slice(0, faces[i].length - 1);
  }
  return new CANNON.ConvexPolyhedron({ vertices: cv, faces: cf });
}

export function createCylinderShape(radius: number): CANNON.Cylinder {
  return new CANNON.Cylinder(1 * radius, 1 * radius, 0.1 * radius, 8);
}

export function physicsShapeForGeometry(type: DiceShape, radius: number): DicePhysicsShape | null {
  if (type === 'd2') return createCylinderShape(radius);
  const spec = DICE_GEOM[type as keyof typeof DICE_GEOM];
  if (!spec) return null;
  return createConvexShape(spec.vertices, spec.faces, radius);
}

export function attachPhysicsShape(geom: DiceGeometryType, shape: DicePhysicsShape): DiceGeometryType {
  geom.cannon_shape = shape;
  return geom;
}

export function shapeToDescriptor(shape: DicePhysicsShape): ShapeDescriptor | null {
  if (shape instanceof CANNON.Cylinder) {
    return {
      kind: 'cylinder',
      radiusTop: shape.radiusTop,
      radiusBottom: shape.radiusBottom,
      height: shape.height,
      segments: shape.numSegments ?? 8,
    };
  }
  if (shape instanceof CANNON.ConvexPolyhedron) {
    return {
      kind: 'convex',
      vertices: shape.vertices.map((v) => [v.x, v.y, v.z]),
      faces: shape.faces.map((f) => [...f]),
    };
  }
  return null;
}
