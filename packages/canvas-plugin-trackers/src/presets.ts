import type { TrackerInput } from './schemas';

/** Conjunto nomeado de trackers aplicável a defaults de cena ou tokens. */
export interface TrackerPreset {
  readonly id: string;
  readonly name: string;
  readonly trackers: readonly TrackerInput[];
}

export function defineTrackerPreset(preset: TrackerPreset): TrackerPreset {
  return preset;
}

export const GENERIC_HP: TrackerPreset = defineTrackerPreset({
  id: 'generic-hp',
  name: 'Generic · HP',
  trackers: [{ name: 'HP', kind: 'bar', value: 10, max: 10, label: 'fraction' }],
});

export const DND5E_COMBAT: TrackerPreset = defineTrackerPreset({
  id: 'dnd5e-combat',
  name: 'D&D 5e · Combat',
  trackers: [
    { name: 'HP', kind: 'bar', value: 12, max: 12, label: 'fraction', side: 'bottom', inset: 'inner' },
    { name: 'Temp HP', kind: 'bar', value: 0, max: 10, label: 'none', hideEmpty: true, color: '#7cc4ff' },
    { name: 'AC', kind: 'counter', value: 15, side: 'top', inset: 'inner', label: 'value', color: '#f0c168' },
  ],
});

export const PF2E_BASIC: TrackerPreset = defineTrackerPreset({
  id: 'pf2e-basic',
  name: 'Pathfinder 2e · Basic',
  trackers: [
    { name: 'HP', kind: 'bar', value: 18, max: 18, label: 'fraction', side: 'bottom', inset: 'inner' },
    { name: 'Shield', kind: 'counter', value: 1, max: 1, side: 'left', label: 'value', color: '#9db8e8' },
    { name: 'AC', kind: 'counter', value: 17, side: 'top', label: 'value', color: '#f0c168' },
  ],
});

export const BUILTIN_PRESETS: readonly TrackerPreset[] = Object.freeze([GENERIC_HP, DND5E_COMBAT, PF2E_BASIC]);
