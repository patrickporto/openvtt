import RBush from 'rbush';
import type { Constructor } from '../types';
import { InteractionLayer, type InteractionLayerOptions } from './InteractionLayer';
import { PlaceableObject } from '../placeables/PlaceableObject';
import type { CanvasLike, PlaceableObjectOptions } from '../placeables/PlaceableObject';
import { newId, rectanglesIntersect } from '../utils';

interface IndexEntry {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type PlaceableDocument<D> = D & { id?: string; x?: number; y?: number; rotation?: number };

/** Mutação gravável no histórico (antes/depois). */
export type LayerMutation<D> =
  | { kind: 'create'; document: D & { id: string } }
  | { kind: 'delete'; document: D & { id: string } }
  | { kind: 'update'; id: string; before: Partial<D>; after: Partial<D> };

function pickKeys<D>(doc: D, keys: string[]): Partial<D> {
  const out: Record<string, unknown> = {};
  const src = doc as Record<string, unknown>;
  for (const k of keys) out[k] = src[k];
  return out as Partial<D>;
}

export interface PlaceablesLayerOptions<D, O extends PlaceableObject<D>> extends InteractionLayerOptions {
  objectClass: Constructor<O, [PlaceableDocument<D>, CanvasLike, (PlaceableObjectOptions | undefined)?]>;
  canvas: CanvasLike;
}

export class PlaceablesLayer<D = Record<string, unknown>, O extends PlaceableObject<D> = PlaceableObject<D>, I = D> extends InteractionLayer {
  readonly objects = new Map<string, O>();
  readonly objectClass: Constructor<O, [PlaceableDocument<D>, CanvasLike, (PlaceableObjectOptions | undefined)?]>;
  protected readonly canvas: CanvasLike;
  protected _controlled: O | null = null;
  protected readonly index = new RBush<IndexEntry>();
  private readonly entryById = new Map<string, IndexEntry>();
  /** Callback de histórico (ligada pelo Canvas/HistoryManager). */
  onMutate: ((mutation: LayerMutation<D>) => void) | null = null;

  constructor(options: PlaceablesLayerOptions<D, O>) {
    super(options);
    this.objectClass = options.objectClass;
    this.canvas = options.canvas;
  }

  get placeables(): O[] {
    return [...this.objects.values()];
  }

  get controlled(): O | null {
    return this._controlled;
  }

  get(id: string): O | undefined {
    return this.objects.get(id);
  }

  async create(data: I & { id?: string }, options?: { interactive?: boolean }): Promise<O> {
    const id = data.id ?? this.generateId();
    const document = { ...data, id } as unknown as D & { id: string };
    const object = new this.objectClass(document, this.canvas, options);
    this.objects.set(id, object);
    this.addChild(object);
    await object.draw();
    this.indexObject(object);
    this.emitCreate(document);
    this.onMutate?.({ kind: 'create', document: { ...document } });
    return object;
  }

  update(id: string, changes: Partial<D>, options?: { before?: Partial<D> }): O | undefined {
    const object = this.objects.get(id);
    if (!object) return undefined;
    const before = options?.before ?? pickKeys(object.document, Object.keys(changes));
    object.update(changes);
    this.indexObject(object);
    this.emitUpdate(object.document);
    this.onMutate?.({ kind: 'update', id, before, after: { ...changes } });
    return object;
  }

  /** Reindexa o objeto no spatial index (usado durante arraste pelas tools). */
  reindex(object: O): void {
    this.indexObject(object);
  }

  delete(id: string): boolean {
    const object = this.objects.get(id);
    if (!object) return false;
    const snapshot = { ...object.document } as D & { id: string };
    this.objects.delete(id);
    this.removeIndex(id);
    object.destroy({ children: true });
    this.emitDelete(id);
    this.onMutate?.({ kind: 'delete', document: snapshot });
    return true;
  }

  clear(): void {
    for (const object of this.objects.values()) object.destroy({ children: true });
    this.objects.clear();
    this.index.clear();
    this.entryById.clear();
    this._controlled = null;
  }

  override async tearDown(): Promise<void> {
    this.clear();
    await super.tearDown();
  }

  pick(point: { x: number; y: number }): O | undefined {
    const hits = this.index.search({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y });
    for (const entry of hits) {
      const object = this.objects.get(entry.id);
      if (object && this.hitTest(object, point)) return object;
    }
    return undefined;
  }

  pickRect(rect: { x: number; y: number; width: number; height: number }): O[] {
    const hits = this.index.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    });
    const result: O[] = [];
    for (const entry of hits) {
      const object = this.objects.get(entry.id);
      if (!object) continue;
      const aabb = object.getAABB();
      if (rectanglesIntersect(
        { x: aabb.minX, y: aabb.minY, width: aabb.maxX - aabb.minX, height: aabb.maxY - aabb.minY },
        rect,
      )) {
        result.push(object);
      }
    }
    return result;
  }

  protected hitTest(object: O, point: { x: number; y: number }): boolean {
    const b = object.bounds;
    const local = { x: point.x - object.position.x - b.x, y: point.y - object.position.y - b.y };
    return local.x >= 0 && local.x <= b.width && local.y >= 0 && local.y <= b.height;
  }

  private indexObject(object: O): void {
    this.removeIndex(object.id);
    const aabb = object.getAABB();
    const entry: IndexEntry = { id: object.id, minX: aabb.minX, minY: aabb.minY, maxX: aabb.maxX, maxY: aabb.maxY };
    this.entryById.set(object.id, entry);
    this.index.insert(entry);
  }

  private removeIndex(id: string): void {
    const entry = this.entryById.get(id);
    if (!entry) return;
    this.index.remove(entry, (a, b) => a.id === b.id);
    this.entryById.delete(id);
  }

  protected generateId(): string {
    return newId();
  }

  protected emitCreate(_document: D & { id: string }): void {}
  protected emitUpdate(_document: D): void {}
  protected emitDelete(_id: string): void {}
}
