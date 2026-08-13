import type { ModifierOp } from '@openvtt/dice-core';
import {
  buildModifierPatterns,
  canonicalToTokens,
  type ModPattern,
} from '@openvtt/dice-notation-core';

export type { ModPattern };
export { FUNCTIONS, isFunctionName } from '@openvtt/dice-notation-core';

const CANONICAL_NAMES: readonly string[] = [
  'keep-highest',
  'keep-lowest',
  'drop-highest',
  'drop-lowest',
  'reroll-once',
  'reroll-recursive',
  'explode',
  'explode-once',
  'explode-compound',
  'explode-penetrating',
  'min',
  'max',
  'count-success',
  'count-failure',
  'deduct-failure',
  'subtract-failure',
  'count-even',
  'count-odd',
  'margin-success',
  'sort-asc',
  'sort-desc',
];

const ALIASES: Readonly<Record<string, ModifierOp>> = {
  kh: 'keep-highest',
  kl: 'keep-lowest',
  dh: 'drop-highest',
  dl: 'drop-lowest',
  '!': 'explode',
  '!!': 'explode-compound',
  cs: 'count-success',
  cf: 'count-failure',
  df: 'deduct-failure',
  sf: 'subtract-failure',
  ms: 'margin-success',
  sa: 'sort-asc',
  sd: 'sort-desc',
};

export const MODIFIER_PATTERNS: readonly ModPattern[] = [
  ...CANONICAL_NAMES.map(
    (name) => ({ tokens: canonicalToTokens(name), op: name as ModifierOp }) satisfies ModPattern,
  ),
  ...buildModifierPatterns(ALIASES),
].sort((a, b) => b.tokens.length - a.tokens.length);

export const AMBIGUOUS_ALIASES: readonly string[] = ['r', 'rr', 'ro', 'k', 'd', 's'];
