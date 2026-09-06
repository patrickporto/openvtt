import { Container, Graphics, Text } from 'pixi.js';
import type { PlaceableObject } from '@openvtt/canvas';
import { colorToNumber } from './color';
import type { ResolvedTracker, TrackerUiState } from './resolve';
import type { TrackerInset, TrackerSide } from './schemas';

interface TokenLike {
  readonly id: string;
  readonly rotation: number;
  readonly bounds: { x: number; y: number; width: number; height: number };
}

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly thickness: number;
  readonly horizontal: boolean;
}

const TRACK_COLOR = 0x10100e;
const LABEL_FAMILY = 'system-ui, sans-serif';
const MARGIN = 2;
const GAP = 2;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Overlay de trackers de um token: barras e chips redesenhados a partir dos
 * trackers resolvidos. Anexada como filha do placeable — a rotação do token
 * é cancelada para manter os trackers retos.
 */
export class TokenTrackersView extends Container {
  private readonly gfx = new Graphics();
  private readonly labels: Text[] = [];
  private token: TokenLike | null = null;

  constructor() {
    super();
    this.label = 'trackers';
    this.eventMode = 'none';
    this.addChild(this.gfx);
  }

  redraw(token: TokenLike, resolved: readonly ResolvedTracker[]): void {
    this.token = token;
    this.gfx.clear();
    const visible = resolved.filter((entry) => entry.visible);
    const stacks = new Map<string, number>();
    let labelIndex = 0;

    const width = token.bounds.width;
    const height = token.bounds.height;
    const barThickness = clampNumber(Math.round(Math.min(width, height) * 0.09), 4, 10);
    const chipHeight = clampNumber(Math.round(Math.min(width, height) * 0.2), 11, 16);

    for (const entry of visible) {
      if (entry.tracker.kind === 'counter' && entry.label.length === 0) continue;
      const key = `${entry.tracker.side}:${entry.tracker.inset}`;
      const thickness = entry.tracker.kind === 'bar' ? barThickness : chipHeight;
      const offset = stacks.get(key) ?? 0;
      stacks.set(key, offset + thickness + GAP);
      const slot = this.slotFor(entry.tracker.side, entry.tracker.inset, offset, {
        width,
        height,
        thickness,
      });
      if (entry.tracker.kind === 'bar') {
        this.drawBar(slot, entry);
        if (entry.label.length > 0) {
          const text = this.labelAt(labelIndex++);
          this.drawBarLabel(text, slot, entry);
        }
      } else {
        const chip = this.chipRect(slot, entry.label, chipHeight);
        this.drawChip(chip, entry);
        const text = this.labelAt(labelIndex++);
        this.drawChipLabel(text, chip, entry);
      }
    }
    for (let i = labelIndex; i < this.labels.length; i++) this.labels[i].visible = false;
    this.rotation = -token.rotation;
  }

  private slotFor(
    side: TrackerSide,
    inset: TrackerInset,
    offset: number,
    size: { width: number; height: number; thickness: number },
  ): Slot {
    const { width, height, thickness } = size;
    const half = { w: width / 2, h: height / 2 };
    const stack = MARGIN + offset;

    if (side === 'top' || side === 'bottom') {
      const length = width - MARGIN * 2;
      const x = -half.w + MARGIN;
      const y =
        side === 'top'
          ? inset === 'inner'
            ? -half.h + stack
            : -half.h - stack - thickness
          : inset === 'inner'
            ? half.h - stack - thickness
            : half.h + stack;
      return { x, y, length, thickness, horizontal: true };
    }

    const length = height - MARGIN * 2;
    const y = -half.h + MARGIN;
    const x =
      side === 'left'
        ? inset === 'inner'
          ? -half.w + stack
          : -half.w - stack - thickness
        : inset === 'inner'
          ? half.w - stack - thickness
          : half.w + stack;
    return { x, y, length, thickness, horizontal: false };
  }

  private drawBar(slot: Slot, entry: ResolvedTracker): void {
    const radius = Math.min(3, slot.thickness / 2);
    const boxWidth = slot.horizontal ? slot.length : slot.thickness;
    const boxHeight = slot.horizontal ? slot.thickness : slot.length;
    this.gfx.roundRect(slot.x, slot.y, boxWidth, boxHeight, radius).fill({ color: TRACK_COLOR, alpha: 0.6 });

    const fillLength = slot.length * (entry.ratio ?? 0);
    const fill = colorToNumber(entry.fillColor);
    if (fillLength > 0) {
      if (slot.horizontal) {
        this.gfx
          .roundRect(slot.x, slot.y, fillLength, slot.thickness, radius)
          .fill({ color: fill, alpha: entry.tracker.opacity });
      } else {
        this.gfx
          .roundRect(slot.x, slot.y + slot.length - fillLength, slot.thickness, fillLength, radius)
          .fill({ color: fill, alpha: entry.tracker.opacity });
      }
    }

    if (entry.tracker.segments > 1) {
      const step = slot.length / entry.tracker.segments;
      for (let i = 1; i < entry.tracker.segments; i++) {
        if (slot.horizontal) {
          this.gfx.rect(slot.x + i * step - 0.5, slot.y, 1, slot.thickness).fill({ color: TRACK_COLOR, alpha: 0.9 });
        } else {
          this.gfx.rect(slot.x, slot.y + i * step - 0.5, slot.thickness, 1).fill({ color: TRACK_COLOR, alpha: 0.9 });
        }
      }
    }
  }

