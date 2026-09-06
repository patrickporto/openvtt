import * as v from 'valibot';
import { newId } from '@openvtt/events';
import type { AudioEngine, ScheduledHandle } from './engine';
import { TimelineTrackSchema } from './schemas';
import type { TimelineTrackInput } from './schemas';

export interface TimelineOptions {
  loop?: boolean;
  fadeInMs?: number;
}

export interface CrossfadeOptions extends TimelineOptions {
  durationMs?: number;
}

export interface TimelineHandle {
  readonly id: string;
  readonly loop: boolean;
  readonly paused: boolean;
  stop(): void;
  pause(): void;
  resume(): void;
}

interface ResolvedCue {
  readonly id: string;
  readonly soundId: string;
  readonly startMs: number;
  readonly durationMs: number | undefined;
  readonly fadeInMs: number | undefined;
  readonly fadeOutMs: number;
  readonly startOffsetMs: number;
}

interface ResolvedTrack {
  readonly id: string;
  readonly loop: boolean;
  readonly cues: readonly ResolvedCue[];
  readonly cueIds: readonly string[];
}

function trackDurationMs(track: { cues: readonly { startMs: number; durationMs?: number | undefined }[] }): number {
  let duration = Number.NEGATIVE_INFINITY;
  for (const cue of track.cues) {
    if (cue.durationMs === undefined) return Number.POSITIVE_INFINITY;
    duration = Math.max(duration, cue.startMs + cue.durationMs);
  }
  return duration === Number.NEGATIVE_INFINITY ? Number.POSITIVE_INFINITY : duration;
}

function totalDurationMs(tracks: readonly ResolvedTrack[]): number {
  let total = Number.NEGATIVE_INFINITY;
  for (const track of tracks) total = Math.max(total, trackDurationMs(track));
  return total === Number.NEGATIVE_INFINITY ? Number.POSITIVE_INFINITY : total;
}

export class TimelineRunner implements TimelineHandle {
  readonly id = newId();
  readonly loop: boolean;
  onEnded?: () => void;

  private readonly engine: AudioEngine;
  private readonly tracks: readonly ResolvedTrack[];
  private readonly fadeInMs: number;
  private readonly cueHandles = new Map<string, ScheduledHandle>();
  private readonly timers = new Set<unknown>();
  private startedAt = 0;
  private running = false;
  private pausedAt: number | null = null;
  private currentPaused = false;
  private ended = false;

  constructor(engine: AudioEngine, trackInputs: readonly TimelineTrackInput[], options: TimelineOptions) {
    this.engine = engine;
    this.loop = options.loop ?? false;
    this.fadeInMs = options.fadeInMs ?? 0;
    const parsed = v.parse(v.array(TimelineTrackSchema), [...trackInputs]);
    this.tracks = parsed.map((track) => {
      const cues = track.cues.map((cue) => ({
        id: cue.id ?? newId(),
        soundId: cue.soundId,
        startMs: cue.startMs,
        durationMs: cue.durationMs,
        fadeInMs: cue.fadeInMs,
        fadeOutMs: cue.fadeOutMs,
        startOffsetMs: cue.startOffsetMs,
      }));
      return { id: track.id ?? newId(), loop: track.loop, cues, cueIds: cues.map((cue) => cue.id) };
    });
  }

  get paused(): boolean {
    return this.currentPaused;
  }

  start(): void {
    if (this.ended || this.running) return;
    this.running = true;
    this.startedAt = this.engine.clock.now();
    this.pausedAt = null;
    this.scheduleAll();
  }

  stop(options: { stopInstances?: boolean } = {}): void {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    this.clearTimersAndCues();
    if (options.stopInstances !== false) this.stopAllTrackInstances();
    this.onEnded?.();
  }

  pause(): void {
    if (this.currentPaused || this.ended || !this.running) return;
    this.currentPaused = true;
    this.pausedAt = this.engine.clock.now();
    this.clearTimersAndCues();
    this.stopAllTrackInstances();
  }

  resume(): void {
    if (!this.currentPaused || this.ended) return;
    const elapsed = (this.pausedAt ?? this.engine.clock.now()) - this.startedAt;
    this.currentPaused = false;
    this.startedAt = this.engine.clock.now() - elapsed;
    this.pausedAt = null;
    this.rescheduleRemaining(elapsed);
  }

  private trackOrigin(trackId: string): string {
    return `timeline:${this.id}:${trackId}`;
  }

  private stopAllTrackInstances(): void {
    for (const track of this.tracks) this.engine.stopInstances(this.trackOrigin(track.id));
  }

