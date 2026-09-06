import * as v from 'valibot';
import { UnitIntervalSchema } from './schemas';

export const DEFAULT_CHANNELS = ['music', 'ambient', 'effects', 'voice'] as const;

export interface ChannelState {
  readonly volume: number;
  readonly muted: boolean;
  readonly solo: boolean;
}

const ChannelIdSchema = v.pipe(v.string(), v.minLength(1));

interface MutableChannelState {
  volume: number;
  muted: boolean;
  solo: boolean;
}

export class ChannelMixer {
  private readonly channels = new Map<string, MutableChannelState>();
  private readonly listeners = new Set<() => void>();
  private masterVolume = 1;
  private masterMuted = false;

  constructor(channelIds: readonly string[] = DEFAULT_CHANNELS) {
    for (const id of channelIds) this.ensure(id);
  }

  list(): string[] {
    return [...this.channels.keys()];
  }

  get(id: string): ChannelState | undefined {
    const state = this.channels.get(id);
    return state ? { ...state } : undefined;
  }

  ensure(id: string): ChannelState {
    v.parse(ChannelIdSchema, id);
    let state = this.channels.get(id);
    if (!state) {
      state = { volume: 1, muted: false, solo: false };
      this.channels.set(id, state);
    }
    return { ...state };
  }

  setChannelVolume(id: string, volume: number): void {
    this.require(id).volume = v.parse(UnitIntervalSchema, volume);
    this.notify();
  }

  setChannelMuted(id: string, muted: boolean): void {
    this.require(id).muted = muted;
    this.notify();
  }

  setChannelSolo(id: string, solo: boolean): void {
    this.require(id).solo = solo;
    this.notify();
  }

  get master(): ChannelState {
    return { volume: this.masterVolume, muted: this.masterMuted, solo: false };
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = v.parse(UnitIntervalSchema, volume);
    this.notify();
  }

  setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
    this.notify();
  }

  anySolo(): boolean {
    for (const state of this.channels.values()) {
      if (state.solo) return true;
    }
    return false;
  }

  channelGain(id: string): number {
    const state = this.channels.get(id);
    if (!state) return 1;
    if (state.muted) return 0;
    if (this.anySolo() && !state.solo) return 0;
    return state.volume;
  }

  masterGain(): number {
    return this.masterMuted ? 0 : this.masterVolume;
  }

  effective(id: string): number {
    return this.channelGain(id) * this.masterGain();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  private require(id: string): MutableChannelState {
    const state = this.channels.get(id);
    if (!state) throw new Error(`Unknown audio channel "${id}".`);
    return state;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
