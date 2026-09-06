import * as v from 'valibot';
import type { CanvasLike, CanvasPlugin, PluginContext } from '@openvtt/canvas';
import { MapPlaceable } from './placeables/MapPlaceable';
import { MapSourceRegistry } from './MapSourceRegistry';
import { MapDataSchema, type MapData } from './schemas';
import { registerMapsContextMenu } from './context';

export class MapsPlugin implements CanvasPlugin {
  readonly id = 'maps';
  readonly name = 'Maps';
  private activeRegistry: MapSourceRegistry | null = null;
  private watcher: (() => void) | null = null;

  constructor(private readonly providedRegistry?: MapSourceRegistry) {}

  install(ctx: PluginContext): void {
    const registry = this.providedRegistry ?? new MapSourceRegistry();
    this.activeRegistry = registry;

    class RegisteredMap extends MapPlaceable {
      constructor(document: MapData, canvas: CanvasLike) {
        super(document, canvas, registry);
      }
    }

    ctx.registerDocumentType<MapData>({
      type: 'map',
      schema: MapDataSchema,
      placeable: RegisteredMap,
      layer: { label: 'Maps', order: 50 },
      sceneKey: 'maps',
      transform: {
        snapshotFields(obj) {
          const doc = obj.document;
          return { x: obj.x, y: obj.y, width: doc.width, height: doc.height };
        },
        applyResize(_obj, rect) {
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        },
      },
      behavior: {},
    });

    ctx.bus.registerEvent(
      'map:progress',
      v.object({ id: v.string(), src: v.string(), loaded: v.number(), total: v.number() }),
    );
    ctx.bus.registerEvent(
      'map:loaded',
      v.object({
        id: v.string(),
        src: v.string(),
        width: v.number(),
        height: v.number(),
        levels: v.number(),
      }),
    );
    ctx.bus.registerEvent(
      'map:error',
      v.object({ id: v.string(), src: v.string(), message: v.string() }),
    );

    const canvas = ctx.canvas;
    const watch = (): void => {
      const viewport = canvas.viewport;
      if (!viewport) return;
      const layer = canvas.documents?.layer('map');
      if (!layer || layer.placeables.length === 0) return;
      const near = viewport.toLocal({ x: 0, y: 0 });
      const far = viewport.toLocal({ x: viewport.state.screenWidth, y: viewport.state.screenHeight });
      const view = { x: near.x, y: near.y, width: far.x - near.x, height: far.y - near.y };
      for (const obj of layer.placeables) {
        if (obj instanceof MapPlaceable) obj.updateTiledView(view, viewport.scale);
      }
    };
    const attach = (): void => {
      if (this.watcher) return;
      canvas.app.ticker.add(watch);
      this.watcher = watch;
    };
    if (canvas.app.ticker) attach();
    ctx.bus.on('ready', attach);
    ctx.onDispose(() => {
      if (this.watcher) canvas.app.ticker?.remove(this.watcher);
      this.watcher = null;
      registry.clear();
      if (this.activeRegistry === registry) this.activeRegistry = null;
    });

    registerMapsContextMenu(ctx);
  }

  get registry(): MapSourceRegistry | null {
    return this.activeRegistry ?? this.providedRegistry ?? null;
  }
}

export const mapsPlugin = new MapsPlugin();
