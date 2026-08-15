import type { ModifierOp } from '@openvtt/dice-core';
import {
  buildModifierPatterns,
  canonicalToTokens,
  NotationErrorBase,
  type DialectConfig,
  type ModPattern,
  type NotationErrorOptions,
} from '../src';

export class TestNotationError extends NotationErrorBase {
  constructor(message: string, options: NotationErrorOptions = {}) {
    super('TestNotationError', `[test] ${message}`, options);
  }
}

export function createTestError(message: string, options: NotationErrorOptions): Error {
  return new TestNotationError(message, options);
}

export function mergePatterns(
  ...groups: readonly (readonly ModPattern[])[]
): readonly ModPattern[] {
  return groups.flat().sort((a, b) => b.tokens.length - a.tokens.length);
}

export function canonicalPatterns(...names: readonly ModifierOp[]): readonly ModPattern[] {
  return names
    .map((name) => ({ tokens: canonicalToTokens(name), op: name }) satisfies ModPattern)
    .sort((a, b) => b.tokens.length - a.tokens.length);
}

export function aliasPatterns(sigils: Readonly<Record<string, ModifierOp>>): readonly ModPattern[] {
  return buildModifierPatterns(sigils);
}

export function makeDialect(
  name: string,
  overrides: Partial<Omit<DialectConfig, 'name' | 'createError'>> = {},
): DialectConfig {
  return {
    name,
    createError: createTestError,
    modifierPatterns: [],
    ambiguousAliases: [],
    implicitCountSuccess: false,
    rerollBareNumber: false,
    explodeCap: false,
    noArgOps: [],
    coinFaces: false,
    facesHint: '6',
    bracedAttributes: false,
    sigils: {},
    fateFace: 'F',
    coinFace: 'coin',
    rerollOmitEquals: false,
    countSuccessBare: false,
    ...overrides,
  };
}
