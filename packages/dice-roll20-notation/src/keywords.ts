import type { ModifierOp } from '@openvtt/dice-core';
import { buildModifierPatterns, type ModPattern } from '@openvtt/dice-notation-core';

export type { ModPattern };
export { FUNCTIONS, isFunctionName } from '@openvtt/dice-notation-core';

const ROLL20_SIGILS: Readonly<Record<string, ModifierOp>> = {
  '!!': 'explode-compound',
  '!p': 'explode-penetrating',
  '!': 'explode',
  kh: 'keep-highest',
  k: 'keep-highest',
  kl: 'keep-lowest',
  dh: 'drop-highest',
  dl: 'drop-lowest',
  d: 'drop-lowest',
  ro: 'reroll-once',
  r: 'reroll-recursive',
  cs: 'count-success',
  cf: 'count-failure',
  f: 'count-failure',
  s: 'sort-asc',
  sa: 'sort-asc',
  sd: 'sort-desc',
};

export const MODIFIER_PATTERNS: readonly ModPattern[] = buildModifierPatterns(ROLL20_SIGILS);

export const CANONICAL_TO_SIGIL: Readonly<Record<string, string>> = {
  'keep-highest': 'kh',
  'keep-lowest': 'kl',
  'drop-highest': 'dh',
  'drop-lowest': 'dl',
  'reroll-once': 'ro',
  'reroll-recursive': 'r',
  explode: '!',
  'explode-compound': '!!',
  'explode-penetrating': '!p',
  'count-failure': 'f',
  'sort-asc': 'sa',
  'sort-desc': 'sd',
};
