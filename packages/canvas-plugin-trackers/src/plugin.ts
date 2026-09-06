import {
  dynamicBus,
  type CanvasPlugin,
  type PluginContext,
} from '@openvtt/canvas';
import * as v from 'valibot';
import {
  EVERYTHING_VIEWER,
  resolveTracker,
  type ResolvedTracker,
  type TrackerUiState,
  type ViewerContext,
} from './resolve';
import { TrackerOverlay } from './render';
import { TrackerStore, type MathApplyResult, type TrackerResolver } from './store';
import {
  TrackersAppliedEventSchema,
  TrackersChangedEventSchema,
  TrackersLabelHookSchema,
  TrackersResolveHookSchema,
  TrackersValueEventSchema,
  TrackersVisibilityHookSchema,
  type Tracker,
  type TrackerInput,
  type TrackersAppliedEvent,
  type TrackersChangedEvent,
  type TrackersLabelPayload,
  type TrackersResolvePayload,
  type TrackersSnapshot,
  type TrackersValueEvent,
  type TrackersVisibilityPayload,
} from './schemas';
import {
  BUILTIN_PRESETS,
  type TrackerPreset,
} from './presets';
import { trackersSceneMenu, trackersSelectionMenu, type TrackersMenuApi } from './contextmenu';
import { trackerBusPort, type TrackerBusPort } from './hooks';

export interface TrackersPluginOptions {
  /** Quem visualiza a cena (papel/posse) — objeto ou factory avaliado a cada resolução. */
  viewer?: ViewerContext | (() => ViewerContext);
  /** Aplica defaults de cena a tokens recém-criados. Default false. */
  autoApplyDefaults?: boolean;
  /** Defaults de cena iniciais. */
  defaults?: readonly TrackerInput[];
}

/**
 * Plugin de trackers de tokens: estado por token + defaults de cena, edição
 * por context menu, renderização Pixi e pipeline extensível por hooks do bus
 * (`trackers:resolve|label|visibility`) e resolvers de valor customizados.
 */
export class TrackersPlugin implements CanvasPlugin, TrackersMenuApi {
  readonly id = 'trackers';
  readonly name = 'Trackers';
  readonly dependencies = ['tokens'];

  readonly store = new TrackerStore();

  private readonly options: TrackersPluginOptions;
  private readonly presetMap = new Map<string, TrackerPreset>();
  private readonly overlayDeps = {
    resolve: (tokenId: string, ui: TrackerUiState): readonly ResolvedTracker[] => this.resolve(tokenId, ui),
    uiStateOf: (tokenId: string): TrackerUiState => this.uiStateOf(tokenId),
  };
  private overlay: TrackerOverlay | null = null;
  private ctx: PluginContext | null = null;
  private hooks: TrackerBusPort | null = null;
  private hoveredId: string | null = null;
  private prevSelection = new Set<string>();
  private autoApply: boolean;

  constructor(options: TrackersPluginOptions = {}) {
    this.options = options;
    this.autoApply = options.autoApplyDefaults ?? false;
    for (const preset of BUILTIN_PRESETS) this.presetMap.set(preset.id, preset);
  }

