import type { ModifierOp } from '@openvtt/dice-core';
import { buildModifierPatterns, type ModPattern } from '@openvtt/dice-notation-core';

export type { ModPattern };
export { FUNCTIONS } from '@openvtt/dice-notation-core';

const FOUNDRY_SIGILS: Readonly<Record<string, ModifierOp>> = {
  rr: 'reroll-recursive',
  r: 'reroll-once',
  xo: 'explode-once',
  x: 'explode',
  kh: 'keep-highest',
  k: 'keep-highest',
  kl: 'keep-lowest',
  dh: 'drop-highest',
  dl: 'drop-lowest',
  d: 'drop-lowest',
  cs: 'count-success',
  cf: 'count-failure',
  df: 'deduct-failure',
  ms: 'margin-success',
  min: 'min',
  max: 'max',
};

export const MODIFIER_PATTERNS: readonly ModPattern[] = buildModifierPatterns(FOUNDRY_SIGILS);

export const CANONICAL_TO_SIGIL: Readonly<Record<string, string>> = {
  'keep-highest': 'kh',
  'keep-lowest': 'kl',
  'drop-highest': 'dh',
  'drop-lowest': 'dl',
  'reroll-once': 'r',
  'reroll-recursive': 'rr',
  explode: 'x',
  'explode-once': 'xo',
  'count-success': 'cs',
  'count-failure': 'cf',
  'deduct-failure': 'df',
  'margin-success': 'ms',
  min: 'min',
  max: 'max',
};
