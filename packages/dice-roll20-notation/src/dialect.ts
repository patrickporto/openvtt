import type { DialectConfig } from '@openvtt/dice-notation-core';
import { Roll20NotationError } from './errors';
import { CANONICAL_TO_SIGIL, MODIFIER_PATTERNS } from './keywords';

export const dialect: DialectConfig = {
  name: 'dice-roll20-notation',
  createError: (message, options) => new Roll20NotationError(message, options),
  modifierPatterns: MODIFIER_PATTERNS,
  ambiguousAliases: [],
  implicitCountSuccess: true,
  rerollBareNumber: false,
  explodeCap: true,
  noArgOps: ['sort-asc', 'sort-desc'],
  coinFaces: false,
  facesHint: '6, %, F',
  bracedAttributes: true,
  sigils: CANONICAL_TO_SIGIL,
  fateFace: 'F',
  coinFace: 'coin',
  rerollOmitEquals: false,
  countSuccessBare: true,
};
