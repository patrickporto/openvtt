import type { DialectConfig } from '@openvtt/dice-notation-core';
import { NotationError } from './errors';
import { AMBIGUOUS_ALIASES, MODIFIER_PATTERNS } from './keywords';

export const dialect: DialectConfig = {
  name: 'dice-notation',
  createError: (message, options) => new NotationError(message, options),
  modifierPatterns: MODIFIER_PATTERNS,
  ambiguousAliases: AMBIGUOUS_ALIASES,
  implicitCountSuccess: false,
  rerollBareNumber: false,
  explodeCap: true,
  noArgOps: ['count-even', 'count-odd', 'sort-asc', 'sort-desc'],
  coinFaces: true,
  facesHint: '6, %, F, coin',
  bracedAttributes: false,
  sigils: {},
  fateFace: 'F',
  coinFace: 'coin',
  rerollOmitEquals: false,
  countSuccessBare: false,
};
