import * as v from 'valibot';
import { v7 as uuidv7 } from 'uuid';

/** Tipos de tracker: contador simples ou barra value/max. */
export const TrackerKindSchema = v.picklist(['counter', 'bar']);
export type TrackerKind = v.InferOutput<typeof TrackerKindSchema>;

/** Modos de exibição por audiência (Bar Brawl-style). */
export const VisibilityModeSchema = v.picklist(['always', 'hover', 'selected', 'never']);
export type VisibilityMode = v.InferOutput<typeof VisibilityModeSchema>;

/** Papéis de audiência que enxergam um tracker. */
export const TrackerAudienceSchema = v.object({
  gm: v.optional(VisibilityModeSchema, 'always'),
  owner: v.optional(VisibilityModeSchema, 'always'),
  others: v.optional(VisibilityModeSchema, 'hover'),
});
export type TrackerAudience = v.InferOutput<typeof TrackerAudienceSchema>;

/** Estilo do rótulo numérico. */
export const TrackerLabelStyleSchema = v.picklist(['none', 'value', 'max', 'fraction', 'percent']);
export type TrackerLabelStyle = v.InferOutput<typeof TrackerLabelStyleSchema>;

/** Lado do token onde o tracker é desenhado. */
export const TrackerSideSchema = v.picklist(['top', 'bottom', 'left', 'right']);
export type TrackerSide = v.InferOutput<typeof TrackerSideSchema>;

/** Dentro ou fora dos limites do token. */
export const TrackerInsetSchema = v.picklist(['inner', 'outer']);
export type TrackerInset = v.InferOutput<typeof TrackerInsetSchema>;

/** Cor única ou par min/max para interpolação pela razão value/max. */
export const TrackerColorSchema = v.union([
  v.pipe(v.string(), v.minLength(3)),
  v.object({ min: v.pipe(v.string(), v.minLength(3)), max: v.pipe(v.string(), v.minLength(3)) }),
]);
export type TrackerColor = v.InferOutput<typeof TrackerColorSchema>;

const FiniteNumber = v.pipe(v.number(), v.finite());

/**
 * Definição completa de um tracker. Omitir `id` gera um UUID v7 na
 * normalização; ids pré-existentes são validados como UUID.
 */
export const TrackerSchema = v.pipe(
  v.object({
    id: v.optional(v.pipe(v.string(), v.uuid()), () => newTrackerId()),
    name: v.pipe(v.string(), v.minLength(1), v.maxLength(48)),
    kind: v.optional(TrackerKindSchema, 'counter'),
    value: v.optional(FiniteNumber, 0),
    max: v.optional(FiniteNumber),
    min: v.optional(FiniteNumber, 0),
    step: v.optional(v.pipe(v.number(), v.check((n: number) => n > 0, 'step must be positive')), 1),
    math: v.optional(v.boolean(), true),
    clamp: v.optional(v.boolean(), true),
    color: v.optional(TrackerColorSchema),
    side: v.optional(TrackerSideSchema, 'bottom'),
    inset: v.optional(TrackerInsetSchema, 'inner'),
    opacity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.85),
    invert: v.optional(v.boolean(), false),
    segments: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20)), 0),
    label: v.optional(TrackerLabelStyleSchema, 'value'),
    prefix: v.optional(v.pipe(v.string(), v.maxLength(12)), ''),
    units: v.optional(v.pipe(v.string(), v.maxLength(8)), ''),
    visible: v.optional(v.boolean(), true),
    hideEmpty: v.optional(v.boolean(), false),
    hideFull: v.optional(v.boolean(), false),
    audience: v.optional(TrackerAudienceSchema, { gm: 'always', owner: 'always', others: 'hover' }),
    source: v.optional(v.string(), 'inline'),
  }),
  v.check((tracker) => tracker.max === undefined || tracker.max > tracker.min, 'max must be greater than min'),
);
export type Tracker = v.InferOutput<typeof TrackerSchema>;
export type TrackerInput = v.InferInput<typeof TrackerSchema>;

export function newTrackerId(): string {
  return uuidv7();
}

/** Normaliza um input de tracker: valida, aplica defaults e gera id (UUID v7) quando ausente. */
export function normalizeTracker(input: TrackerInput): Tracker {
  return v.parse(TrackerSchema, input);
}

/** Valida um tracker já normalizado sem gerar novo id. */
export function parseTracker(input: unknown): Tracker {
  return v.parse(TrackerSchema, input);
}

/* ----------------------------- bus contract ----------------------------- */

const TrackerRefSchema = v.object({
  id: v.string(),
  name: v.string(),
  kind: TrackerKindSchema,
});

/** `trackers:changed` — qualquer mutação de estado (CRUD, reorder, defaults). */
export const TrackersChangedEventSchema = v.object({
  scope: v.picklist(['token', 'defaults', 'all']),
  tokenId: v.optional(v.string()),
  trackerId: v.optional(v.string()),
});

/** `trackers:value` — mudança fina de valor (para macros, sheets, dice). */
export const TrackersValueEventSchema = v.object({
  tokenId: v.string(),
  trackerId: v.string(),
  name: v.string(),
  before: FiniteNumber,
  after: FiniteNumber,
});

/** `trackers:applied` — defaults/preset aplicados a tokens. */
export const TrackersAppliedEventSchema = v.object({
  tokenIds: v.array(v.string()),
  count: v.number(),
});

export type TrackersChangedEvent = v.InferOutput<typeof TrackersChangedEventSchema>;
export type TrackersValueEvent = v.InferOutput<typeof TrackersValueEventSchema>;
export type TrackersAppliedEvent = v.InferOutput<typeof TrackersAppliedEventSchema>;

/** Hook `trackers:resolve` (syncWaterfall): resolve value/max de um tracker. */
export const TrackersResolveHookSchema = v.looseObject({
  tokenId: v.string(),
  tracker: TrackerRefSchema,
  value: FiniteNumber,
  max: v.optional(FiniteNumber),
});

/** Hook `trackers:label` (syncWaterfall): formata o rótulo exibido. */
export const TrackersLabelHookSchema = v.looseObject({
  tokenId: v.string(),
  tracker: TrackerRefSchema,
  value: FiniteNumber,
  max: v.optional(FiniteNumber),
  label: v.string(),
});

/** Hook `trackers:visibility` (syncWaterfall): veredicto final de exibição. */
export const TrackersVisibilityHookSchema = v.looseObject({
  tokenId: v.string(),
  tracker: TrackerRefSchema,
  visible: v.boolean(),
});

export type TrackersResolvePayload = v.InferOutput<typeof TrackersResolveHookSchema>;
export type TrackersLabelPayload = v.InferOutput<typeof TrackersLabelHookSchema>;
export type TrackersVisibilityPayload = v.InferOutput<typeof TrackersVisibilityHookSchema>;

/* ----------------------------- snapshot ----------------------------- */

/** Snapshot serializável do estado do plugin (persistência do host). */
export const TrackersSnapshotSchema = v.object({
  version: v.literal(1),
  defaults: v.array(TrackerSchema),
  tokens: v.record(v.string(), v.array(TrackerSchema)),
});
export type TrackersSnapshot = v.InferOutput<typeof TrackersSnapshotSchema>;
