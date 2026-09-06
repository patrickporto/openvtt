import type { TrackerColor, TrackerKind } from './schemas';

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface HsvColor {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

export interface NormalizedColor {
  readonly min: string;
  readonly max: string;
}

const DEFAULT_BAR: NormalizedColor = { min: '#e5484d', max: '#30a46c' };
const DEFAULT_COUNTER: NormalizedColor = { min: '#f0c168', max: '#f0c168' };

const HEX_6 = /^#?([0-9a-f]{6})$/i;
const HEX_3 = /^#?([0-9a-f]{3})$/i;

export function isHexColor(input: string): boolean {
  return HEX_6.test(input.trim()) || HEX_3.test(input.trim());
}

export function parseHexColor(input: string): RgbColor | null {
  const text = input.trim();
  const six = HEX_6.exec(text);
  if (six) {
    const n = Number.parseInt(six[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const three = HEX_3.exec(text);
  if (three) {
    const digits = three[1];
    const r = Number.parseInt(digits[0] + digits[0], 16);
    const g = Number.parseInt(digits[1] + digits[1], 16);
    const b = Number.parseInt(digits[2] + digits[2], 16);
    return { r, g, b };
  }
  return null;
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const to = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 };
}

/**
 * Interpola duas cores hex no espaço HSV, percorrendo o menor arco de matiz
 * (verde → vermelho passa pelo amarelo, como no Bar Brawl). `t` é limitado
 * a [0, 1].
 */
export function interpolateColor(fromHex: string, toHex: string, t: number): string {
  const from = rgbToHsv(parseHexColor(fromHex) ?? { r: 0, g: 0, b: 0 });
  const to = rgbToHsv(parseHexColor(toHex) ?? { r: 0, g: 0, b: 0 });
  const clamped = Math.min(1, Math.max(0, t));
  const dh = (((to.h - from.h + 540) % 360) - 180) * clamped;
  const h = from.h + dh;
  const s = from.s + (to.s - from.s) * clamped;
  const v = from.v + (to.v - from.v) * clamped;
  return rgbToHex(hsvToRgb({ h, s, v }));
}

/** Cor como número 0xRRGGBB para renderers Pixi. */
export function colorToNumber(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 0xffffff;
  return (Math.round(rgb.r) << 16) | (Math.round(rgb.g) << 8) | Math.round(rgb.b);
}

/** Normaliza `color` do tracker em par min/max válido, com fallback por kind. */
export function normalizeTrackerColor(color: TrackerColor | undefined, kind: TrackerKind): NormalizedColor {
  if (typeof color === 'string') {
    if (!isHexColor(color)) return kind === 'bar' ? DEFAULT_BAR : DEFAULT_COUNTER;
    return { min: color, max: color };
  }
  if (color && typeof color === 'object') {
    const min = isHexColor(color.min) ? color.min.trim() : DEFAULT_BAR.min;
    const max = isHexColor(color.max) ? color.max.trim() : DEFAULT_BAR.max;
    return { min, max };
  }
  return kind === 'bar' ? DEFAULT_BAR : DEFAULT_COUNTER;
}
