import type { ModifierOp } from '@openvtt/dice-core';

export interface ModPattern {
  readonly tokens: readonly string[];
  readonly op: ModifierOp;
}

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

const ALIASES: ReadonlyRecord<string, ModifierOp> = {
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

type ReadonlyRecord<K extends string, V> = { readonly [key in K]: V };

function canonicalToTokens(name: string): readonly string[] {
  const parts = name.split('-');
  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    result.push(parts[i]!);
    if (i < parts.length - 1) result.push('-');
  }
  return result;
}

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

export const MODIFIER_PATTERNS: readonly ModPattern[] = [
  ...CANONICAL_NAMES.map(
    (name) => ({ tokens: canonicalToTokens(name), op: name as ModifierOp }) satisfies ModPattern,
  ),
  ...(Object.keys(ALIASES) as (keyof typeof ALIASES)[]).map(
    (alias) => ({ tokens: aliasToTokens(alias), op: ALIASES[alias] }) satisfies ModPattern,
  ),
].sort((a, b) => b.tokens.length - a.tokens.length);

export const OPPOSITE_CANONICAL: ReadonlyRecord<string, ModifierOp> = Object.fromEntries(
  CANONICAL_NAMES.map((name) => [name, name as ModifierOp]),
);

export const FUNCTIONS: readonly string[] = ['floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp'];

export function isFunctionName(name: string): boolean {
  return (FUNCTIONS as readonly string[]).includes(name);
}

export const AMBIGUOUS_ALIASES: readonly string[] = ['r', 'rr', 'ro', 'k', 'd', 's'];
