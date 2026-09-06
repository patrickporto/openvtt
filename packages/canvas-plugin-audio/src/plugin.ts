import * as v from 'valibot';
import { AudioEngine, type SpatialAttrs } from '@openvtt/audio';
import { dynamicBus, type PlaceablesLayer, type PluginContext } from '@openvtt/canvas';
import { AmbientSound } from './placeables/AmbientSound';
import { SoundTool } from './tools/SoundTool';
import { ListenerController, type CoordinateMapper, type ListenerMode } from './listener';
import { registerSoundsContextMenu } from './context';
import { soundsBus } from './bus';
import { SoundDataSchema, SoundSourceSchema } from './schemas';
import type { SoundData, SoundDataInput, SoundSource } from './schemas';

export type SoundsLayer = PlaceablesLayer<SoundData, AmbientSound, SoundDataInput>;

export interface SoundToolOptions {
  src: string | string[];
  radius: number;
  volume: number;
  channel: string;
  loop: boolean;
}

const DEFAULT_TOOL_OPTIONS: SoundToolOptions = {
  src: 'sounds/ambient.mp3',
  radius: 4,
  volume: 1,
  channel: 'ambient',
  loop: true,
};

export interface AudioPluginOptions {
  engine?: AudioEngine;
  listener?: {
    mode?: ListenerMode;
    tokenId?: string | null;
    mapper?: CoordinateMapper;
  };
  updateIntervalMs?: number;
}

interface SyncState {
  soundId: string;
  src: string | string[];
  volume: number;
  channel: string;
  radius: number;
  playing: boolean;
}

const UuidSchema = v.pipe(v.string(), v.uuid());

function sameSrc(a: string | string[], b: string | string[]): boolean {
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((s, i) => s === b[i]);
  }
  return a === b;
}

function spatialAttrsForRadius(radius: number): SpatialAttrs {
  return {
    panningModel: 'equalpower',
    distanceModel: 'linear',
    refDistance: Math.max(0.25, radius / 4),
    maxDistance: Math.max(1, radius),
    rolloffFactor: 1,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 0,
  };
}

export class AudioPlugin {
  readonly id = 'audio';
  readonly name = 'Audio';
  readonly engine: AudioEngine;
  readonly listener = new ListenerController();
  updateIntervalMs: number;
  layer!: SoundsLayer;

  private ctx!: PluginContext;
  private readonly attached = new Map<string, string>();
  private readonly syncState = new Map<string, SyncState>();
  private readonly unsubs: Array<() => void> = [];
  private tickerFn: (() => void) | null = null;
  private lastUpdate = 0;

  constructor(options: AudioPluginOptions = {}) {
    this.engine = options.engine ?? new AudioEngine();
    if (options.listener?.mode) this.listener.setMode(options.listener.mode);
    if (options.listener?.tokenId !== undefined) this.listener.followToken(options.listener.tokenId);
    if (options.listener?.mapper) this.listener.mapper = options.listener.mapper;
    this.updateIntervalMs = Math.max(0, options.updateIntervalMs ?? 50);
  }

  install(ctx: PluginContext): void {
    this.ctx = ctx;
    this.layer = ctx.registerDocumentType<SoundData, SoundDataInput>({
      type: 'sound',
      schema: SoundDataSchema,
      placeable: AmbientSound,
      layer: { label: 'Sounds', order: 560 },
      sceneKey: 'sounds',
      behavior: { movable: true },
    }) as SoundsLayer;

    ctx.registerTool({ tool: SoundTool, hotkey: 'a', defaults: { ...DEFAULT_TOOL_OPTIONS } });

    ctx.bus.registerHook('sound:sources', {
      strategy: 'syncWaterfall',
      schema: v.looseObject({ sources: v.array(SoundSourceSchema) }),
    });
    soundsBus(ctx.bus).tapSoundSources('audio', (payload) => {
      for (const obj of this.layer.placeables) {
        const doc = obj.document;
        if (doc.id === undefined) continue;
        payload.sources.push({
          key: doc.id,
          x: obj.x,
          y: obj.y,
          radius: doc.radius,
          src: doc.src,
          volume: doc.volume,
          channel: doc.channel,
          loop: doc.loop,
          playing: doc.playing,
          global: doc.global,
        });
      }
      return payload;
    });

    const dyn = dynamicBus(ctx.bus);
    this.unsubs.push(
      dyn.on('sound:create', (doc: SoundData) => this.syncSound(doc)),
      dyn.on('sound:update', (doc: SoundData) => this.syncSound(doc)),
      dyn.on('sound:delete', ({ id }: { id: string }) => this.releaseSource(id)),
    );

    ctx.bus.tap('scene:teardown', 'audio', () => {
      this.releaseAll();
    });

    const attachTicker = (): void => {
      if (this.tickerFn) return;
      this.tickerFn = () => this.syncFrame();
      ctx.canvas.app.ticker.add(this.tickerFn);
    };
    if (ctx.canvas.app.ticker) attachTicker();
    else this.unsubs.push(ctx.bus.once('ready', () => attachTicker()));

    registerSoundsContextMenu(ctx, this);

    ctx.onDispose(() => {
      if (this.tickerFn) ctx.canvas.app.ticker?.remove(this.tickerFn);
      this.tickerFn = null;
      for (const unsub of this.unsubs) unsub();
      this.unsubs.length = 0;
      this.releaseAll();
    });
  }

