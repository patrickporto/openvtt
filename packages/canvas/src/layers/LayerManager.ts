import type { Canvas } from '../canvas';
import type { CanvasLayer } from './CanvasLayer';

export interface CanvasLayerState {
  id: string;
  label: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
}

interface Entry extends CanvasLayerState {
  layer: CanvasLayer;
}

export type LayerMoveDirection = 'up' | 'down' | 'top' | 'bottom';

/**
 * Registro ordenado (fundo → topo) das camadas da cena. Controla visibilidade,
 * opacidade, trava (bloqueia interação/picking) e reordenação via zIndex.
 * Extensível: camadas customizadas podem ser registradas com `register`.
 * Mudanças emitem `layers:change` no bus com a lista serializada.
 */
export class LayerManager {
  private readonly canvas: Canvas;
  private readonly entries: Entry[] = [];
  private readonly byId = new Map<string, Entry>();
  private readonly byLayer = new Map<CanvasLayer, Entry>();

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  register(
    id: string,
    label: string,
    layer: CanvasLayer,
    options?: Partial<Pick<CanvasLayerState, 'visible' | 'opacity' | 'locked'>>,
  ): void {
    if (this.byId.has(id)) return;
    const entry: Entry = {
      id,
      label,
      layer,
      visible: options?.visible ?? true,
      opacity: options?.opacity ?? 1,
      locked: options?.locked ?? false,
    };
    this.entries.push(entry);
    this.byId.set(id, entry);
    this.byLayer.set(layer, entry);
    this.apply();
    this.emit();
  }

  /** Lista do fundo (índice 0) ao topo. */
  list(): CanvasLayerState[] {
    return this.entries.map(({ id, label, visible, opacity, locked }) => ({ id, label, visible, opacity, locked }));
  }

  get(id: string): CanvasLayerState | undefined {
    const entry = this.byId.get(id);
    if (!entry) return undefined;
    return { id: entry.id, label: entry.label, visible: entry.visible, opacity: entry.opacity, locked: entry.locked };
  }

  setVisible(id: string, visible: boolean): void {
    const entry = this.byId.get(id);
    if (!entry || entry.visible === visible) return;
    entry.visible = visible;
    entry.layer.visible = visible;
    this.emit();
  }

  setOpacity(id: string, opacity: number): void {
    const entry = this.byId.get(id);
    if (!entry) return;
    entry.opacity = Math.min(1, Math.max(0, opacity));
    entry.layer.alpha = entry.opacity;
    this.emit();
  }

  setLocked(id: string, locked: boolean): void {
    const entry = this.byId.get(id);
    if (!entry || entry.locked === locked) return;
    entry.locked = locked;
    this.emit();
  }

  move(id: string, direction: LayerMoveDirection): void {
    const index = this.entries.findIndex((e) => e.id === id);
    if (index < 0) return;
    const [entry] = this.entries.splice(index, 1);
    let target = index;
    if (direction === 'up') target = Math.min(this.entries.length, index + 1);
    else if (direction === 'down') target = Math.max(0, index - 1);
    else if (direction === 'top') target = this.entries.length;
    else target = 0;
    this.entries.splice(target, 0, entry);
    this.apply();
    this.emit();
  }

  /** Camadas não registradas são consideradas interativas (padrão seguro). */
  isInteractive(layer: CanvasLayer): boolean {
    const entry = this.byLayer.get(layer);
    return entry ? entry.visible && !entry.locked : true;
  }

  private apply(): void {
    this.entries.forEach((entry, index) => {
      entry.layer.zIndex = index * 10;
    });
  }

  private emit(): void {
    this.canvas.bus.emit('layers:change', { layers: this.list() });
  }
}
