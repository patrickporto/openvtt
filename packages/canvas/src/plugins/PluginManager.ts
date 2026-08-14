import type { Canvas } from '../canvas';
import type { CanvasBus } from '../bus';
import type { PlaceablesLayer } from '../layers/PlaceablesLayer';
import type { PlaceableObject } from '../placeables/PlaceableObject';
import type {
  CanvasPlugin,
  DocumentTypeDefinition,
  LayerContribution,
  PluginContext,
  ToolContribution,
} from './types';

class PluginContextImpl implements PluginContext {
  readonly canvas: Canvas;
  readonly bus: CanvasBus;
  private readonly disposers: Array<() => void> = [];

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    this.bus = canvas.bus;
  }

  registerDocumentType<D, I = D>(def: DocumentTypeDefinition<D, I>): PlaceablesLayer<D, PlaceableObject<D>, I> {
    return this.canvas.documents.registerType(def);
  }

  registerLayer(contribution: LayerContribution): void {
    const { id, label, layer, order, ...rest } = contribution;
    this.canvas.stage.addChild(layer);
    this.canvas.layers.register(id, label, layer, { order, ...rest });
    this.disposers.push(() => {
      this.canvas.layers.unregister(id);
      layer.destroy({ children: true });
    });
  }

  registerTool(contribution: ToolContribution): void {
    this.canvas.registerTool(contribution);
  }

  onDispose(fn: () => void): void {
    this.disposers.push(fn);
  }

  dispose(): void {
    for (const fn of this.disposers.splice(0)) {
      try {
        fn();
      } catch (error) {
        console.error('[canvas] plugin dispose error', error);
      }
    }
  }
}

interface InstalledPlugin {
  plugin: CanvasPlugin;
  context: PluginContextImpl;
}

/**
 * Gerencia o ciclo de vida dos plugins do canvas. Plugins são instalados com
 * `use()` — idealmente antes de `canvas.initialize()` — e recebem um
 * `PluginContext` para contribuir tipos de documento, layers, tools, hooks e
 * listeners. Dependências são resolvidas em ordem topológica; plugins
 * ausentes são instalados sob demanda quando passados como objetos em
 * `dependencies` não são suportados — declare-os com `use()` antes.
 */
export class PluginManager {
  private readonly canvas: Canvas;
  private readonly installed = new Map<string, InstalledPlugin>();
  private installing = new Set<string>();

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  /** Instala o plugin (e dependências já registradas) respeitando a ordem. */
  async use(plugin: CanvasPlugin): Promise<this> {
    if (this.installed.has(plugin.id)) return this;
    if (this.installing.has(plugin.id)) {
      throw new Error(`[canvas] circular plugin dependency involving "${plugin.id}"`);
    }
    this.installing.add(plugin.id);
    try {
      for (const dep of plugin.dependencies ?? []) {
        if (!this.installed.has(dep)) {
          throw new Error(`[canvas] plugin "${plugin.id}" requires "${dep}" — install it first with canvas.use()`);
        }
      }
      const context = new PluginContextImpl(this.canvas);
      await plugin.install(context);
      this.installed.set(plugin.id, { plugin, context });
      this.canvas.bus.emit('plugin:registered', { id: plugin.id });
    } finally {
      this.installing.delete(plugin.id);
    }
    return this;
  }

  async unuse(id: string): Promise<void> {
    const entry = this.installed.get(id);
    if (!entry) return;
    for (const other of this.installed.values()) {
      if (other.plugin.dependencies?.includes(id)) {
        throw new Error(`[canvas] cannot uninstall "${id}": required by "${other.plugin.id}"`);
      }
    }
    await entry.plugin.uninstall?.(entry.context);
    entry.context.dispose();
    this.installed.delete(id);
  }

  has(id: string): boolean {
    return this.installed.has(id);
  }

  /** Retorna a instância do plugin (para acesso a APIs expostas pelo próprio plugin). */
  get<P extends CanvasPlugin = CanvasPlugin>(id: string): P | undefined {
    return this.installed.get(id)?.plugin as P | undefined;
  }

  list(): string[] {
    return [...this.installed.keys()];
  }

  async disposeAll(): Promise<void> {
    this.disposeAllSync();
  }

  /**
   * Descarte síncrono (usado no Canvas.destroy): roda os disposers dos
   * contexts e os uninstalls best-effort sem aguardar microtasks.
   */
  disposeAllSync(): void {
    for (const [id] of [...this.installed].reverse()) {
      const entry = this.installed.get(id);
      if (!entry) continue;
      try {
        entry.plugin.uninstall?.(entry.context);
        entry.context.dispose();
      } catch (error) {
        console.error(`[canvas] error uninstalling plugin "${id}"`, error);
      }
    }
    this.installed.clear();
  }
}