  setListenerMode(mode: ListenerMode): void {
    this.listener.setMode(mode);
  }

  followToken(tokenId: string | null): void {
    this.listener.followToken(tokenId);
  }

  attachToToken(soundKey: string, tokenId: string): void {
    this.attached.set(soundKey, tokenId);
  }

  detachFromToken(soundKey: string): void {
    this.attached.delete(soundKey);
  }

  previewSound(soundKey: string, changes: Partial<SoundData>): void {
    const obj = this.layer.get(soundKey);
    if (!obj) return;
    obj.update(changes);
    this.syncFrame(true);
  }

  syncNow(): void {
    this.syncFrame(true);
  }

  private syncSound(doc: SoundData): void {
    if (doc.id === undefined) return;
    this.syncSource({
      key: doc.id,
      x: doc.x,
      y: doc.y,
      radius: doc.radius,
      src: doc.src,
      volume: doc.volume,
      channel: doc.channel,
      loop: doc.loop,
      playing: doc.playing,
      global: doc.global,
    });
  }

  private syncFrame(force = false): void {
    const now = this.engine.clock.now();
    if (!force && now - this.lastUpdate < this.updateIntervalMs) return;
    this.lastUpdate = now;

    this.listener.apply(this.ctx, this.engine);
    const payload = soundsBus(this.ctx.bus).callSoundSources({ sources: [] });
    const seen = new Set<string>();
    for (const source of payload.sources) {
      seen.add(source.key);
      this.syncSource(source);
    }
    for (const key of [...this.syncState.keys()]) {
      if (!seen.has(key)) this.releaseSource(key);
    }
  }

  private syncSource(source: SoundSource): void {
    const key = source.key;
    let state = this.syncState.get(key);
    if (state && !sameSrc(state.src, source.src)) {
      this.releaseSource(key);
      state = undefined;
    }

    if (!state) {
      const soundId = this.engine.register({
        ...(v.is(UuidSchema, key) ? { id: key } : {}),
        src: source.src,
        volume: source.volume,
        channel: source.channel,
        loop: source.loop,
      });
      state = {
        soundId,
        src: source.src,
        volume: source.volume,
        channel: source.channel,
        radius: -1,
        playing: false,
      };
      this.syncState.set(key, state);
    }
    const soundId = state.soundId;
    if (!this.engine.has(soundId)) return;

    if (state.volume !== source.volume) {
      this.engine.setVolume(soundId, source.volume);
      state.volume = source.volume;
    }
    if (state.channel !== source.channel) {
      this.engine.setChannel(soundId, source.channel);
      state.channel = source.channel;
    }

    if (!source.global) {
      const position = this.sourcePosition(source);
      const gridSize = this.ctx.canvas.grid.size || 1;
      const scale = this.ctx.canvas.viewport?.scale ?? 1;
      const mapped = this.listener.mapper({ x: position.x, y: position.y, gridSize, scale });
      this.engine.setPosition(soundId, mapped.x, mapped.y, mapped.z);
      if (state.radius !== source.radius) {
        this.engine.setSpatialAttrs(soundId, spatialAttrsForRadius(source.radius));
        state.radius = source.radius;
      }
    }

    if (source.playing && !state.playing) {
      this.engine.play(soundId);
      this.engine.flush();
    } else if (!source.playing && state.playing) {
      this.engine.stop(soundId);
      this.engine.flush();
    }
    state.playing = source.playing;
  }

  private sourcePosition(source: SoundSource): { x: number; y: number } {
    const tokenId = this.attached.get(source.key);
    if (tokenId) {
      const token = this.ctx.canvas.documents.layer('token')?.get(tokenId);
      if (token) return { x: token.x, y: token.y };
    }
    return { x: source.x, y: source.y };
  }

  private releaseSource(key: string): void {
    const state = this.syncState.get(key);
    if (state) {
      if (this.engine.has(state.soundId)) {
        this.engine.stop(state.soundId);
        this.engine.flush();
        this.engine.unregister(state.soundId);
      }
      this.syncState.delete(key);
    }
    this.attached.delete(key);
  }

  private releaseAll(): void {
    for (const key of [...this.syncState.keys()]) this.releaseSource(key);
  }
}

export function createAudioPlugin(options: AudioPluginOptions = {}): AudioPlugin {
  return new AudioPlugin(options);
}

export function audioControllerFor(ctx: PluginContext): AudioPlugin | undefined {
  return ctx.canvas.plugins.get<AudioPlugin>('audio');
}
