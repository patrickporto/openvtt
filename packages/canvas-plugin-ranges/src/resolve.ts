import { toHex } from '@openvtt/canvas';
import type { RangePreset, RangeRingSpec, RangeTheme } from './schemas';

export interface ResolvedRing {
  cells: number;
  label: string;
  color: number;
  emphasis: boolean;
}

export function ringDistance(ring: RangeRingSpec): number {
  return typeof ring === 'number' ? ring : ring.distance;
}

export function trimNumber(value: number): string {
  const rounded = Math.abs(value % 1) < 0.05 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}`;
}

export function formatDistance(preset: RangePreset, cells: number): string {
  return `${trimNumber(cells * preset.unit.perCell)}${preset.unit.suffix}`;
}

export function ringCells(preset: RangePreset, ring: RangeRingSpec): number {
  return ringDistance(ring) / preset.unit.perCell;
}

export function resolveRings(preset: RangePreset, theme: RangeTheme): ResolvedRing[] {
  const unique = new Map<string, ResolvedRing>();
  preset.rings.forEach((ring, index) => {
    const distance = ringDistance(ring);
    const spec = typeof ring === 'number' ? undefined : ring;
    const cells = distance / preset.unit.perCell;
    const key = cells.toFixed(2);
    if (unique.has(key)) return;
    unique.set(key, {
      cells,
      label: spec?.label ?? `${trimNumber(distance)}${preset.unit.suffix}`,
      color: toHex(spec?.color ?? theme.colors[index % theme.colors.length]),
      emphasis: spec?.emphasis ?? false,
    });
  });
  return [...unique.values()].sort((a, b) => a.cells - b.cells);
}

export function containingRing(rings: readonly ResolvedRing[], cells: number): ResolvedRing | undefined {
  return rings.find((ring) => ring.cells + 1e-6 >= cells);
}
