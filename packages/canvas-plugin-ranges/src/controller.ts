import { dynamicBus, newId, type Canvas, type Point } from '@openvtt/canvas';
import { RangeOverlayLayer, type DrawnRange, type RangeGuide } from './layer/RangeOverlayLayer';
import { containingRing, formatDistance, resolveRings } from './resolve';
import { RANGE_TOOL_DEFAULTS, type RangeToolOptions } from './options';
import type { RangePreset, RangeTheme } from './schemas';

export interface ActiveRange {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly presetId: string;
  readonly tokenId?: string;
}

export interface PlaceRangeInput {
  x: number;
  y: number;
  preset?: string;
  tokenId?: string;
}

interface DragPreview {
  x: number;
  y: number;
  cursor: { x: number; y: number };
  tokenId?: string;
}

const controllers = new WeakMap<Canvas, RangesController>();

export function bindController(canvas: Canvas, controller: RangesController): void {
  controllers.set(canvas, controller);
}

export function unbindController(canvas: Canvas): void {
  controllers.delete(canvas);
}

export function rangesControllerFor(canvas: Canvas): RangesController | undefined {
  return controllers.get(canvas);
}

export class RangesController {
  private readonly off: Array<() => void> = [];
  private readonly ranges: ActiveRange[] = [];
  private preview: DragPreview | null = null;
  private disposed = false;

  constructor(
    private readonly canvas: Canvas,
    private readonly layer: RangeOverlayLayer,
    readonly presets: ReadonlyMap<string, RangePreset>,
    readonly themes: ReadonlyMap<string, RangeTheme>,
  ) {}

  attach(): void {
    this.off.push(
      this.canvas.bus.on('document:moved', ({ type, id, x, y }) => this.onDocumentMoved(type, id, x, y)),
      this.canvas.bus.on('document:delete', ({ type, id }) => this.onDocumentDelete(type, id)),
    );
    this.canvas.bus.tap('scene:setup', 'ranges', () => this.wipe());
    this.canvas.bus.tap('scene:teardown', 'ranges', () => this.wipe());
  }

  dispose(): void {
    this.disposed = true;
    this.off.splice(0).forEach((unsub) => unsub());
    this.ranges.length = 0;
    this.preview = null;
  }

  options(): RangeToolOptions {
    if (!this.canvas.tools) return { ...RANGE_TOOL_DEFAULTS };
    const raw = (this.canvas.tools.options['ranges'] ?? {}) as Partial<RangeToolOptions>;
    return { ...RANGE_TOOL_DEFAULTS, ...raw };
  }

  setOptions(partial: Partial<RangeToolOptions>): void {
    if (!this.canvas.tools) return;
    this.canvas.tools.options['ranges'] = { ...this.options(), ...partial };
    this.compose();
  }

  active(): readonly ActiveRange[] {
    return this.ranges.map((range) => range);
  }

  place(input: PlaceRangeInput): ActiveRange | null {
    if (this.disposed) return null;
    const options = this.options();
    const presetId = input.preset ?? options.preset;
    const preset = this.presets.get(presetId) ?? firstOf(this.presets);
    if (!preset) return null;
    const range: ActiveRange = Object.freeze({
      id: newId(),
      x: input.x,
      y: input.y,
      presetId: preset.id,
      ...(input.tokenId ? { tokenId: input.tokenId } : {}),
    });
    this.ranges.push(range);
    const max = Math.max(1, Math.floor(options.maxRanges || 1));
    while (this.ranges.length > max) this.ranges.shift();
    this.compose();
    this.emitPlaced(range, options);
    return range;
  }

  clear(): void {
    if (this.ranges.length === 0) return;
    const count = this.ranges.length;
    this.wipe();
    dynamicBus(this.canvas.bus).emit('ranges:cleared', { count });
  }

  beginDrag(origin: Point, tokenId?: string): void {
    this.preview = {
      x: origin.x,
      y: origin.y,
      cursor: { x: origin.x, y: origin.y },
      ...(tokenId ? { tokenId } : {}),
    };
    this.compose();
  }