  install(ctx: PluginContext): void {
    this.ctx = ctx;
    this.hooks = trackerBusPort(ctx.bus);

    ctx.bus.registerEvent('trackers:changed', TrackersChangedEventSchema);
    ctx.bus.registerEvent('trackers:value', TrackersValueEventSchema);
    ctx.bus.registerEvent('trackers:applied', TrackersAppliedEventSchema);
    ctx.bus.registerHook('trackers:resolve', { strategy: 'syncWaterfall', schema: TrackersResolveHookSchema });
    ctx.bus.registerHook('trackers:label', { strategy: 'syncWaterfall', schema: TrackersLabelHookSchema });
    ctx.bus.registerHook('trackers:visibility', { strategy: 'syncWaterfall', schema: TrackersVisibilityHookSchema });

    if (this.options.defaults && this.options.defaults.length > 0) {
      this.store.setDefaults(this.options.defaults);
    }

    this.overlay = new TrackerOverlay(this.overlayDeps);

    const emit = (name: string, payload: unknown): void => {
      dynamicBus(ctx.bus).emit(name, payload);
    };
    const unlistenStore = this.store.onChange((event) => {
      switch (event.kind) {
        case 'value':
          emit('trackers:value', {
            tokenId: event.tokenId,
            trackerId: event.tracker.id,
            name: event.tracker.name,
            before: event.before,
            after: event.tracker.value,
          } satisfies TrackersValueEvent);
          emit('trackers:changed', { scope: 'token', tokenId: event.tokenId, trackerId: event.tracker.id });
          this.overlay?.refresh(event.tokenId);
          break;
        case 'upsert':
        case 'patch':
          emit('trackers:changed', {
            scope: 'token',
            tokenId: event.tokenId,
            trackerId: event.tracker.id,
          } satisfies TrackersChangedEvent);
          this.overlay?.refresh(event.tokenId);
          break;
        case 'remove':
        case 'reorder':
        case 'clear':
          emit('trackers:changed', {
            scope: 'token',
            tokenId: event.tokenId,
            trackerId: 'trackerId' in event ? event.trackerId : undefined,
          } satisfies TrackersChangedEvent);
          this.overlay?.refresh(event.tokenId);
          break;
        case 'defaults':
          emit('trackers:changed', { scope: 'defaults' } satisfies TrackersChangedEvent);
          break;
        case 'applied':
          emit('trackers:applied', {
            tokenIds: [...event.tokenIds],
            count: event.count,
          } satisfies TrackersAppliedEvent);
          for (const tokenId of event.tokenIds) this.overlay?.refresh(tokenId);
          break;
        case 'prune':
          emit('trackers:changed', { scope: 'all' } satisfies TrackersChangedEvent);
          break;
        case 'reset':
          emit('trackers:changed', { scope: 'all' } satisfies TrackersChangedEvent);
          this.overlay?.refreshAll();
          break;
      }
    });

    const port = dynamicBus(ctx.bus);
    const unsubs: Array<() => void> = [unlistenStore];

    unsubs.push(
      port.on('token:create', (document: { id?: string }) => {
        const id = document?.id;
        if (!id) return;
        this.bindToken(id);
        if (this.autoApply) this.store.applyDefaultsTo([id]);
      }),
    );
    unsubs.push(
      port.on('token:update', (document: { id?: string }) => {
        if (document?.id) this.overlay?.refresh(document.id);
      }),
    );
    unsubs.push(
      port.on('token:delete', (payload: { id?: string }) => {
        const id = payload?.id;
        if (!id) return;
        this.overlay?.detach(id);
        if (this.hoveredId === id) this.hoveredId = null;
      }),
    );
    unsubs.push(
      ctx.bus.on('selection:change', ({ ids }) => {
        const current = new Set(ids);
        const affected = new Set<string>();
        for (const id of current) if (!this.prevSelection.has(id)) affected.add(id);
        for (const id of this.prevSelection) if (!current.has(id)) affected.add(id);
        this.prevSelection = current;
        for (const id of affected) this.overlay?.refresh(id);
      }),
    );
    unsubs.push(
      ctx.bus.on('pointermove', ({ x, y }) => {
        this.updateHover(x, y);
      }),
    );

    ctx.bus.tap('scene:teardown', 'trackers', () => {
      this.overlay?.destroyAll();
      this.hoveredId = null;
      this.prevSelection.clear();
    });

    for (const token of this.tokensLayer(ctx)?.placeables ?? []) {
      this.overlay.attach(token);
    }

    ctx.registerContextMenu(trackersSelectionMenu(this));
    ctx.registerContextMenu(trackersSceneMenu(this));

    ctx.onDispose(() => {
      for (const unsub of unsubs) unsub();
      this.overlay?.destroyAll();
      this.overlay = null;
      this.ctx = null;
      this.hooks = null;
      this.hoveredId = null;
    });
  }

  uninstall(): void {
    this.overlay?.destroyAll();
    this.overlay = null;
  }

  /* --------------------------- resolução --------------------------- */

  /** Viewer atual (opção estática ou factory). */
  get viewer(): ViewerContext {
    const viewer = this.options.viewer;
    if (typeof viewer === 'function') return viewer();
    return viewer ?? EVERYTHING_VIEWER;
  }

  private uiStateOf(tokenId: string): TrackerUiState {
    return {
      hovered: this.hoveredId === tokenId,
      selected: this.ctx?.canvas.selection.has(tokenId) ?? false,
    };
  }

  /**
   * Pipeline completo de resolução: fonte (inline/resolver) → hook
   * `trackers:resolve` → rótulo/visibilidade base → hooks `trackers:label` e
   * `trackers:visibility`. Saídas de hooks inválidas revertem para o valor
   * pré-hook. Público — hosts podem renderizar trackers em UI própria sem
   * tocar no renderer Pixi.
   */
  resolve(tokenId: string, ui: TrackerUiState = { hovered: false, selected: false }): readonly ResolvedTracker[] {
    const viewer = this.viewer;
    return this.store.list(tokenId).map((tracker) => {
      const source = this.store.resolveSource(tokenId, tracker);
      const ref = { id: tracker.id, name: tracker.name, kind: tracker.kind };
      const resolveInput: TrackersResolvePayload = {
        tokenId,
        tracker: ref,
        value: source.value,
        max: source.max,
      };
      const hooked = this.callHook('trackers:resolve', resolveInput, resolveInput);
      const base = resolveTracker(
        tokenId,
        tracker,
        { value: hooked.value, max: hooked.max ?? tracker.max },
        viewer,
        ui,
      );
      const labeled = this.callHook(
        'trackers:label',
        {
          tokenId,
          tracker: ref,
          value: base.value,
          max: base.max,
          label: base.label,
        },
        { tokenId, tracker: ref, value: base.value, max: base.max, label: base.label },
      );
      const visibility = this.callHook(
        'trackers:visibility',
        { tokenId, tracker: ref, visible: base.visible },
        { tokenId, tracker: ref, visible: base.visible },
      );
      return { ...base, label: labeled.label, visible: visibility.visible };
    });
  }

