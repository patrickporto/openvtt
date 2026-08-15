import * as v from 'valibot';
import type { Canvas } from './canvas';
import { PlaceablesLayer } from './layers/PlaceablesLayer';
import type { PlaceableObject } from './placeables/PlaceableObject';
import type { DocumentTypeDefinition } from './plugins/types';

type AnyDocLayer = PlaceablesLayer<any, PlaceableObject<any>, any>;

const DeleteEventSchema = v.object({ id: v.string() });

interface RegisteredType {
  def: DocumentTypeDefinition<any, any>;
  layer: AnyDocLayer;
}

/**
 * Registro central de tipos de documento do canvas. Plugins declaram tipos
 * via `registerType`; o core cria a layer, registra os eventos
 * `<type>:create|update|delete` no bus, integra histórico/picking/seleção e
 * instancia documentos a partir da cena (`sceneKey` ou `scene.documents`).
 */
export class DocumentRegistry {
  private readonly canvas: Canvas;
  private readonly byType = new Map<string, RegisteredType>();
  private readonly byLayerId = new Map<string, RegisteredType>();
  /** Chamado para cada layer criada — usado pelo HistoryManager. */
  onLayerCreated: ((layer: AnyDocLayer) => void) | null = null;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  registerType<D, I = D>(def: DocumentTypeDefinition<D, I>): PlaceablesLayer<D, PlaceableObject<D>, I> {
    if (this.byType.has(def.type)) {
      throw new Error(`[canvas] document type "${def.type}" already registered`);
    }
    const layerId = def.layer.id ?? `${def.type}s`;
    const layer = new PlaceablesLayer<D, PlaceableObject<D>, I>({
      name: layerId,
      objectClass: def.placeable,
      canvas: this.canvas,
      documentType: def.events === false ? undefined : def.type,
      schema: def.schema,
    });

    if (def.events !== false) {
      const docSchema = def.schema ?? v.looseObject({ id: v.string() });
      this.canvas.bus.registerEvent(`${def.type}:create`, docSchema);
      this.canvas.bus.registerEvent(`${def.type}:update`, docSchema);
      this.canvas.bus.registerEvent(`${def.type}:delete`, DeleteEventSchema);
    }

    const entry: RegisteredType = { def: def as DocumentTypeDefinition<any, any>, layer: layer as AnyDocLayer };
    this.byType.set(def.type, entry);
    this.byLayerId.set(layerId, entry);

    this.canvas.stage.addChild(layer);
    this.canvas.layers.register(layerId, def.layer.label, layer, {
      order: def.layer.order,
      visible: def.layer.visible,
    });
    this.onLayerCreated?.(layer as AnyDocLayer);
    this.canvas.bus.emit('document:type', { type: def.type });
    return layer;
  }

  has(type: string): boolean {
    return this.byType.has(type);
  }

  definition(type: string): DocumentTypeDefinition<any, any> | undefined {
    return this.byType.get(type)?.def;
  }

  /** Campo de arte do tipo (metadado `imageField`), se o tipo é editável como imagem. */
  imageFieldOf(type: string): string | undefined {
    return this.byType.get(type)?.def.imageField;
  }

  /** Tipos de documento que declaram campo de arte (`imageField`). */
  typesWithImage(): string[] {
    return [...this.byType.values()].filter((e) => e.def.imageField !== undefined).map((e) => e.def.type);
  }

  layer(type: string): AnyDocLayer | undefined {
    return this.byType.get(type)?.layer;
  }

  layerById(layerId: string): AnyDocLayer | undefined {
    return this.byLayerId.get(layerId)?.layer;
  }

  types(): string[] {
    return [...this.byType.keys()];
  }

  /** Todas as layers de documentos, do fundo ao topo (pela ordem do LayerManager). */
  layers(): AnyDocLayer[] {
    const orderOf = (layer: AnyDocLayer): number => this.canvas.layers.orderOf(layer);
    return [...this.byType.values()].map((e) => e.layer).sort((a, b) => orderOf(a) - orderOf(b));
  }

  /** Layers para picking/hit-test, do topo ao fundo. */
  layersTopDown(): AnyDocLayer[] {
    return this.layers().reverse();
  }

  create<D, I = D>(type: string, data: I & { id?: string }): Promise<PlaceableObject<D>> {
    const layer = this.byType.get(type)?.layer;
    if (!layer) throw new Error(`[canvas] unknown document type "${type}"`);
    return layer.create(data) as Promise<PlaceableObject<D>>;
  }

  update<D>(type: string, id: string, changes: Partial<D>, options?: { before?: Partial<D> }): PlaceableObject<D> | undefined {
    return this.byType.get(type)?.layer.update(id, changes, options) as PlaceableObject<D> | undefined;
  }

  delete(type: string, id: string): boolean {
    return this.byType.get(type)?.layer.delete(id) ?? false;
  }

  get(type: string, id: string): PlaceableObject<any> | undefined {
    return this.byType.get(type)?.layer.get(id);
  }

  /** Busca um documento pelo id em qualquer tipo registrado. */
  findAny(id: string): PlaceableObject<any> | undefined {
    for (const entry of this.byType.values()) {
      const obj = entry.layer.get(id);
      if (obj) return obj;
    }
    return undefined;
  }

  /**
   * Instancia os documentos da cena para todos os tipos registrados.
   * Fontes (por tipo): `scene.documents[type]` ou a chave legada `sceneKey`.
   */
  async createFromScene(scene: Record<string, unknown>): Promise<void> {
    const documents = (scene.documents ?? {}) as Record<string, unknown[]>;
    for (const [type, entry] of this.byType) {
      const legacyKey = entry.def.sceneKey;
      const items = documents[type] ?? (legacyKey ? (scene[legacyKey] as unknown[] | undefined) : undefined) ?? [];
      for (const item of items) await entry.layer.create(item);
    }
  }

  async tearDownAll(): Promise<void> {
    await Promise.all([...this.byType.values()].map((entry) => entry.layer.tearDown()));
  }
}
