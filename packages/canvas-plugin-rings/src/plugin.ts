import * as v from 'valibot';
import { dynamicBus, type PlaceablesLayer, type PluginContext } from '@openvtt/canvas';
import { Ring } from './placeables/Ring';
import { RingDataSchema, RingStyleSchema, DEFAULT_RING_STYLE, type RingData, type RingDataInput, type RingStyle, type RingStyleInput } from './schemas';
import { COLOR_PRESETS, CONDITION_PRESETS, RingPresetRegistry, type RingPresetInput } from './presets';
import { DEFAULT_RING_LAYOUT, ringSlots, sortRingsForLayout, type RingLayoutOptions } from './layout';
import { registerRingsContextMenu } from './context';
import { ringsBus, type RingStyleContext } from './bus';

export type RingsLayer = PlaceablesLayer<RingData, Ring, RingDataInput>;
export type RingSource = string | RingStyleInput;

export interface RingsPluginOptions {
  presets?: readonly RingPresetInput[];
  layout?: Partial<RingLayoutOptions>;
}

export interface AddRingOptions {
  label?: string;
  order?: number;
}

interface TokenLike {
  readonly x: number;
  readonly y: number;
  readonly document?: { readonly size?: number; readonly rotation?: number; readonly hidden?: boolean };
}

interface SceneLike {
  rings?: unknown[];
}

interface SceneRingEntry {
  preset?: unknown;
  label?: unknown;
  style?: unknown;
}

export class RingsPlugin {
  readonly id = 'rings';
  readonly name = 'Rings';
  readonly dependencies = ['tokens'] as const;

  layer!: RingsLayer;
  readonly presets = new RingPresetRegistry();
  layout: RingLayoutOptions;

  private ctx!: PluginContext;
  private readonly ringToken = new Map<string, string>();
  private readonly unsubs: Array<() => void> = [];
  private tickerFn: (() => void) | null = null;

  constructor(options: RingsPluginOptions = {}) {
    this.layout = { ...DEFAULT_RING_LAYOUT, ...options.layout };
    for (const preset of [...COLOR_PRESETS, ...CONDITION_PRESETS, ...(options.presets ?? [])]) this.presets.register(preset);
  }

  install(ctx: PluginContext): void {
    this.ctx = ctx;
    this.layer = ctx.registerDocumentType<RingData, RingDataInput>({
      type: 'ring',
      schema: RingDataSchema,
      placeable: Ring,
      layer: { label: 'Rings', order: 490 },
      sceneKey: 'rings',
    }) as RingsLayer;

    ctx.bus.registerEvent('ring:added', v.object({ ring: RingDataSchema, tokenId: v.string() }));
    ctx.bus.registerEvent('ring:removed', v.object({ ringId: v.string(), tokenId: v.string() }));
    ctx.bus.registerEvent('rings:cleared', v.object({ tokenId: v.string(), count: v.number() }));
    ctx.bus.registerHook('rings:resolve-style', {
      strategy: 'syncWaterfall',
      schema: v.looseObject({
        ring: v.looseObject({
          id: v.string(),
          tokenId: v.string(),
          preset: v.optional(v.string()),
          label: v.optional(v.string()),
        }),
        style: RingStyleSchema,
      }),
    });

    const dyn = dynamicBus(ctx.bus);
    this.unsubs.push(
      dyn.on('ring:create', (doc: RingData) => {
        if (doc.id === undefined) return;
        this.ringToken.set(doc.id, doc.tokenId);
        this.relayout(doc.tokenId);
        dyn.emit('ring:added', { ring: doc, tokenId: doc.tokenId });
      }),
      dyn.on('ring:update', (doc: RingData) => this.relayout(doc.tokenId)),
      dyn.on('ring:delete', ({ id }: { id: string }) => {
        const tokenId = this.ringToken.get(id);
        this.ringToken.delete(id);
        if (tokenId !== undefined) {
          this.relayout(tokenId);
          dyn.emit('ring:removed', { ringId: id, tokenId });
        }
      }),
      dyn.on('token:delete', ({ id }: { id: string }) => this.cascadeDelete(id)),
    );

    ctx.bus.tap('scene:teardown', 'rings', () => {
      this.ringToken.clear();
    });

    ctx.bus.tap('beforeDraw', 'rings', (payload) => {
      this.applyPresetStylesToScene(payload.scene as SceneLike);
      return payload;
    });

    const attachTicker = (): void => {
      if (this.tickerFn) return;
      this.tickerFn = () => this.syncFrame();
      ctx.canvas.app.ticker.add(this.tickerFn);
    };
    if (ctx.canvas.app.ticker) attachTicker();
    else this.unsubs.push(ctx.bus.once('ready', () => attachTicker()));

    registerRingsContextMenu(ctx, this);

    ctx.onDispose(() => {
      if (this.tickerFn) ctx.canvas.app.ticker?.remove(this.tickerFn);
      this.tickerFn = null;
      for (const unsub of this.unsubs) unsub();
      this.unsubs.length = 0;
      this.ringToken.clear();
    });
  }

  ringsOf(tokenId: string): Ring[] {
    this.assertInstalled();
    return this.layer.placeables.filter((ring) => ring.document.tokenId === tokenId);
  }

  hasRing(tokenId: string, source: RingSource): boolean {
    return this.findRing(tokenId, source) !== undefined;
  }

