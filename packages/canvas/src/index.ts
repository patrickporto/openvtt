/* ------------------------------- núcleo ------------------------------- */

export { Canvas, CORE_LAYER_ORDER } from './canvas';
export type { CanvasOptions } from './canvas';
export type { CanvasLike } from './placeables/PlaceableObject';

/* ------------------------------ plugins ------------------------------- */

export { PluginManager } from './plugins/PluginManager';
export { definePlugin } from './plugins/types';
export type {
  CanvasPlugin,
  PluginContext,
  DocumentTypeDefinition,
  DocumentBehavior,
  EasedDragOptions,
  ToolContribution,
  LayerContribution,
  TransformAdapter,
  ResizeRect,
  WindowDockEdge,
  WindowDockTarget,
  WindowConstraints,
  WindowStateKind,
  WindowContribution,
  WindowRegistrar,
} from './plugins/types';

export { DocumentRegistry } from './documents';

/* ---------------------------- context menu ----------------------------- */

export { ContextMenuManager, normalizeItems } from './contextmenu/ContextMenuManager';
export { menu, menuWhen, MENU_ORDER } from './contextmenu/builders';
export { menuControls, sliderRow, colorRow, textRow } from './contextmenu/controls';
export type { MenuSliderSpec, MenuColorSpec, MenuTextSpec } from './contextmenu/controls';
export type {
  ContextMenuItem,
  ContextMenuAction,
  ContextMenuToggle,
  ContextMenuSeparator,
  ContextMenuCustom,
  ContextMenuItemBase,
  ContextMenuContext,
  ContextMenuPredicate,
  ContextMenuTarget,
  ContextMenuContribution,
  ContextMenuCloseReason,
} from './contextmenu/types';

/* ------------------------------- layers ------------------------------- */

export { CanvasLayer } from './layers/CanvasLayer';
export type { CanvasLayerOptions } from './layers/CanvasLayer';
export { InteractionLayer } from './layers/InteractionLayer';
export type { InteractionLayerOptions } from './layers/InteractionLayer';
export { PlaceablesLayer } from './layers/PlaceablesLayer';
export type { PlaceablesLayerOptions, LayerMutation } from './layers/PlaceablesLayer';
export { BackgroundLayer } from './layers/BackgroundLayer';
export type { BackgroundLayerOptions } from './layers/BackgroundLayer';
export { LayerManager } from './layers/LayerManager';
export type { CanvasLayerState, LayerMoveDirection, LayerRegisterOptions } from './layers/LayerManager';

/* ------------------------------ placeables ---------------------------- */

export { PlaceableObject } from './placeables/PlaceableObject';
export type { PlaceableObjectOptions, CanvasAnimationLike, SelectionFrame } from './placeables/PlaceableObject';

/* ------------------------------- grid --------------------------------- */

export { GridRenderer, GridService } from './grid';
export type { StrokeOptions, CellShape, CellIndex } from './grid';
export { GridPath } from './gridPath';
export type { GridPathOptions } from './gridPath';

/* ----------------------------- viewport ------------------------------- */

export { CanvasViewport } from './viewport';
export type { ViewportState, CanvasViewportOptions } from './viewport';

/* ------------------------------- input -------------------------------- */

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

/* ---------------------------- state machine --------------------------- */

export { StateNode } from './state/StateNode';
export type { StateNodeConstructor, StateEventName } from './state/StateNode';

/* -------------------------------- tools ------------------------------- */

export { Tool } from './tools/Tool';
export { ToolManager } from './tools/ToolManager';
export type { ToolOptions } from './tools/ToolManager';
export { RootState } from './tools/RootState';
export { SelectTool } from './tools/select';
export { HandTool } from './tools/hand';
export { EraserTool } from './tools/eraser';

/* --------------------------- layers utilitárias ----------------------- */

export { PreviewLayer } from './preview/PreviewLayer';

export { HandlesLayer, isTransformable } from './handles/HandlesLayer';
export type {
  HandleInfo,
  CoreHandleInfo,
  CustomHandleInfo,
  HandleEntry,
  HandleCorner,
  AABB,
} from './handles/HandlesLayer';

export { HistoryManager } from './history/HistoryManager';

/* ---------------------------------- ui -------------------------------- */

export {
  defineCanvasElements,
  OpenVTTLayerPanel,
  LAYER_PANEL_TAG,
  OpenVTTContextMenu,
  CONTEXT_MENU_TAG,
} from './ui';

/* ------------------------------ infra --------------------------------- */

export { CanvasAnimation, Easing } from './animation';
export type { AnimationOptions } from './animation';

export { CONFIG, configure } from './config';
export type { CanvasConfig, GridConfig, GridType } from './config';

export { GridTypeSchema, GridSchema, SceneDataSchema, LockableSchemaEntries, parseScene } from './schemas';
export type { SceneData, GridData, SceneDataInput } from './schemas';

export { createCanvasBus, dynamicBus } from './bus';
export type { CanvasBus, CanvasEventMap, CanvasHookMap, DynamicBusPort } from './bus';

export {
  newId,
  toHex,
  clamp,
  lerp,
  distance,
  easeTowards,
  rectanglesIntersect,
} from './utils';
export type { Rectangle } from './utils';
