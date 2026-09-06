export interface RingLayoutOptions {
  readonly spread: 'outward' | 'inward';
  readonly gap: number;
  readonly startInset: number;
}

export const DEFAULT_RING_LAYOUT: RingLayoutOptions = { spread: 'outward', gap: 6, startInset: 2 };

export interface RingSlot {
  readonly index: number;
  readonly inset: number;
}

export function ringSlots(count: number, options: RingLayoutOptions = DEFAULT_RING_LAYOUT): RingSlot[] {
  const slots: RingSlot[] = [];
  for (let i = 0; i < count; i++) {
    const offset = options.startInset + i * options.gap;
    slots.push({ index: i, inset: options.spread === 'inward' ? -offset : offset });
  }
  return slots;
}

export interface RingOrderLike {
  order?: number;
  id?: string;
}

export function sortRingsForLayout<T extends RingOrderLike>(rings: readonly T[]): T[] {
  return [...rings].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    const aid = a.id ?? '';
    const bid = b.id ?? '';
    if (aid < bid) return -1;
    if (aid > bid) return 1;
    return 0;
  });
}

export function ringRadius(tokenRadius: number, inset: number): number {
  return Math.max(1, tokenRadius + inset);
}

export interface Arc {
  readonly start: number;
  readonly end: number;
}

export function dashedArcs(radius: number, dash: readonly number[], twoPi = Math.PI * 2): Arc[] {
  const solid: Arc = { start: 0, end: twoPi };
  if (!Number.isFinite(radius)) return [solid];
  const pattern = dash.filter((segment) => segment > 0);
  if (pattern.length === 0) return [solid];
  const circumference = radius * twoPi;
  if (!(circumference > 0)) return [solid];
  const patternSum = pattern.reduce((total, segment) => total + segment, 0);
  if (patternSum <= 0) return [solid];
  const scale = patternSum > circumference ? circumference / patternSum : 1;
  const segments = pattern.map((segment) => segment * scale);
  const arcs: Arc[] = [];
  let position = 0;
  let index = 0;
  while (position < circumference - 1e-9) {
    const length = Math.min(segments[index % segments.length], circumference - position);
    if (length <= 0) break;
    if (index % 2 === 0) {
      arcs.push({
        start: (position / circumference) * twoPi,
        end: ((position + length) / circumference) * twoPi,
      });
    }
    position += length;
    index++;
  }
  if (arcs.length > 0 && twoPi - arcs[arcs.length - 1].end < 1e-9) {
    const last = arcs[arcs.length - 1];
    arcs[arcs.length - 1] = { start: last.start, end: twoPi };
  }
  return arcs;
}
