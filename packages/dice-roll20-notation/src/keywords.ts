import type { ModifierOp } from '@openvtt/dice-core';

export interface ModPattern {
  readonly tokens: readonly string[];
  readonly op: ModifierOp;
}

type ReadonlyRecord<K extends string, V> = { readonly [key in K]: V };

const ROLL20_SIGILS: ReadonlyRecord<string, ModifierOp> = {
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

export const MODIFIER_PATTERNS: readonly ModPattern[] = (Object.keys(ROLL20_SIGILS) as string[])
  .map((alias) => ({ tokens: aliasToTokens(alias), op: ROLL20_SIGILS[alias]! }) satisfies ModPattern)
  .sort((a, b) => b.tokens.length - a.tokens.length);

export const CANONICAL_TO_SIGIL: ReadonlyRecord<string, string> = {
  'keep-highest': 'kh',
  'keep-lowest': 'kl',
  'drop-highest': 'dh',
  'drop-lowest': 'dl',
  'reroll-once': 'ro',
  'reroll-recursive': 'r',
  'explode': '!',
  'explode-compound': '!!',
  'explode-penetrating': '!p',
  'count-failure': 'f',
  'sort-asc': 'sa',
  'sort-desc': 'sd',
};

export const FUNCTIONS: readonly string[] = ['floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp'];

export function isFunctionName(name: string): boolean {
  return (FUNCTIONS as readonly string[]).includes(name);
}
