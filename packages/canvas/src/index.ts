export { Canvas } from './canvas';
export type { CanvasOptions } from './canvas';
export type { CanvasLike } from './placeables/PlaceableObject';

export { CanvasLayer } from './layers/CanvasLayer';
export type { CanvasLayerOptions } from './layers/CanvasLayer';
export { InteractionLayer } from './layers/InteractionLayer';
export type { InteractionLayerOptions } from './layers/InteractionLayer';
export { PlaceablesLayer } from './layers/PlaceablesLayer';
export type { PlaceablesLayerOptions } from './layers/PlaceablesLayer';
export { BackgroundLayer } from './layers/BackgroundLayer';
export type { BackgroundLayerOptions } from './layers/BackgroundLayer';
export { GridLayer } from './layers/GridLayer';
export type { GridLayerOptions } from './layers/GridLayer';
export { TokenLayer } from './layers/TokenLayer';
export { TileLayer } from './layers/TileLayer';
export { DrawingsLayer } from './layers/DrawingsLayer';
export { WallsLayer, wallPointRoles, withPointAt } from './layers/WallsLayer';
export type { WallPointRef, WallPointRole } from './layers/WallsLayer';
export { LayerManager } from './layers/LayerManager';
export type { CanvasLayerState, LayerMoveDirection } from './layers/LayerManager';

export { PlaceableObject } from './placeables/PlaceableObject';
export type { PlaceableObjectOptions } from './placeables/PlaceableObject';
export { Token } from './placeables/Token';
export { Tile } from './placeables/Tile';
export { Drawing } from './placeables/Drawing';
export { Wall } from './placeables/Wall';

export { GridRenderer } from './grid';
export type { StrokeOptions, CellShape } from './grid';

export { CanvasViewport } from './viewport';
export type { ViewportState, CanvasViewportOptions } from './viewport';

export { InputsManager } from './input/InputsManager';
export type { InputsManagerDeps } from './input/InputsManager';
export { classifyWheelZoom } from './input/wheel';
export type { WheelClassifyInput } from './input/wheel';
export type {
  Point,
  PointerDevice,
  PointerTarget,
  CanvasPointerInfo,
  CanvasClickInfo,
  CanvasWheelInfo,
  CanvasPinchInfo,
  CanvasKeyInfo,
} from './input/types';

export { StateNode } from './state/StateNode';
export type { StateNodeConstructor, StateEventName } from './state/StateNode';

export { Tool, defaultToolOptions } from './tools/Tool';
export type { ToolOptions, WallDrawMode } from './tools/Tool';
export { ToolManager } from './tools/ToolManager';
export { RootState } from './tools/RootState';
export { SelectTool } from './tools/select';
export { HandTool } from './tools/hand';
export { TokenTool, WallTool, TileTool, DrawTool, ShapeTool } from './tools/create';
export { MeasureTool } from './tools/measure';
export { EraserTool } from './tools/eraser';
export { FogRevealTool, FogPaintTool } from './tools/fog';

export { PreviewLayer } from './preview/PreviewLayer';

export { HandlesLayer, isTransformable } from './handles/HandlesLayer';
export type { HandleInfo, HandleCorner, AABB } from './handles/HandlesLayer';

export { FogOfWarLayer } from './fog/FogOfWarLayer';
export { computeVisibilityPolygon, raySegmentT } from './fog/visibility';
export type { VisionSegment } from './fog/visibility';

export { defineCanvasElements, OpenVTTLayerPanel, OpenVTTFogPanel } from './ui';

export { HistoryManager } from './history/HistoryManager';

export { CanvasAnimation, Easing } from './animation';
export type { AnimationOptions } from './animation';

export {
  CONFIG,
  configure,
} from './config';
export type { CanvasConfig, GridConfig, GridType } from './config';

export {
  GridTypeSchema,
  GridSchema,
  TokenDataSchema,
  TileDataSchema,
  DrawingDataSchema,
  WallSegmentSchema,
  WallDataSchema,
  SceneDataSchema,
  parseScene,
  parseToken,
} from './schemas';
export type {
  TokenData,
  TileData,
  DrawingData,
  DrawingType,
  WallSegmentData,
  WallData,
  SceneData,
  GridData,
  TokenDataInput,
  TileDataInput,
  DrawingDataInput,
  WallSegmentDataInput,
  WallDataInput,
  SceneDataInput,
} from './schemas';

export {
  curvePointAt,
  flattenSegment,
  segmentLength,
  pointToCurveDistance,
  splitSegment,
  rdpSimplify,
  chainSegments,
  ellipsePoints,
  rectPoints,
} from './geometry';
export type { CurvePoint, SegmentSpec } from './geometry';

export { createCanvasBus } from './bus';
export type { CanvasBus, CanvasEventMap, CanvasHookMap } from './bus';

export {
  newId,
  toHex,
  clamp,
  lerp,
  distance,
  rectanglesIntersect,
} from './utils';
export type { Rectangle } from './utils';