  updateDrag(cursor: Point): void {
    if (!this.preview) return;
    this.preview.cursor = { x: cursor.x, y: cursor.y };
    this.compose();
  }

  endDrag(): ActiveRange | null {
    const preview = this.preview;
    this.preview = null;
    if (!preview) return null;
    const placed = this.place({
      x: preview.x,
      y: preview.y,
      ...(preview.tokenId ? { tokenId: preview.tokenId } : {}),
    });
    if (!placed) this.compose();
    return placed;
  }

  cancelDrag(): void {
    if (!this.preview) return;
    this.preview = null;
    this.compose();
  }

  compose(): void {
    if (this.disposed) return;
    const options = this.options();
    const theme = this.themes.get(options.theme) ?? firstOf(this.themes);
    const fallbackPreset = this.presets.get(options.preset) ?? firstOf(this.presets);
    if (!theme || !fallbackPreset) {
      this.layer.render({ shape: options.shape, labels: options.labels, fillAlpha: options.fillAlpha, ranges: [], guide: null });
      return;
    }
    const cell = Math.max(1, this.canvas.grid.size);
    const ranges: DrawnRange[] = this.ranges.map((range) => ({
      x: range.x,
      y: range.y,
      rings: resolveRings(this.presets.get(range.presetId) ?? fallbackPreset, theme),
      emphasized: null,
      crosshair: true,
    }));
    let guide: RangeGuide | null = null;
    if (this.preview) {
      const preset = this.presets.get(options.preset) ?? fallbackPreset;
      const rings = resolveRings(preset, theme);
      const cells = Math.hypot(this.preview.cursor.x - this.preview.x, this.preview.cursor.y - this.preview.y) / cell;
      const containing = containingRing(rings, cells);
      ranges.push({
        x: this.preview.x,
        y: this.preview.y,
        rings,
        emphasized: containing ? containing.cells : null,
        crosshair: true,
      });
      const exact = formatDistance(preset, cells);
      guide = {
        from: { x: this.preview.x, y: this.preview.y },
        to: { x: this.preview.cursor.x, y: this.preview.cursor.y },
        label: containing ? `${exact} · ${containing.label}` : exact,
      };
    }
    this.layer.render({ shape: options.shape, labels: options.labels, fillAlpha: options.fillAlpha, ranges, guide });
  }

  private wipe(): void {
    if (this.disposed) return;
    this.ranges.length = 0;
    this.preview = null;
    this.compose();
  }

  private onDocumentMoved(type: string, id: string, x: number, y: number): void {
    if (type !== 'token' || !this.options().follow) return;
    let changed = false;
    for (let i = 0; i < this.ranges.length; i++) {
      if (this.ranges[i].tokenId === id) {
        this.ranges[i] = { ...this.ranges[i], x, y };
        changed = true;
      }
    }
    if (changed) this.compose();
  }

  private onDocumentDelete(type: string, id: string): void {
    if (type !== 'token') return;
    const before = this.ranges.length;
    for (let i = this.ranges.length - 1; i >= 0; i--) {
      if (this.ranges[i].tokenId === id) this.ranges.splice(i, 1);
    }
    if (this.ranges.length !== before) this.compose();
  }

  private emitPlaced(range: ActiveRange, options: RangeToolOptions): void {
    const preset = this.presets.get(range.presetId);
    const theme = this.themes.get(options.theme) ?? firstOf(this.themes);
    dynamicBus(this.canvas.bus).emit('ranges:placed', {
      id: range.id,
      x: range.x,
      y: range.y,
      preset: range.presetId,
      shape: options.shape,
      rings: preset && theme ? resolveRings(preset, theme).length : 0,
      ...(range.tokenId ? { tokenId: range.tokenId } : {}),
    });
  }
}

function firstOf<T>(map: ReadonlyMap<string, T>): T | undefined {
  for (const value of map.values()) return value;
  return undefined;
}
