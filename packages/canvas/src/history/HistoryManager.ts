import type { Canvas } from '../canvas';
import type { LayerMutation, PlaceablesLayer } from '../layers/PlaceablesLayer';
import type { PlaceableObject } from '../placeables/PlaceableObject';

type AnyLayer = PlaceablesLayer<any, PlaceableObject<any>, any>;
type Mutation = LayerMutation<any>;

interface Entry {
  layer: AnyLayer;
  mutation: Mutation;
}

/** Uma unidade de histórico: uma mutação ou um lote (ex.: drag multi-objeto). */
type Unit = Entry | Entry[];

const MAX_HISTORY = 200;

/**
 * Histórico comando-based de undo/redo. As layers reportam mutações via
 * `onMutate`; o manager grava entradas e as reverte/reaplica chamando os
 * métodos públicos da layer (create/update/delete), sem regravar durante o replay.
 */
export class HistoryManager {
  private readonly canvas: Canvas;
  private undoStack: Unit[] = [];
  private redoStack: Unit[] = [];
  private batch: Entry[] | null = null;
  private batchDepth = 0;
  private replaying = false;
  private applying: Promise<void> = Promise.resolve();

  constructor(canvas: Canvas) {
    this.canvas = canvas;
    for (const layer of this.canvas.documents.layers()) this.attach(layer);
    this.canvas.documents.onLayerCreated = (layer) => this.attach(layer);
  }

  private attach(layer: AnyLayer): void {
    layer.onMutate = (mutation) => this.onLayerMutation(layer, mutation);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private onLayerMutation(layer: AnyLayer, mutation: Mutation): void {
    if (this.replaying) return;
    const entry: Entry = { layer, mutation };
    if (this.batch) {
      this.batch.push(entry);
    } else {
      this.pushUndo(entry);
    }
  }

  private pushUndo(unit: Unit): void {
    this.undoStack.push(unit);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.emitChange();
  }

  /** Agrupa mutações subsequentes numa única unidade de undo. Suporta aninhamento. */
  beginBatch(): void {
    this.batchDepth += 1;
    if (!this.batch) this.batch = [];
  }

  endBatch(): void {
    if (this.batchDepth > 0) this.batchDepth -= 1;
    if (this.batchDepth > 0) return;
    const batch = this.batch;
    this.batch = null;
    if (batch && batch.length > 0) {
      this.pushUndo(batch);
    }
  }

  undo(): Promise<void> {
    this.applying = this.applying.catch(() => {}).then(() => this.applyUndo());
    return this.applying;
  }

  redo(): Promise<void> {
    this.applying = this.applying.catch(() => {}).then(() => this.applyRedo());
    return this.applying;
  }

  private async applyUndo(): Promise<void> {
    const unit = this.undoStack.pop();
    if (!unit) return;
    this.replaying = true;
    try {
      const entries = Array.isArray(unit) ? unit : [unit];
      for (let i = entries.length - 1; i >= 0; i--) await this.revert(entries[i]);
    } finally {
      this.replaying = false;
    }
    this.redoStack.push(unit);
    this.afterApply();
  }

  private async applyRedo(): Promise<void> {
    const unit = this.redoStack.pop();
    if (!unit) return;
    this.replaying = true;
    try {
      const entries = Array.isArray(unit) ? unit : [unit];
      for (const entry of entries) await this.reapply(entry);
    } finally {
      this.replaying = false;
    }
    this.undoStack.push(unit);
    this.afterApply();
  }

  private async revert(entry: Entry): Promise<void> {
    const { layer, mutation } = entry;
    if (mutation.kind === 'create') {
      this.canvas.selection.delete(mutation.document.id);
      layer.delete(mutation.document.id);
    } else if (mutation.kind === 'delete') {
      await layer.create(mutation.document);
    } else {
      layer.update(mutation.id, mutation.before);
    }
  }

  private async reapply(entry: Entry): Promise<void> {
    const { layer, mutation } = entry;
    if (mutation.kind === 'create') {
      await layer.create(mutation.document);
    } else if (mutation.kind === 'delete') {
      this.canvas.selection.delete(mutation.document.id);
      layer.delete(mutation.document.id);
    } else {
      layer.update(mutation.id, mutation.after);
    }
  }

  private afterApply(): void {
    this.canvas.refreshSelection();
    this.emitChange();
  }

  private emitChange(): void {
    this.canvas.bus.emit('history:change', { canUndo: this.canUndo, canRedo: this.canRedo });
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.batch = null;
    this.batchDepth = 0;
    this.emitChange();
  }
}
