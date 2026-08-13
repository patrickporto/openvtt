import * as THREE from 'three';

import { DICE_GEOM } from '../constants/dice';
import type { DiceShape } from '../constants/dice';
import type { DicePhysicsShape } from './shapes';

export type DiceGeometryType = THREE.BufferGeometry & {
  cannon_shape?: DicePhysicsShape;
  faceNormals?: Float32Array;
};

export interface ChamferResult {
  vectors: THREE.Vector3[];
  faces: number[][];
}

export type GeometryCreationFunction = (
  vertices: number[][],
  faces: number[][],
  radius: number,
  tab: number,
  af: number,
  chamfer: number
) => DiceGeometryType;

export function computeFaceNormals(geom: DiceGeometryType): Float32Array {
  if (geom.faceNormals) return geom.faceNormals;
  const normals = geom.getAttribute('normal')?.array;
  const groups = geom.groups ?? [];
  const index = geom.index;
  const out = new Float32Array(groups.length * 3);
  if (normals) {
    for (let i = 0; i < groups.length; i++) {
      const start = groups[i].start ?? i * 3;
      const vertexIndex = index ? index.getX(start) : start;
      out[i * 3] = normals[vertexIndex * 3];
      out[i * 3 + 1] = normals[vertexIndex * 3 + 1];
      out[i * 3 + 2] = normals[vertexIndex * 3 + 2];
    }
  }
  geom.faceNormals = out;
  return out;
}

export function createChamferedGeometry(vectors: THREE.Vector3[], faces: number[][], chamfer: number): ChamferResult {
  const chamferVectors: THREE.Vector3[] = [];
  const chamferFaces: number[][] = [];
  const cornerFaces = new Array(vectors.length);
  for (let i = 0; i < vectors.length; ++i) cornerFaces[i] = [];
  for (let i = 0; i < faces.length; ++i) {
    const ii = faces[i];
    const fl = ii.length - 1;
    const centerPoint = new THREE.Vector3();
    const face = new Array(fl);
    for (let j = 0; j < fl; ++j) {
      const vv = vectors[ii[j]].clone();
      centerPoint.add(vv);
      cornerFaces[ii[j]].push((face[j] = chamferVectors.push(vv) - 1));
    }
    centerPoint.divideScalar(fl);
    for (let j = 0; j < fl; ++j) {
      const vv = chamferVectors[face[j]];
      vv.subVectors(vv, centerPoint)
        .multiplyScalar(chamfer)
        .addVectors(vv, centerPoint);
    }
    face.push(ii[fl]);
    chamferFaces.push(face);
  }
  for (let i = 0; i < faces.length - 1; ++i) {
    for (let j = i + 1; j < faces.length; ++j) {
      const pairs: [number, number][] = [];
      let lastm = -1;
      for (let m = 0; m < faces[i].length - 1; ++m) {
        const n = faces[j].indexOf(faces[i][m]);
        if (n >= 0 && n < faces[j].length - 1) {
          if (lastm >= 0 && m != lastm + 1) pairs.unshift([i, m], [j, n]);
          else pairs.push([i, m], [j, n]);
          lastm = m;
        }
      }
      if (pairs.length != 4) continue;
      chamferFaces.push([
        chamferFaces[pairs[0][0]][pairs[0][1]],
        chamferFaces[pairs[1][0]][pairs[1][1]],
        chamferFaces[pairs[3][0]][pairs[3][1]],
        chamferFaces[pairs[2][0]][pairs[2][1]],
        -1,
      ]);
    }
  }
  for (let i = 0; i < cornerFaces.length; ++i) {
    const cf = cornerFaces[i];
    const face: number[] = [cf[0]];
    let count = cf.length - 1;
    while (count) {
      for (let m = faces.length; m < chamferFaces.length; ++m) {
        const index = chamferFaces[m].indexOf(face[face.length - 1]);
        if (index >= 0 && index < 4) {
          const nextVertex = chamferFaces[m][index === 0 ? 3 : index - 1];
          if (cf.indexOf(nextVertex) >= 0) {
            face.push(nextVertex);
            break;
          }
        }
      }
      --count;
    }
    face.push(-1);
    chamferFaces.push(face);
  }
  return { vectors: chamferVectors, faces: chamferFaces };
}

