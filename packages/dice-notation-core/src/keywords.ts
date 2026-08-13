import type { ModifierOp } from '@openvtt/dice-core';

export interface ModPattern {
  readonly tokens: readonly string[];
  readonly op: ModifierOp;
}

export const FUNCTIONS: readonly string[] = ['floor', 'ceil', 'round', 'abs', 'min', 'max', 'clamp'];

export const KEEP_DROP_OPS: readonly ModifierOp[] = [
  'keep-highest',
  'keep-lowest',
  'drop-highest',
  'drop-lowest',
];

export const EXPLODE_OPS: readonly ModifierOp[] = [
  'explode',
  'explode-once',
  'explode-compound',
  'explode-penetrating',
];

export const FAILURE_OPS: readonly ModifierOp[] = [
  'count-failure',
  'deduct-failure',
  'subtract-failure',
];

export function isFunctionName(name: string): boolean {
  return FUNCTIONS.includes(name);
}

export function canonicalToTokens(name: string): readonly string[] {
  const parts = name.split('-');
  const result: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    result.push(parts[i]!);
    if (i < parts.length - 1) result.push('-');
  }
  return result;
}

export function aliasToTokens(alias: string): readonly string[] {
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

export function buildModifierPatterns(
  sigils: Readonly<Record<string, ModifierOp>>,
): readonly ModPattern[] {
  return Object.keys(sigils)
    .map((alias) => ({ tokens: aliasToTokens(alias), op: sigils[alias]! }) satisfies ModPattern)
    .sort((a, b) => b.tokens.length - a.tokens.length);
}
