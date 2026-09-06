export { rangesPlugin, RangesPlugin, type PlaceRangeInput } from './plugin';
export { rangesControllerFor, type ActiveRange } from './controller';
export { RangeTool } from './tools/RangeTool';
export { RangeOverlayLayer } from './layer/RangeOverlayLayer';
export type { DrawnRange, RangeGuide, RangeRenderInput } from './layer/RangeOverlayLayer';
export { RANGE_TOOL_DEFAULTS, type RangeToolOptions } from './options';
export {
  RangeClearedEventSchema,
  RangePlacedEventSchema,
  RangePresetSchema,
  RangeRingSchema,
  RangeShapeSchema,
  RangeThemeSchema,
  defineRangePreset,
  defineRangeTheme,
  parseRangePreset,
  parseRangeTheme,
  type RangeClearedEvent,
  type RangePlacedEvent,
  type RangePreset,
  type RangePresetInput,
  type RangeRingSpec,
  type RangeShape,
  type RangeTheme,
  type RangeThemeInput,
} from './schemas';
export { BUILTIN_PRESETS, BASIC_PRESET, DND5E_PRESET, METRIC_PRESET } from './presets';
export { BUILTIN_THEMES, DEUTERANOPIA_THEME, PROTANOPIA_THEME, SPECTRUM_THEME, TRITANOPIA_THEME } from './themes';
export {
  containingRing,
  formatDistance,
  resolveRings,
  ringCells,
  ringDistance,
  trimNumber,
  type ResolvedRing,
} from './resolve';