export function createBasicDiceGeometry(
  vectors: THREE.Vector3[],
  faces: number[][],
  radius: number,
  tab: number,
  af: number
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();

  for (let i = 0; i < vectors.length; ++i) {
    vectors[i] = vectors[i].multiplyScalar(radius);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  let materialIndex: number;
  let faceFirstVertexIndex = 0;

  for (let i = 0; i < faces.length; ++i) {
    const ii = faces[i];
    const fl = ii.length - 1;
    const aa = (Math.PI * 2) / fl;
    materialIndex = ii[fl] + 1;
    for (let j = 0; j < fl - 2; ++j) {
      positions.push(...vectors[ii[0]].toArray());
      positions.push(...vectors[ii[j + 1]].toArray());
      positions.push(...vectors[ii[j + 2]].toArray());

      cb.subVectors(vectors[ii[j + 2]], vectors[ii[j + 1]]);
      ab.subVectors(vectors[ii[0]], vectors[ii[j + 1]]);
      cb.cross(ab);
      cb.normalize();

      normals.push(...cb.toArray());
      normals.push(...cb.toArray());
      normals.push(...cb.toArray());

      uvs.push(
        (Math.cos(af) + 1 + tab) / 2 / (1 + tab),
        (Math.sin(af) + 1 + tab) / 2 / (1 + tab)
      );
      uvs.push(
        (Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
        (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab)
      );
      uvs.push(
        (Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
        (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab)
      );
    }

    const numOfVertices = (fl - 2) * 3;
    for (let i = 0; i < numOfVertices / 3; i++) {
      geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
      faceFirstVertexIndex += 3;
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  return geom;
}

export function createD10Geometry(
  vectors: THREE.Vector3[],
  faces: number[][],
  radius: number,
  tab: number,
  af: number
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();

  for (let i = 0; i < vectors.length; ++i) {
    vectors[i] = vectors[i].multiplyScalar(radius);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  let materialIndex: number;
  let faceFirstVertexIndex = 0;

  for (let i = 0; i < faces.length; ++i) {
    const ii = faces[i];
    const fl = ii.length - 1;
    const aa = (Math.PI * 2) / fl;
    materialIndex = ii[fl] + 1;
    const w = 0.65;
    const h = 0.85;
    const v0 = 1 - 1 * h;
    const v1 = 1 - (0.895 / 1.105) * h;
    const v2 = 1;

    for (let j = 0; j < fl - 2; ++j) {
      positions.push(...vectors[ii[0]].toArray());
      positions.push(...vectors[ii[j + 1]].toArray());
      positions.push(...vectors[ii[j + 2]].toArray());

      cb.subVectors(vectors[ii[j + 2]], vectors[ii[j + 1]]);
      ab.subVectors(vectors[ii[0]], vectors[ii[j + 1]]);
      cb.cross(ab);
      cb.normalize();

      normals.push(...cb.toArray());
      normals.push(...cb.toArray());
      normals.push(...cb.toArray());

      if (faces[i][faces[i].length - 1] == -1 || j >= 2) {
        uvs.push(
          (Math.cos(af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(af) + 1 + tab) / 2 / (1 + tab)
        );
        uvs.push(
          (Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab)
        );
        uvs.push(
          (Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab)
        );
      } else if (j == 0) {
        uvs.push(0.5 - w / 2, v1);
        uvs.push(0.5, v0);
        uvs.push(0.5 + w / 2, v1);
      } else if (j == 1) {
        uvs.push(0.5 - w / 2, v1);
        uvs.push(0.5 + w / 2, v1);
        uvs.push(0.5, v2);
      }
    }

    const numOfVertices = (fl - 2) * 3;
    for (let i = 0; i < numOfVertices / 3; i++) {
      geom.addGroup(faceFirstVertexIndex, 3, materialIndex);
      faceFirstVertexIndex += 3;
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  return geom;
}

export function createProceduralGeometry(
  vertices: number[][],
  faces: number[][],
  radius: number,
  tab: number,
  af: number,
  chamfer: number
): DiceGeometryType {
  const vectors = new Array(vertices.length);
  for (let i = 0; i < vectors.length; ++i) {
    vectors[i] = new THREE.Vector3().fromArray(vertices[i]).normalize();
  }
  const cg = createChamferedGeometry(vectors, faces, chamfer);
  const baseGeom = faces.length !== 10
    ? createBasicDiceGeometry(cg.vectors, cg.faces, radius, tab, af)
    : createD10Geometry(cg.vectors, cg.faces, radius, tab, af);

  const geom = baseGeom as DiceGeometryType;
  geom.name = 'd' + faces.length;
  computeFaceNormals(geom);
  return geom;
}

export function createGeometryForShape(
  type: DiceShape,
  radius: number,
  geometryFunction: GeometryCreationFunction = createProceduralGeometry
): DiceGeometryType | null {
  switch (type) {
    case 'd2': {
      const geom = new THREE.CylinderGeometry(
        1 * radius,
        1 * radius,
        0.1 * radius,
        32
      ) as DiceGeometryType;
      computeFaceNormals(geom);
      return geom;
    }
    case 'd4':
      return geometryFunction(DICE_GEOM.d4.vertices, DICE_GEOM.d4.faces, radius, -0.1, (Math.PI * 7) / 6, 0.96);
    case 'd6':
      return geometryFunction(DICE_GEOM.d6.vertices, DICE_GEOM.d6.faces, radius, 0.1, Math.PI / 4, 0.96);
    case 'd8':
      return geometryFunction(DICE_GEOM.d8.vertices, DICE_GEOM.d8.faces, radius, 0, -Math.PI / 4 / 2, 0.965);
    case 'd10':
      return geometryFunction(DICE_GEOM.d10.vertices, DICE_GEOM.d10.faces, radius, 0.3, Math.PI, 0.945);
    case 'd12':
      return geometryFunction(DICE_GEOM.d12.vertices, DICE_GEOM.d12.faces, radius, 0.2, -Math.PI / 4 / 2, 0.968);
    case 'd20':
      return geometryFunction(DICE_GEOM.d20.vertices, DICE_GEOM.d20.faces, radius, -0.2, -Math.PI / 4 / 2, 0.955);
    default: {
      console.error(`Geometry for ${type} is not available`);
      return null;
    }
  }
}