  private scheduleAll(): void {
    for (const track of this.tracks) this.scheduleTrack(track);
    this.scheduleEnd(totalDurationMs(this.tracks));
  }

  private scheduleTrack(track: ResolvedTrack): void {
    const origin = this.trackOrigin(track.id);
    for (const cue of track.cues) {
      const handle = this.engine.playScheduled(cue.soundId, {
        delayMs: cue.startMs,
        durationMs: cue.durationMs,
        fadeInMs: cue.fadeInMs ?? this.fadeInMs,
        fadeOutMs: cue.fadeOutMs,
        startOffsetMs: cue.startOffsetMs,
        origin,
      });
      this.cueHandles.set(this.cueKey(track.id, cue.id), handle);
    }
    const duration = trackDurationMs(track);
    if (track.loop && Number.isFinite(duration)) {
      this.addTimer(() => {
        this.clearTrackCues(track);
        this.engine.stopInstances(this.trackOrigin(track.id));
        this.scheduleTrack(track);
      }, duration);
    }
  }

  private scheduleEnd(remainingMs: number): void {
    const total = totalDurationMs(this.tracks);
    if (!Number.isFinite(total)) return;
    const anyTrackLoop = this.tracks.some((track) => track.loop);
    if (!this.loop && anyTrackLoop) return;
    this.addTimer(() => {
      if (this.loop) {
        this.clearTimersAndCues();
        this.stopAllTrackInstances();
        this.startedAt = this.engine.clock.now();
        this.scheduleAll();
      } else {
        this.ended = true;
        this.running = false;
        this.clearTimersAndCues();
        this.onEnded?.();
      }
    }, Math.max(0, remainingMs));
  }

  private rescheduleRemaining(elapsed: number): void {
    for (const track of this.tracks) {
      const duration = trackDurationMs(track);
      for (const cue of track.cues) {
        const cueEnd = cue.startMs + (cue.durationMs ?? Number.POSITIVE_INFINITY);
        if (cueEnd <= elapsed) continue;
        if (cue.startMs >= elapsed) {
          const handle = this.engine.playScheduled(cue.soundId, {
            delayMs: cue.startMs - elapsed,
            durationMs: cue.durationMs,
            fadeInMs: cue.fadeInMs ?? this.fadeInMs,
            fadeOutMs: cue.fadeOutMs,
            startOffsetMs: cue.startOffsetMs,
            origin: this.trackOrigin(track.id),
          });
          this.cueHandles.set(this.cueKey(track.id, cue.id), handle);
        } else {
          this.engine.playOnce(cue.soundId, {
            startOffsetMs: this.resumeOffsetMs(cue, elapsed - cue.startMs),
            durationMs: Number.isFinite(cueEnd) ? cueEnd - elapsed : undefined,
            fadeOutMs: cue.fadeOutMs,
            origin: this.trackOrigin(track.id),
          });
        }
      }
      if (track.loop && Number.isFinite(duration)) {
        const phase = elapsed % duration;
        this.addTimer(() => {
          this.clearTrackCues(track);
          this.engine.stopInstances(this.trackOrigin(track.id));
          this.scheduleTrack(track);
        }, duration - phase);
      }
    }
    const total = totalDurationMs(this.tracks);
    if (Number.isFinite(total)) this.scheduleEnd(total - elapsed);
  }

  private resumeOffsetMs(cue: ResolvedCue, intoCueMs: number): number {
    let offset = cue.startOffsetMs + intoCueMs;
    if (this.engine.soundLoops(cue.soundId)) {
      const soundDurationMs = this.engine.getDurationMs(cue.soundId);
      if (soundDurationMs > 0) offset %= soundDurationMs;
    }
    return offset;
  }

  private addTimer(handler: () => void, delayMs: number): void {
    const timer = this.engine.clock.setTimeout(() => {
      this.timers.delete(timer);
      handler();
    }, Math.max(0, delayMs));
    this.timers.add(timer);
  }

  private cueKey(trackId: string, cueId: string): string {
    return `${trackId}:${cueId}`;
  }

  private clearTrackCues(track: ResolvedTrack): void {
    for (const cueId of track.cueIds) {
      const handle = this.cueHandles.get(this.cueKey(track.id, cueId));
      if (handle) handle.cancel();
      this.cueHandles.delete(this.cueKey(track.id, cueId));
    }
  }

  private clearTimersAndCues(): void {
    for (const timer of [...this.timers]) {
      this.engine.clock.clearTimeout(timer);
      this.timers.delete(timer);
    }
    for (const handle of [...this.cueHandles.values()]) handle.cancel();
    this.cueHandles.clear();
  }
}
