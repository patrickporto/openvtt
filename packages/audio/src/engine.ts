import { Howl, Howler } from 'howler';
import * as v from 'valibot';
import { createBus, newId } from '@openvtt/events';
import { ChannelMixer, DEFAULT_CHANNELS } from './channels';
import { GroupRegistry } from './groups';
import { audioContract } from './contract';
import type { AudioBus, AudioEventMap, AudioHookMap } from './contract';
import { SoundDefSchema, SoundGroupSchema, SpatialAttrsSchema } from './schemas';
import type {
  SoundDef,
  SoundDefInput,
  SoundGroupInput,
  SpatialAttrs,
  SpatialAttrsInput,
  TimelineTrackInput,
} from './schemas';
import { TimelineRunner } from './scheduler';
import type { CrossfadeOptions, TimelineHandle, TimelineOptions } from './scheduler';

export interface Clock {
  now(): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const defaultClock: Clock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number | undefined),
};

export type Vec3 = readonly [number, number, number];

export interface AudioEngineOptions {
  channels?: readonly string[];
  clock?: Clock;
  bus?: AudioBus;
}

type TransportIntent = 'start' | 'pause' | 'stop';

interface TransportCommand {
  sequence: number;
  soundId: string;
  intent: TransportIntent;
}

type InstanceOrigin = string;

interface Instance {
  iid: number;
  soundId: string;
  origin: InstanceOrigin;
}

export interface PlayOnceOptions {
  fadeInMs?: number;
  fadeOutMs?: number;
  durationMs?: number;
  startOffsetMs?: number;
  origin?: InstanceOrigin;
}

export interface PlayScheduledOptions extends PlayOnceOptions {
  delayMs?: number;
}

export interface ScheduledHandle {
  readonly soundId: string;
  cancel(): void;
}

interface StoredSoundDef extends SoundDef {
  id: string;
}

interface SoundEntry {
  def: StoredSoundDef;
  howl: Howl;
  position?: { x: number; y: number; z: number };
  pannerAttr?: SpatialAttrs;
  primaryIid: number | null;
}

interface PendingSchedule {
  soundId: string;
  handle: unknown;
  cancelled: boolean;
}

interface PendingFade {
  soundId: string;
  from: number;
  to: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

type HowlerPannerAttrs = Parameters<Howl['pannerAttr']>[0];

export class AudioEngine {
  readonly bus: AudioBus;
  readonly mixer: ChannelMixer;
  readonly groups = new GroupRegistry();
  readonly clock: Clock;

  private readonly sounds = new Map<string, SoundEntry>();
  private readonly instances = new Map<number, Instance>();
  private readonly pendingFades = new Map<number, PendingFade>();
  private readonly pendingSchedules = new Set<PendingSchedule>();
  private readonly timers = new Set<unknown>();
  private readonly unsubMixer: () => void;
  private transportQueue: TransportCommand[] = [];
  private sequence = 0;
  private drainScheduled = false;
  private timeline: TimelineRunner | null = null;
  private pausedIids = new Set<number>();
  private destroyed = false;

  constructor(options: AudioEngineOptions = {}) {
    this.bus = options.bus ?? createBus<AudioEventMap, AudioHookMap>(audioContract, { validate: 'throw' });
    this.mixer = new ChannelMixer(options.channels ?? DEFAULT_CHANNELS);
    this.clock = options.clock ?? defaultClock;
    this.unsubMixer = this.mixer.onChange(() => this.applyMix());
    this.applyMix();
  }

  register(input: SoundDefInput): string {
    this.assertNotDestroyed();
    const def = v.parse(SoundDefSchema, input);
    const id = def.id ?? newId();
    if (this.sounds.has(id)) throw new Error(`Sound "${id}" is already registered.`);
    const howl = new Howl({
      src: def.src,
      volume: 0,
      loop: def.loop,
      html5: def.html5,
      preload: def.preload,
      sprite: def.sprite,
    });
    const entry: SoundEntry = { def: { ...def, id }, howl, primaryIid: null };
    if (def.pannerAttr) entry.pannerAttr = def.pannerAttr;
    this.sounds.set(id, entry);
    howl.on('end', (iid: number) => this.onInstanceEnded(entry, iid));
    howl.on('stop', (iid: number) => this.onInstanceEnded(entry, iid));
    howl.on('fade', (iid: number) => this.onInstanceFade(iid));
    return id;
  }

