import type { DialectConfig } from '@openvtt/dice-notation-core';
import { FoundryNotationError } from './errors';
import { CANONICAL_TO_SIGIL, MODIFIER_PATTERNS } from './keywords';

export const dialect: DialectConfig = {
  name: 'dice-foundry-notation',
  createError: (message, options) => new FoundryNotationError(message, options),
  modifierPatterns: MODIFIER_PATTERNS,
  ambiguousAliases: [],
  implicitCountSuccess: false,
  rerollBareNumber: true,
  explodeCap: false,
  noArgOps: [],
  coinFaces: true,
  facesHint: '6, %, f, coin',
  bracedAttributes: false,
  sigils: CANONICAL_TO_SIGIL,
  fateFace: 'f',
  coinFace: 'c',
  rerollOmitEquals: true,
  countSuccessBare: false,
};
