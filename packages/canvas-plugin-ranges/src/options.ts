import type { RangeShape } from './schemas';

export interface RangeToolOptions {
  preset: string;
  theme: string;
  shape: RangeShape;
  labels: boolean;
  maxRanges: number;
  follow: boolean;
  clearOnSwitch: boolean;
  fillAlpha: number;
}

export const RANGE_TOOL_DEFAULTS: RangeToolOptions = {
  preset: 'dnd5e',
  theme: 'spectrum',
  shape: 'circle',
  labels: true,
  maxRanges: 1,
  follow: false,
  clearOnSwitch: true,
  fillAlpha: 0.09,
};