  unregister(soundId: string): boolean {
    const entry = this.sounds.get(soundId);
    if (!entry) return false;
    for (const schedule of [...this.pendingSchedules]) {
      if (schedule.soundId === soundId) {
        schedule.cancelled = true;
        if (schedule.handle !== null) this.clock.clearTimeout(schedule.handle);
        this.pendingSchedules.delete(schedule);
      }
    }
    this.stopInstancesOf(entry);
    entry.howl.unload();
    this.sounds.delete(soundId);
    for (const [iid, instance] of [...this.instances]) {
      if (instance.soundId === soundId) {
        this.instances.delete(iid);
        this.pausedIids.delete(iid);
        this.pendingFades.delete(iid);
      }
    }
    return true;
  }

  has(soundId: string): boolean {
    return this.sounds.has(soundId);
  }

  list(): string[] {
    return [...this.sounds.keys()];
  }

  isPlaying(soundId: string): boolean {
    const entry = this.sounds.get(soundId);
    return entry !== undefined && entry.primaryIid !== null && entry.howl.playing(entry.primaryIid);
  }

  play(soundId: string): void {
    this.enqueue({ soundId, intent: 'start' });
  }

  pause(soundId: string): void {
    this.enqueue({ soundId, intent: 'pause' });
  }

  stop(soundId: string): void {
    this.enqueue({ soundId, intent: 'stop' });
  }

  flush(): void {
    this.processTransport();
  }

  playOnce(soundId: string, options: PlayOnceOptions = {}): number | null {
    this.assertNotDestroyed();
    const entry = this.require(soundId);
    const context = this.bus.call('beforePlay', {
      soundId,
      volume: entry.def.volume,
      channel: entry.def.channel,
    });
    const volume = clamp01(context.volume);
    const channel = context.channel;
    const iid = entry.howl.play();
    this.instances.set(iid, { iid, soundId, origin: options.origin ?? 'user' });
    const effective = volume * this.mixer.channelGain(channel);
    entry.howl.volume(effective, iid);
    this.applySpatial(entry, iid);
    if (options.startOffsetMs && options.startOffsetMs > 0) {
      this.seekInstance(entry, iid, options.startOffsetMs);
    }
    if (options.fadeInMs && options.fadeInMs > 0) {
      this.trackFade(iid, soundId, 0, effective);
      entry.howl.volume(0, iid);
      entry.howl.fade(0, effective, options.fadeInMs, iid);
    }
    if (options.durationMs && options.durationMs > 0) {
      const fadeOutMs = options.fadeOutMs ?? 0;
      const holdMs = Math.max(0, options.durationMs - fadeOutMs);
      const handle = this.clock.setTimeout(() => this.endInstance(entry, iid, fadeOutMs), holdMs);
      this.timers.add(handle);
    }
    this.bus.emit('sound:played', { soundId, channel });
    return iid;
  }

  playScheduled(soundId: string, options: PlayScheduledOptions = {}): ScheduledHandle {
    this.assertNotDestroyed();
    this.require(soundId);
    const schedule: PendingSchedule = { soundId, handle: null, cancelled: false };
    schedule.handle = this.clock.setTimeout(() => {
      this.pendingSchedules.delete(schedule);
      if (schedule.cancelled || !this.sounds.has(soundId)) return;
      this.playOnce(soundId, { ...options, origin: options.origin ?? 'timeline' });
    }, Math.max(0, options.delayMs ?? 0));
    this.pendingSchedules.add(schedule);
    return {
      soundId,
      cancel: () => {
        schedule.cancelled = true;
        if (schedule.handle !== null) this.clock.clearTimeout(schedule.handle);
        this.pendingSchedules.delete(schedule);
      },
    };
  }

  fade(soundId: string, from: number, to: number, durationMs: number): void {
    const entry = this.require(soundId);
    const start = clamp01(from);
    const end = clamp01(to);
    if (durationMs <= 0) {
      entry.howl.volume(end);
      return;
    }
    for (const iid of this.instanceIdsOf(soundId)) {
      this.trackFade(iid, soundId, start, end);
      entry.howl.fade(start, end, durationMs, iid);
    }
  }