  private callHook<T extends object>(name: string, payload: T, fallback: T): T {
    if (!this.hooks) return fallback;
    const outcome = this.hooks.call<T>(name, payload);
    const parsed = v.safeParse(this.hookSchema(name), outcome);
    return parsed.success ? (parsed.output as T) : fallback;
  }

  private hookSchema(name: string) {
    switch (name) {
      case 'trackers:resolve':
        return TrackersResolveHookSchema;
      case 'trackers:label':
        return TrackersLabelHookSchema;
      default:
        return TrackersVisibilityHookSchema;
    }
  }

  private updateHover(x: number, y: number): void {
    const layer = this.tokensLayer(this.ctx);
    if (!layer || !this.overlay) return;
    const hit = layer.pick({ x, y });
    const id = hit?.id ?? null;
    if (id === this.hoveredId) return;
    const previous = this.hoveredId;
    this.hoveredId = id;
    if (previous) this.overlay.refresh(previous);
    if (id) this.overlay.refresh(id);
  }

  private tokensLayer(ctx: PluginContext | null) {
    return ctx?.canvas.documents.layer('token');
  }

  private bindToken(tokenId: string): void {
    const token = this.tokensLayer(this.ctx)?.get(tokenId);
    if (token && this.overlay && !this.overlay.has(tokenId)) this.overlay.attach(token);
  }

  /* ------------------------------ estado ------------------------------ */

  list(tokenId: string): readonly Tracker[] {
    return this.store.list(tokenId);
  }

  get(tokenId: string, trackerId: string): Tracker | undefined {
    return this.store.get(tokenId, trackerId);
  }

  upsert(tokenId: string, input: TrackerInput): Tracker {
    return this.store.upsert(tokenId, input);
  }

  patch(tokenId: string, trackerId: string, changes: Partial<TrackerInput>): Tracker | undefined {
    return this.store.patch(tokenId, trackerId, changes);
  }

  reorder(tokenId: string, trackerId: string, toIndex: number): boolean {
    return this.store.reorder(tokenId, trackerId, toIndex);
  }

  remove(tokenId: string, trackerId?: string): boolean {
    return this.store.remove(tokenId, trackerId);
  }

  setValue(tokenId: string, trackerId: string, value: number): Tracker | undefined {
    return this.store.setValue(tokenId, trackerId, value);
  }

  applyMathInput(tokenId: string, trackerId: string, input: string): MathApplyResult {
    return this.store.applyMathInput(tokenId, trackerId, input);
  }

  defaults(): readonly Tracker[] {
    return this.store.defaults();
  }

  /** Evicta estado de tokens deletados (chamar no save da cena). */
  prune(validTokenIds: Iterable<string>): number {
    return this.store.prune(validTokenIds);
  }

  setDefaults(inputs: readonly TrackerInput[]): readonly Tracker[] {
    return this.store.setDefaults(inputs);
  }

  saveAsDefaults(tokenId: string): boolean {
    return this.store.saveAsDefaults(tokenId);
  }

  applyDefaultsTo(tokenIds: readonly string[]): number {
    return this.store.applyDefaultsTo(tokenIds);
  }

  get autoApplyDefaults(): boolean {
    return this.autoApply;
  }

  setAutoApplyDefaults(value: boolean): void {
    this.autoApply = value;
  }

  /* ------------------------------ presets ------------------------------ */

  presets(): readonly TrackerPreset[] {
    return [...this.presetMap.values()];
  }

  registerPreset(preset: TrackerPreset): () => void {
    this.presetMap.set(preset.id, preset);
    return () => this.presetMap.delete(preset.id);
  }

  /* ------------------------------ resolvers ------------------------------ */

  registerResolver(id: string, resolver: TrackerResolver): () => void {
    return this.store.registerResolver(id, resolver);
  }

  /* --------------------------- serialização --------------------------- */

  serialize(): TrackersSnapshot {
    return this.store.serialize();
  }

  hydrate(snapshot: unknown): void {
    this.store.hydrate(snapshot);
  }

  /* ------------------------------ render ------------------------------ */

  refresh(tokenId: string): void {
    this.overlay?.refresh(tokenId);
  }

  refreshAll(): void {
    this.overlay?.refreshAll();
  }
}

export const trackersPlugin = new TrackersPlugin();
