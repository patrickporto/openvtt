import * as v from 'valibot';
import { RingStyleSchema, type RingStyle, type RingStyleInput } from './schemas';

export interface RingPresetInput {
  readonly id: string;
  readonly label: string;
  readonly style: RingStyleInput;
}

export interface RingPreset {
  readonly id: string;
  readonly label: string;
  readonly style: RingStyle;
}

export class RingPresetRegistry {
  private readonly presets = new Map<string, RingPreset>();

  register(preset: RingPresetInput): this {
    this.presets.set(preset.id, {
      id: preset.id,
      label: preset.label,
      style: v.parse(RingStyleSchema, preset.style),
    });
    return this;
  }

  unregister(id: string): boolean {
    return this.presets.delete(id);
  }

  get(id: string): RingPreset | undefined {
    return this.presets.get(id);
  }

  has(id: string): boolean {
    return this.presets.has(id);
  }

  list(): readonly RingPreset[] {
    return [...this.presets.values()];
  }
}

export const COLOR_PRESETS: readonly RingPresetInput[] = [
  { id: 'blue', label: 'Blue', style: { color: '#1a6aff' } },
  { id: 'orange', label: 'Orange', style: { color: '#ff7433' } },
  { id: 'red', label: 'Red', style: { color: '#ff4d4d' } },
  { id: 'yellow', label: 'Yellow', style: { color: '#ffd433' } },
  { id: 'brown', label: 'Brown', style: { color: '#b07126' } },
  { id: 'purple', label: 'Purple', style: { color: '#884dff' } },
  { id: 'green', label: 'Green', style: { color: '#85ff66' } },
  { id: 'forest', label: 'Forest', style: { color: '#519e00' } },
  { id: 'pink', label: 'Pink', style: { color: '#eb8aff' } },
  { id: 'cyan', label: 'Cyan', style: { color: '#44e0f1' } },
  { id: 'black', label: 'Black', style: { color: '#222222' } },
  { id: 'white', label: 'White', style: { color: '#ffffff' } },
];

export const CONDITION_PRESETS: readonly RingPresetInput[] = [
  { id: 'poisoned', label: 'Poisoned', style: { color: '#519e00', dash: [4, 4] } },
  { id: 'bloodied', label: 'Bloodied', style: { color: '#ff4d4d', pulse: true } },
  { id: 'burning', label: 'Burning', style: { color: '#ff7433', pulse: true, glow: true } },
  { id: 'blessed', label: 'Blessed', style: { color: '#ffd433', glow: true } },
  { id: 'frozen', label: 'Frozen', style: { color: '#44e0f1', dash: [2, 3] } },
  { id: 'shocked', label: 'Shocked', style: { color: '#ffd433', dash: [2, 2], pulse: true } },
  { id: 'cursed', label: 'Cursed', style: { color: '#884dff', glow: true } },
  { id: 'invisible', label: 'Invisible', style: { color: '#222222', dash: [3, 5] } },
  { id: 'hasted', label: 'Hasted', style: { color: '#44e0f1', pulse: true } },
  { id: 'charmed', label: 'Charmed', style: { color: '#eb8aff', pulse: true } },
  { id: 'blinded', label: 'Blinded', style: { color: '#ffffff', width: 5 } },
];