  setVolume(soundId: string, volume: number): void {
    const entry = this.require(soundId);
    const result = this.bus.call('beforeVolume', { target: 'sound', id: soundId, value: clamp01(volume) });
    entry.def.volume = clamp01(result.value);
    entry.howl.volume(entry.def.volume * this.mixer.channelGain(entry.def.channel));
    this.bus.emit('volume:changed', { target: 'sound', id: soundId, value: entry.def.volume });
  }

  setMuted(soundId: string, muted: boolean): void {
    const entry = this.require(soundId);
    entry.howl.mute(muted);
    this.bus.emit('mute:changed', { target: 'sound', id: soundId, muted });
  }

  setChannel(soundId: string, channel: string): void {
    const entry = this.require(soundId);
    entry.def.channel = v.parse(v.pipe(v.string(), v.minLength(1)), channel);
    this.mixer.ensure(entry.def.channel);
    entry.howl.volume(entry.def.volume * this.mixer.channelGain(entry.def.channel));
  }

  setChannelVolume(id: string, volume: number): void {
    const result = this.bus.call('beforeVolume', { target: 'channel', id, value: clamp01(volume) });
    this.mixer.setChannelVolume(id, clamp01(result.value));
    this.bus.emit('volume:changed', { target: 'channel', id, value: clamp01(result.value) });
  }

  setChannelMuted(id: string, muted: boolean): void {
    this.mixer.setChannelMuted(id, muted);
    this.bus.emit('mute:changed', { target: 'channel', id, muted });
  }

  setChannelSolo(id: string, solo: boolean): void {
    this.mixer.setChannelSolo(id, solo);
  }

  setMasterVolume(volume: number): void {
    const result = this.bus.call('beforeVolume', { target: 'master', value: clamp01(volume) });
    this.mixer.setMasterVolume(clamp01(result.value));
    this.bus.emit('volume:changed', { target: 'master', value: clamp01(result.value) });
  }

  setMasterMuted(muted: boolean): void {
    this.mixer.setMasterMuted(muted);
    this.bus.emit('mute:changed', { target: 'master', muted });
  }

  setPosition(soundId: string, x: number, y: number, z = 0): void {
    const entry = this.require(soundId);
    entry.position = { x, y, z };
    if (!this.spatialEnabled()) return;
    for (const iid of this.instanceIdsOf(soundId)) entry.howl.pos(x, y, z, iid);
  }

  setSpatialAttrs(soundId: string, attrs: SpatialAttrsInput): void {
    const entry = this.require(soundId);
    entry.pannerAttr = v.parse(SpatialAttrsSchema, attrs);
    if (!this.spatialEnabled()) return;
    for (const iid of this.instanceIdsOf(soundId)) {
      entry.howl.pannerAttr(entry.pannerAttr as unknown as HowlerPannerAttrs, iid);
    }
  }

  setListener(x: number, y: number, z = 0, forward: Vec3 = [0, 0, -1], up: Vec3 = [0, 1, 0]): void {
    if (!this.spatialEnabled()) return;
    Howler.pos(x, y, z);
    Howler.orientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
  }

  defineGroup(input: SoundGroupInput): string {
    return this.groups.define(input);
  }

  playGroup(groupId: string): string | null {
    const pick = this.groups.pick(groupId);
    if (pick === null) return null;
    this.playOnce(pick);
    return pick;
  }

  startTimeline(tracks: TimelineTrackInput[], options: TimelineOptions = {}): TimelineHandle {
    this.stopTimeline();
    const runner = new TimelineRunner(this, tracks, options);
    runner.onEnded = () => this.handleTimelineEnded(runner);
    this.timeline = runner;
    runner.start();
    this.bus.emit('timeline:started', { loop: runner.loop });
    return runner;
  }

  crossfadeToTimeline(tracks: TimelineTrackInput[], options: CrossfadeOptions = {}): TimelineHandle {
    const durationMs = options.durationMs ?? 2000;
    this.stopTimeline({ stopInstances: false });
    for (const instance of [...this.instances.values()]) {
      if (!instance.origin.startsWith('timeline')) continue;
      const entry = this.sounds.get(instance.soundId);
      if (!entry) continue;
      const current = this.instanceVolume(entry, instance.iid);
      this.trackFade(instance.iid, instance.soundId, current, 0);
      entry.howl.fade(current, 0, durationMs, instance.iid);
      const handle = this.clock.setTimeout(() => {
        this.timers.delete(handle);
        entry.howl.stop(instance.iid);
      }, durationMs);
      this.timers.add(handle);
    }
    this.clearPendingSchedules();
    return this.startTimeline(tracks, { ...options, fadeInMs: options.fadeInMs ?? durationMs });
  }

