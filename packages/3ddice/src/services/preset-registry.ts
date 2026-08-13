import type { DiceShape } from '../constants/dice';
import { DicePreset } from './preset';
import type { DiceObject } from './dice-mesh';

export class DicePresetRegistry {
  #presets = new Map<string, DiceObject>();

  constructor(entries?: Iterable<readonly [string, DiceObject]>) {
    if (entries) {
      for (const [type, preset] of entries) {
        this.#presets.set(type, preset);
      }
    }
  }

  has(type: string): boolean {
    return this.#presets.has(type);
  }

  get(type: string): DiceObject | undefined {
    return this.#presets.get(type);
  }

  register(type: string, preset: DiceObject): void {
    this.#presets.set(type, preset);
  }

  create(type: string): DiceObject {
    const preset = new DicePreset(type as DiceShape);
    this.#presets.set(type, preset);
    return preset;
  }

  getOrCreate(type: string): DiceObject {
    return this.#presets.get(type) ?? this.create(type);
  }
}

export function createDefaultPresetRegistry(): DicePresetRegistry {
  return new DicePresetRegistry();
}