  private chipRect(slot: Slot, labelText: string, chipHeight: number): { x: number; y: number; width: number; height: number; horizontal: boolean } {
    const fontSize = clampNumber(Math.round(chipHeight * 0.68), 7, 11);
    const textSpan = Math.max(labelText.length * fontSize * 0.62 + 6, chipHeight * 0.9);
    if (slot.horizontal) {
      const centerX = slot.x + slot.length / 2;
      return { x: centerX - textSpan / 2, y: slot.y, width: textSpan, height: slot.thickness, horizontal: true };
    }
    const centerY = slot.y + slot.length / 2;
    return { x: slot.x, y: centerY - textSpan / 2, width: slot.thickness, height: textSpan, horizontal: false };
  }

  private drawChip(
    chip: { x: number; y: number; width: number; height: number },
    entry: ResolvedTracker,
  ): void {
    const color = colorToNumber(entry.fillColor);
    this.gfx
      .roundRect(chip.x, chip.y, chip.width, chip.height, Math.min(4, chip.height / 2))
      .fill({ color: TRACK_COLOR, alpha: 0.65 })
      .stroke({ color, width: 1.25, alpha: 0.85 });
  }

  private labelAt(index: number): Text {
    if (index < this.labels.length) {
      const existing = this.labels[index];
      existing.visible = true;
      existing.rotation = 0;
      return existing;
    }
    const text = new Text({ text: '', style: { fontFamily: LABEL_FAMILY } });
    text.eventMode = 'none';
    text.anchor.set(0.5);
    this.labels.push(text);
    this.addChild(text);
    return text;
  }

  private applyLabelStyle(text: Text, fontSize: number): void {
    text.style.fontSize = fontSize;
    text.style.fill = 0xffffff;
    text.style.fontWeight = '600';
    text.style.stroke = { color: 0x000000, width: Math.max(1.5, fontSize * 0.22) };
    text.resolution = 2;
  }

  private drawBarLabel(text: Text, slot: Slot, entry: ResolvedTracker): void {
    const fontSize = clampNumber(Math.round(slot.thickness * 1.05), 7, 12);
    text.text = entry.label;
    this.applyLabelStyle(text, fontSize);
    if (slot.horizontal) {
      text.position.set(slot.x + slot.length / 2, slot.y + slot.thickness / 2);
    } else {
      text.rotation = -Math.PI / 2;
      text.position.set(slot.x + slot.thickness / 2, slot.y + slot.length / 2);
    }
  }

  private drawChipLabel(
    text: Text,
    chip: { x: number; y: number; width: number; height: number; horizontal: boolean },
    entry: ResolvedTracker,
  ): void {
    const fontSize = clampNumber(Math.round(chip.height * 0.68), 7, 11);
    text.text = entry.label;
    this.applyLabelStyle(text, fontSize);
    if (chip.horizontal) {
      text.position.set(chip.x + chip.width / 2, chip.y + chip.height / 2);
    } else {
      text.rotation = -Math.PI / 2;
      text.position.set(chip.x + chip.width / 2, chip.y + chip.height / 2);
    }
  }

  refreshRotation(): void {
    if (this.token) this.rotation = -this.token.rotation;
  }
}

export interface TrackerOverlayDeps {
  readonly resolve: (tokenId: string, ui: TrackerUiState) => readonly ResolvedTracker[];
  readonly uiStateOf: (tokenId: string) => TrackerUiState;
}

/** Gerencia as views por token e orquestra redraws. */
export class TrackerOverlay {
  private readonly views = new Map<string, TokenTrackersView>();
  private readonly tokens = new Map<string, PlaceableObject<any>>();
  private readonly deps: TrackerOverlayDeps;

  constructor(deps: TrackerOverlayDeps) {
    this.deps = deps;
  }

  attach(token: PlaceableObject<any>): TokenTrackersView {
    this.detach(token.id);
    const view = new TokenTrackersView();
    this.tokens.set(token.id, token);
    token.addChild(view);
    this.views.set(token.id, view);
    this.refresh(token.id);
    return view;
  }

  detach(tokenId: string): void {
    const view = this.views.get(tokenId);
    if (!view) return;
    this.views.delete(tokenId);
    this.tokens.delete(tokenId);
    view.destroy({ children: true });
  }

  has(tokenId: string): boolean {
    return this.views.has(tokenId);
  }

  refresh(tokenId: string): void {
    const view = this.views.get(tokenId);
    const token = this.tokens.get(tokenId);
    if (!view || !token) return;
    const resolved = this.deps.resolve(tokenId, this.deps.uiStateOf(tokenId));
    view.redraw(token, resolved);
  }

  refreshAll(): void {
    for (const tokenId of this.views.keys()) this.refresh(tokenId);
  }

  refreshRotations(): void {
    for (const view of this.views.values()) view.refreshRotation();
  }

  destroyAll(): void {
    for (const tokenId of [...this.views.keys()]) this.detach(tokenId);
  }
}