  stopTimeline(): void;
  stopTimeline(options: { stopInstances: boolean }): void;
  stopTimeline(options: { stopInstances: boolean } = { stopInstances: true }): void {
    this.timeline?.stop(options);
  }

  pauseTimeline(): void {
    this.timeline?.pause();
  }

  resumeTimeline(): void {
    this.timeline?.resume();
  }

  get activeTimeline(): TimelineHandle | null {
    return this.timeline;
  }

  stopAll(): void {
    this.stopTimeline();
    this.clearPendingSchedules();
    for (const handle of [...this.timers]) {
      this.clock.clearTimeout(handle);
      this.timers.delete(handle);
    }
    for (const entry of [...this.sounds.values()]) this.stopInstancesOf(entry);
    this.pausedIids.clear();
  }

  pauseAll(): void {
    for (const instance of [...this.instances.values()]) {
      const entry = this.sounds.get(instance.soundId);
      if (!entry || !entry.howl.playing(instance.iid)) continue;
      entry.howl.pause(instance.iid);
      this.pausedIids.add(instance.iid);
    }
  }

  resumeAll(): void {
    for (const iid of [...this.pausedIids]) {
      const instance = this.instances.get(iid);
      const entry = instance ? this.sounds.get(instance.soundId) : undefined;
      if (instance && entry) this.resumeIid(entry, iid);
    }
    this.pausedIids.clear();
  }

  unlock(): void {
    const ctx = Howler.ctx as AudioContext | undefined;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  getDurationMs(soundId: string): number {
    const entry = this.sounds.get(soundId);
    if (!entry) return 0;
    return entry.howl.duration() * 1000;
  }

  soundLoops(soundId: string): boolean {
    return this.sounds.get(soundId)?.def.loop ?? false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopAll();
    this.transportQueue = [];
    this.drainScheduled = false;
    for (const entry of [...this.sounds.values()]) entry.howl.unload();
    this.sounds.clear();
    this.instances.clear();
    this.pendingFades.clear();
    this.groups.clear();
    this.unsubMixer();
    this.mixer.clearListeners();
    this.bus.destroy();
  }

  private enqueue(command: Omit<TransportCommand, 'sequence'>): void {
    this.assertNotDestroyed();
    this.require(command.soundId);
    this.transportQueue = this.transportQueue.filter((c) => c.soundId !== command.soundId);
    this.transportQueue.push({ ...command, sequence: ++this.sequence });
    if (!this.drainScheduled) {
      this.drainScheduled = true;
      this.clock.setTimeout(() => {
        this.drainScheduled = false;
        this.processTransport();
      }, 0);
    }
  }

  private processTransport(): void {
    const queue = this.transportQueue;
    this.transportQueue = [];
    for (const command of queue) this.applyTransport(command);
  }

  private applyTransport(command: TransportCommand): void {
    const entry = this.sounds.get(command.soundId);
    if (!entry) return;
    if (command.intent === 'start') {
      if (entry.primaryIid !== null) {
        if (entry.howl.playing(entry.primaryIid)) return;
        if (this.instances.has(entry.primaryIid)) {
          this.resumeIid(entry, entry.primaryIid);
          return;
        }
      }
      const iid = this.playOnce(command.soundId);
      if (iid !== null) entry.primaryIid = iid;
    } else if (command.intent === 'pause') {
      if (entry.primaryIid === null) return;
      entry.howl.pause(entry.primaryIid);
      this.bus.emit('sound:paused', { soundId: command.soundId });
    } else {
      if (this.instanceIdsOf(command.soundId).size === 0) return;
      this.stopInstancesOf(entry);
      this.bus.emit('sound:stopped', { soundId: command.soundId });
    }
  }

  private applyMix(): void {
    Howler.volume(this.mixer.master.volume);
    Howler.mute(this.mixer.master.muted);
    for (const entry of this.sounds.values()) {
      entry.howl.volume(entry.def.volume * this.mixer.channelGain(entry.def.channel));
    }
  }

  private require(soundId: string): SoundEntry {
    const entry = this.sounds.get(soundId);
    if (!entry) throw new Error(`Unknown sound "${soundId}".`);
    return entry;
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) throw new Error('AudioEngine has been destroyed.');
  }

