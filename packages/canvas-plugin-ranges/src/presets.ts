import { defineRangePreset } from './schemas';

export const BASIC_PRESET = defineRangePreset({
  id: 'basic',
  label: 'Basic',
  rings: [1, 2, 3, 5],
});

export const DND5E_PRESET = defineRangePreset({
  id: 'dnd5e',
  label: 'D&D 5e',
  unit: { perCell: 5, suffix: ' ft' },
  rings: [5, 30, 60, 90, 120],
});

export const METRIC_PRESET = defineRangePreset({
  id: 'metric',
  label: 'Metric',
  unit: { perCell: 1.5, suffix: ' m' },
  rings: [1.5, 9, 18, 36],
});

export const BUILTIN_PRESETS: readonly (typeof BASIC_PRESET | typeof DND5E_PRESET | typeof METRIC_PRESET)[] = [
  BASIC_PRESET,
  DND5E_PRESET,
  METRIC_PRESET,
];
