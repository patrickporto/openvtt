import * as v from 'valibot';
import { createBus, type EventBus } from '@openvtt/events';

const PointSchema = v.object({ x: v.number(), y: v.number() });
const PointerSchema = v.object({
  x: v.number(),
  y: v.number(),
  button: v.optional(v.number()),
  shiftKey: v.optional(v.boolean()),
  ctrlKey: v.optional(v.boolean()),
});

/** Eventos do núcleo: ciclo de vida, input, tools, layers, histórico, seleção e documentos genéricos. */
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
  ping: v.object({ x: v.number(), y: v.number() }),
  'tool:changed': v.object({ id: v.string(), path: v.string() }),
  'tool:registered': v.object({ id: v.string() }),
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
  'selection:change': v.object({ ids: v.array(v.string()) }),
  'plugin:registered': v.object({ id: v.string() }),
  'document:type': v.object({ type: v.string() }),
  'document:create': v.looseObject({ type: v.string(), id: v.string() }),
  'document:update': v.looseObject({ type: v.string(), id: v.string() }),
  'document:delete': v.object({ type: v.string(), id: v.string() }),
  'document:moved': v.object({ type: v.string(), id: v.string(), x: v.number(), y: v.number() }),
};

const SegmentSchema = v.object({ a: PointSchema, b: PointSchema });

const VisionSourceSchema = v.object({
  x: v.number(),
  y: v.number(),
  radius: v.number(),
});

const LightSourceSchema = v.object({
  x: v.number(),
  y: v.number(),
  dim: v.number(),
  bright: v.optional(v.number(), 0),
  color: v.optional(v.union([v.number(), v.string()])),
});

const SelectPointerSchema = v.looseObject({
  x: v.number(),
  y: v.number(),
  button: v.optional(v.number(), 0),
  shiftKey: v.optional(v.boolean(), false),
  ctrlKey: v.optional(v.boolean(), false),
  handled: v.optional(v.boolean(), false),
});

const SelectHoverSchema = v.looseObject({
  x: v.number(),
  y: v.number(),
  cursor: v.optional(v.nullable(v.string()), null),
});

/**
 * Hooks do núcleo — o barramento de capacidades entre plugins:
 * - `beforeDraw`: transforma/valida a cena antes do draw.
 * - `movement:segments` / `sight:segments`: plugins (ex.: walls) contribuem
 *   segmentos bloqueadores; o core testa colisão e os plugins de fog/lighting
 *   calculam visão/iluminação sem conhecer walls.
 * - `vision:sources` / `light:sources`: plugins (ex.: tokens, lights)
 *   contribuem emissores; fog/lighting consomem.
 * - `select:pointerdown` (bail): plugins interceptam o clique da Select tool
 *   (ex.: portas). Retornar `{...payload, handled: true}` interrompe.
 * - `select:hovercursor` (bail): plugins definem o cursor de hover.
 */
const canvasHooks = {
  beforeDraw: {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({ scene: v.unknown() }),
  },
  /** Disparado no draw() após viewport/grid — plugins preparam recursos da cena. */
  'scene:setup': {
    strategy: 'sync' as const,
    schema: v.object({ width: v.number(), height: v.number() }),
  },
  /** Disparado no início do tearDown da cena — plugins liberam recursos. */
  'scene:teardown': {
    strategy: 'sync' as const,
    schema: v.object({}),
  },
  /** Pede recomposição de overlays derivados (fog, iluminação) após mudanças. */
  'scene:refresh': {
    strategy: 'sync' as const,
    schema: v.object({}),
  },
  'movement:segments': {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({ from: PointSchema, to: PointSchema, segments: v.array(SegmentSchema) }),
  },
  'sight:segments': {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({ segments: v.array(SegmentSchema) }),
  },
  'vision:sources': {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({ sources: v.array(VisionSourceSchema) }),
  },
  'light:sources': {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({ sources: v.array(LightSourceSchema) }),
  },
  'select:pointerdown': {
    strategy: 'syncBail' as const,
    schema: SelectPointerSchema,
  },
  'select:hovercursor': {
    strategy: 'syncBail' as const,
    schema: SelectHoverSchema,
  },
  /** Duplo clique na Select tool (bail) — ex.: split de wall no ponto clicado. */
  'select:doubleclick': {
    strategy: 'syncBail' as const,
    schema: v.looseObject({
      x: v.number(),
      y: v.number(),
      handled: v.optional(v.boolean(), false),
    }),
  },
  /** Plugins contribuem handles customizados da seleção (ex.: pontos de wall). */
  'handles:collect': {
    strategy: 'syncWaterfall' as const,
    schema: v.looseObject({ handles: v.array(v.looseObject({
      type: v.string(),
      x: v.number(),
      y: v.number(),
      cursor: v.optional(v.string()),
      shape: v.optional(v.picklist(['circle', 'square']), 'circle'),
    })) }),
  },
  /** Gesto de drag de um handle customizado (bail: plugin retorna handled:true). */
  'handle:drag': {
    strategy: 'syncBail' as const,
    schema: v.looseObject({
      handle: v.looseObject({ type: v.string() }),
      x: v.number(),
      y: v.number(),
      phase: v.picklist(['start', 'move', 'end']),
      shiftKey: v.optional(v.boolean(), false),
      handled: v.optional(v.boolean(), false),
    }),
  },
};

export type CanvasEventMap = typeof canvasEvents;
export type CanvasHookMap = typeof canvasHooks;
export type CanvasBus = EventBus<CanvasEventMap, CanvasHookMap>;

/**
 * Porta de acesso a eventos registrados dinamicamente por plugins
 * (`<type>:create`, `measure`, `fog:change`, ...). Faz cast do bus inteiro —
 * nunca do método individual, o que desacopla o receiver (`this`).
 */
export interface DynamicBusPort {
  emit(name: string, payload?: unknown): void;
  on(name: string, handler: (payload: any, meta: unknown) => void): () => void;
}

export function dynamicBus(bus: CanvasBus): DynamicBusPort {
  return bus as unknown as DynamicBusPort;
}

export function createCanvasBus(): CanvasBus {
  return createBus<CanvasEventMap, CanvasHookMap>(
    { namespace: 'canvas', events: canvasEvents, hooks: canvasHooks },
    { validate: 'throw' },
  );
}
