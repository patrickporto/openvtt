import type { ModifierOp } from '@openvtt/dice-core';
import type { NotationErrorFactory } from './errors';
import type { ModPattern } from './keywords';

export interface DialectConfig {
  readonly name: string;
  readonly createError: NotationErrorFactory;
  readonly modifierPatterns: readonly ModPattern[];
  readonly ambiguousAliases: readonly string[];
  readonly implicitCountSuccess: boolean;
  readonly rerollBareNumber: boolean;
  readonly explodeCap: boolean;
  readonly noArgOps: readonly ModifierOp[];
  readonly coinFaces: boolean;
  readonly facesHint: string;
  readonly bracedAttributes: boolean;
  readonly sigils: Readonly<Record<string, string>>;
  readonly fateFace: string;
  readonly coinFace: string;
  readonly rerollOmitEquals: boolean;
  readonly countSuccessBare: boolean;
}
