import type { ModifierOp } from '@openvtt/dice-core';

export interface ModPattern {
  readonly tokens: readonly string[];
  readonly op: ModifierOp;
}

type ReadonlyRecord<V> = { readonly [key: string]: V };

const FOUNDRY_SIGILS: ReadonlyRecord<ModifierOp> = {
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

function aliasToTokens(alias: string): readonly string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < alias.length) {
    const ch = alias[i]!;
    if (/[A-Za-z_]/.test(ch)) {
      let word = '';
      while (i < alias.length && /[A-Za-z_]/.test(alias[i]!)) word += alias[i++];
      tokens.push(word);
    } else {
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

export const MODIFIER_PATTERNS: readonly ModPattern[] = (Object.keys(FOUNDRY_SIGILS))
  .map((alias) => ({ tokens: aliasToTokens(alias), op: FOUNDRY_SIGILS[alias]! }) satisfies ModPattern)
  .sort((a, b) => b.tokens.length - a.tokens.length);

export const CANONICAL_TO_SIGIL: ReadonlyRecord<string> = {
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

export const FUNCTIONS: readonly string[] = ['floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp'];
