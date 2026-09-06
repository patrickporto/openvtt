export { TrackersPlugin, trackersPlugin } from './plugin';
export type { TrackersPluginOptions } from './plugin';

export {
  TrackerKindSchema,
  TrackerAudienceSchema,
  TrackerColorSchema,
  TrackerSchema,
  TrackerLabelStyleSchema,
  TrackerSideSchema,
  TrackerInsetSchema,
  TrackersSnapshotSchema,
  TrackersChangedEventSchema,
  TrackersValueEventSchema,
  TrackersAppliedEventSchema,
  TrackersResolveHookSchema,
  TrackersLabelHookSchema,
  TrackersVisibilityHookSchema,
  VisibilityModeSchema,
  newTrackerId,
  normalizeTracker,
  parseTracker,
} from './schemas';
export type {
  Tracker,
  TrackerInput,
  TrackerKind,
  TrackerAudience,
  TrackerColor,
  TrackerLabelStyle,
  TrackerSide,
  TrackerInset,
  VisibilityMode,
  TrackersSnapshot,
  TrackersChangedEvent,
  TrackersValueEvent,
  TrackersAppliedEvent,
  TrackersResolvePayload,
  TrackersLabelPayload,
  TrackersVisibilityPayload,
} from './schemas';

export { parseMathInput, applyMath, formatMath } from './math';
export type { MathExpression, MathOperation, MathParseError, MathParseResult } from './math';

export {
  interpolateColor,
  normalizeTrackerColor,
  colorToNumber,
  parseHexColor,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  isHexColor,
} from './color';
export type { RgbColor, HsvColor, NormalizedColor } from './color';

export {
  resolveTracker,
  computeVisibility,
  computeRatio,
  computeLabel,
  formatTrackerNumber,
  audienceModeFor,
  EVERYTHING_VIEWER,
} from './resolve';
export type { ViewerContext, TrackerUiState, SourceValue, ResolvedTracker } from './resolve';

export { TrackerStore } from './store';
export type {
  TrackerResolver,
  TrackerResolverContext,
  TrackerStoreEvent,
  TrackerStoreListener,
  MathApplyResult,
  MathApplyError,
} from './store';

export { defineTrackerPreset, BUILTIN_PRESETS, GENERIC_HP, DND5E_COMBAT, PF2E_BASIC } from './presets';
export type { TrackerPreset } from './presets';

export { TokenTrackersView, TrackerOverlay } from './render';
export type { TrackerOverlayDeps } from './render';

export { tapTrackersHooks, onTrackersEvents, trackerBusPort } from './hooks';
export type { TrackerHookTaps, TrackersEventHandlers, TrackerBusPort } from './hooks';
