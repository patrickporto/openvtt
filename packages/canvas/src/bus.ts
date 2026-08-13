import * as v from 'valibot';
import { createBus, type EventBus } from '@openvtt/events';
import { TokenDataSchema, TileDataSchema, DrawingDataSchema, WallDataSchema, LightDataSchema, TemplateDataSchema } from './schemas';

const PointSchema = v.object({ x: v.number(), y: v.number() });
const PointerSchema = v.object({
  x: v.number(),
  y: v.number(),
  button: v.optional(v.number()),
  shiftKey: v.optional(v.boolean()),
  ctrlKey: v.optional(v.boolean()),
});

const canvasEvents = {
  ready: v.object({ width: v.number(), height: v.number() }),
  destroy: v.object({}),
  blur: v.object({}),
  unblur: v.object({}),
  pan: PointSchema,
  zoom: v.object({ scale: v.number() }),
  pointerdown: PointerSchema,
  pointermove: PointerSchema,
  pointerup: PointerSchema,
  'tool:changed': v.object({ id: v.string(), path: v.string() }),
  'history:change': v.object({ canUndo: v.boolean(), canRedo: v.boolean() }),
  'layers:change': v.object({
    layers: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        visible: v.boolean(),
        opacity: v.number(),
        locked: v.boolean(),
      }),
    ),
  }),
  'fog:change': v.object({
    enabled: v.boolean(),
    darkness: v.number(),
    playerView: v.boolean(),
  }),
  'lighting:change': v.object({
    enabled: v.boolean(),
    darkness: v.number(),
  }),
  ping: v.object({ x: v.number(), y: v.number() }),
  measure: v.object({
    pixels: v.number(),
    units: v.number(),
    x1: v.number(),
    y1: v.number(),
    x2: v.number(),
    y2: v.number(),
    segments: v.optional(v.number()),
  }),
};

const objectEvents = {
  'token:create': TokenDataSchema,
  'token:update': TokenDataSchema,
  'token:delete': v.object({ id: v.string() }),
  'token:moved': v.object({ id: v.string(), x: v.number(), y: v.number() }),
  'token:selected': v.object({ ids: v.array(v.string()) }),
  'tile:create': TileDataSchema,
  'tile:update': TileDataSchema,
  'tile:delete': v.object({ id: v.string() }),
  'drawing:create': DrawingDataSchema,
  'drawing:delete': v.object({ id: v.string() }),
  'wall:create': WallDataSchema,
  'wall:update': WallDataSchema,
  'wall:delete': v.object({ id: v.string() }),
  'light:create': LightDataSchema,
  'light:update': LightDataSchema,
  'light:delete': v.object({ id: v.string() }),
  'template:create': TemplateDataSchema,
  'template:update': TemplateDataSchema,
  'template:delete': v.object({ id: v.string() }),
};

const canvasHooks = {
  beforeDraw: {
    strategy: 'syncWaterfall' as const,
    schema: v.object({ scene: v.unknown() }),
  },
};

export type CanvasEventMap = typeof canvasEvents & typeof objectEvents;
export type CanvasHookMap = typeof canvasHooks;
export type CanvasBus = EventBus<CanvasEventMap, CanvasHookMap>;

export function createCanvasBus(): CanvasBus {
  return createBus<CanvasEventMap, CanvasHookMap>(
    { namespace: 'canvas', events: { ...canvasEvents, ...objectEvents }, hooks: canvasHooks },
    { validate: 'throw' },
  );
}