  private spatialEnabled(): boolean {
    return Howler.usingWebAudio;
  }

  private applySpatial(entry: SoundEntry, iid: number): void {
    if (!this.spatialEnabled()) return;
    if (entry.pannerAttr) entry.howl.pannerAttr(entry.pannerAttr as unknown as HowlerPannerAttrs, iid);
    if (entry.position) entry.howl.pos(entry.position.x, entry.position.y, entry.position.z, iid);
  }

  private seekInstance(entry: SoundEntry, iid: number, offsetMs: number): void {
    const seconds = offsetMs / 1000;
    if (entry.howl.state() === 'loaded') {
      entry.howl.seek(seconds, iid);
      return;
    }
    entry.howl.once('play', (playIid: number) => {
      if (playIid === iid) entry.howl.seek(seconds, iid);
    });
  }

  private endInstance(entry: SoundEntry, iid: number, fadeOutMs: number): void {
    if (!this.instances.has(iid)) return;
    if (fadeOutMs > 0) {
      const current = this.instanceVolume(entry, iid);
      this.trackFade(iid, entry.def.id, current, 0);
      entry.howl.fade(current, 0, fadeOutMs, iid);
      const handle = this.clock.setTimeout(() => {
        this.timers.delete(handle);
        entry.howl.stop(iid);
      }, fadeOutMs);
      this.timers.add(handle);
    } else {
      entry.howl.stop(iid);
    }
  }

  private stopInstancesOf(entry: SoundEntry): void {
    const iids = [...this.instanceIdsOf(entry.def.id)];
    if (entry.primaryIid !== null) entry.primaryIid = null;
    for (const iid of iids) entry.howl.stop(iid);
  }

  private instanceIdsOf(soundId: string): Set<number> {
    const iids = new Set<number>();
    const entry = this.sounds.get(soundId);
    if (entry?.primaryIid !== null && entry?.primaryIid !== undefined) iids.add(entry.primaryIid);
    for (const instance of this.instances.values()) {
      if (instance.soundId === soundId) iids.add(instance.iid);
    }
    return iids;
  }

  private instanceVolume(entry: SoundEntry, iid: number): number {
    return entry.howl.volume(iid) as unknown as number;
  }

  private resumeIid(entry: SoundEntry, iid: number): void {
    entry.howl.play(iid);
  }

  private trackFade(iid: number, soundId: string, from: number, to: number): void {
    this.pendingFades.set(iid, { soundId, from, to });
  }

  private onInstanceEnded(entry: SoundEntry, iid: number): void {
    if (entry.primaryIid === iid) entry.primaryIid = null;
    this.instances.delete(iid);
    this.pausedIids.delete(iid);
    this.pendingFades.delete(iid);
  }

  private onInstanceFade(iid: number): void {
    const fade = this.pendingFades.get(iid);
    if (!fade) return;
    this.pendingFades.delete(iid);
    this.bus.emit('fade:ended', { soundId: fade.soundId, from: fade.from, to: fade.to });
  }

  private clearPendingSchedules(): void {
    for (const schedule of [...this.pendingSchedules]) {
      schedule.cancelled = true;
      if (schedule.handle !== null) this.clock.clearTimeout(schedule.handle);
      this.pendingSchedules.delete(schedule);
    }
  }

  pauseInstances(origin: InstanceOrigin): void {
    for (const instance of [...this.instances.values()]) {
      if (instance.origin !== origin) continue;
      this.sounds.get(instance.soundId)?.howl.pause(instance.iid);
    }
  }

  resumeInstances(origin: InstanceOrigin): void {
    for (const instance of [...this.instances.values()]) {
      if (instance.origin !== origin) continue;
      const entry = this.sounds.get(instance.soundId);
      if (entry) this.resumeIid(entry, instance.iid);
    }
  }

  stopInstances(origin: InstanceOrigin): void {
    for (const instance of [...this.instances.values()]) {
      if (instance.origin !== origin) continue;
      this.sounds.get(instance.soundId)?.howl.stop(instance.iid);
    }
  }

  private handleTimelineEnded(runner: TimelineRunner): void {
    if (this.timeline !== runner) return;
    this.timeline = null;
    this.bus.emit('timeline:ended', { loop: runner.loop });
  }
}