  async addRing(tokenId: string, source: RingSource, options?: AddRingOptions): Promise<Ring | null> {
    this.assertInstalled();
    const existing = this.findRing(tokenId, source);
    if (existing) return existing;
    let style: RingStyle;
    let presetLabel: string | undefined;
    let presetId: string | undefined;
    if (typeof source === 'string') {
      const preset = this.presets.get(source);
      if (!preset) return null;
      style = preset.style;
      presetLabel = preset.label;
      presetId = source;
    } else {
      style = v.parse(RingStyleSchema, source);
    }
    const label = options?.label ?? presetLabel;
    const input: RingDataInput = {
      tokenId,
      order: options?.order ?? this.ringsOf(tokenId).length,
      style,
    };
    if (presetId !== undefined) input.preset = presetId;
    if (label !== undefined) input.label = label;
    return (await this.ctx.canvas.documents.create<RingData, RingDataInput>('ring', input)) as Ring;
  }

  removeRing(ringId: string): boolean {
    this.assertInstalled();
    return this.ctx.canvas.documents.delete('ring', ringId);
  }

  async toggleRing(tokenId: string, source: RingSource, options?: AddRingOptions): Promise<boolean> {
    const existing = this.findRing(tokenId, source);
    if (existing) {
      this.removeRing(existing.id);
      return false;
    }
    return (await this.addRing(tokenId, source, options)) !== null;
  }

  clearRings(tokenId: string): number {
    this.assertInstalled();
    const rings = this.ringsOf(tokenId);
    const count = rings.length;
    if (count === 0) return 0;
    const history = this.ctx.canvas.history;
    history.beginBatch();
    try {
      for (const ring of rings) this.ctx.canvas.documents.delete('ring', ring.id);
    } finally {
      history.endBatch();
    }
    dynamicBus(this.ctx.bus).emit('rings:cleared', { tokenId, count });
    return count;
  }

  registerPreset(preset: RingPresetInput): this {
    this.presets.register(preset);
    return this;
  }

  refreshStyles(): void {
    this.assertInstalled();
    for (const ring of this.layer.placeables) {
      ring.resolvedStyle = this.resolveStyle(ring);
      ring.refresh();
    }
  }

  pruneOrphans(): number {
    this.assertInstalled();
    const tokensLayer = this.ctx.canvas.documents.layer('token');
    const orphans = this.layer.placeables.filter((ring) => !tokensLayer?.get(ring.document.tokenId));
    if (orphans.length === 0) return 0;
    const history = this.ctx.canvas.history;
    history.beginBatch();
    try {
      for (const ring of orphans) this.ctx.canvas.documents.delete('ring', ring.id);
    } finally {
      history.endBatch();
    }
    return orphans.length;
  }

  private findRing(tokenId: string, source: RingSource): Ring | undefined {
    const rings = this.ringsOf(tokenId);
    if (typeof source === 'string') {
      return rings.find((ring) => ring.document.preset === source);
    }
    const color = (source.color ?? DEFAULT_RING_STYLE.color).toLowerCase();
    return rings.find(
      (ring) => ring.document.preset === undefined && ring.resolvedStyle.color.toLowerCase() === color,
    );
  }

  private applyPresetStylesToScene(scene: SceneLike | undefined): void {
    const rings = scene?.rings;
    if (!Array.isArray(rings)) return;
    for (let i = 0; i < rings.length; i++) {
      const entry = rings[i];
      if (entry === null || typeof entry !== 'object') continue;
      const e = entry as SceneRingEntry;
      if (typeof e.preset !== 'string') continue;
      const preset = this.presets.get(e.preset);
      if (!preset) continue;
      const inline = e.style !== null && typeof e.style === 'object' ? (e.style as Record<string, unknown>) : {};
      const merged = { ...preset.style, ...inline };
      const next: Record<string, unknown> = { ...(entry as Record<string, unknown>), style: merged };
      if (e.label === undefined) next.label = preset.label;
      rings[i] = next as unknown;
    }
  }

  private resolveStyle(ring: Ring): RingStyle {
    const doc = ring.document;
    const ctx: RingStyleContext = {
      ring: { id: ring.id, tokenId: doc.tokenId, preset: doc.preset, label: doc.label },
      style: { ...doc.style },
    };
    return ringsBus(this.ctx.bus).callResolveStyle(ctx).style;
  }

  private relayout(tokenId: string): void {
    const rings = sortRingsForLayout(this.ringsOf(tokenId));
    const slots = ringSlots(rings.length, this.layout);
    for (let i = 0; i < rings.length; i++) {
      rings[i].slot = slots[i];
      rings[i].resolvedStyle = this.resolveStyle(rings[i]);
      rings[i].refresh();
    }
  }

  private cascadeDelete(tokenId: string): void {
    const rings = this.ringsOf(tokenId);
    if (rings.length === 0) return;
    const history = this.ctx.canvas.history;
    history.beginBatch();
    try {
      for (const ring of rings) this.ctx.canvas.documents.delete('ring', ring.id);
    } finally {
      history.endBatch();
    }
  }

  private syncFrame(): void {
    const tokensLayer = this.ctx.canvas.documents.layer('token');
    const gridSize = this.ctx.canvas.grid.size;
    for (const ring of this.layer.objects.values()) {
      const token = tokensLayer?.get(ring.document.tokenId) as TokenLike | undefined;
      if (!token) {
        if (ring.visible) ring.visible = false;
        continue;
      }
      ring.applyGeometry(
        token.x,
        token.y,
        ((token.document?.size ?? 1) * gridSize) / 2,
        token.document?.rotation ?? 0,
        token.document?.hidden ?? false,
      );
      if (ring.resolvedStyle.pulse) {
        ring.setAlphaMultiplier(0.55 + 0.45 * Math.sin(performance.now() / 280 + ring.slot.index * 1.7));
      } else if (ring.alphaMultiplier !== 1) {
        ring.setAlphaMultiplier(1);
      }
    }
  }

  private assertInstalled(): void {
    if (!this.ctx || !this.layer) throw new Error('[rings] plugin not installed');
  }
}

export const ringsPlugin = new RingsPlugin();
