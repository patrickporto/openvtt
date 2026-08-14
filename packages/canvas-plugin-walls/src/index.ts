export { wallsPlugin, WallsPlugin } from './plugin';
export type { WallToolOptions } from './plugin';
export { Wall } from './placeables/Wall';
export { WallTool } from './tools/WallTool';
export { WallCurveSchema, WallSegmentSchema, WallDataSchema } from './schemas';
export type { WallData, WallDataInput, WallSegmentData, WallSegmentDataInput } from './schemas';
export {
  chainSegments,
  curvePointAt,
  ellipsePoints,
  flattenSegment,
  pointToCurveDistance,
  rdpSimplify,
  rectPoints,
  segmentLength,
  splitSegment,
} from './geometry';
export type { CurvePoint, SegmentSpec } from './geometry';
export {
  findCoincidentEndpoints,
  findWallSegmentAt,
  listWallPoints,
  wallPointRoles,
  withPointAt,
} from './layers/WallsLayer';
export type { WallPointRef, WallPointRole, WallsLayer } from './layers/WallsLayer';
