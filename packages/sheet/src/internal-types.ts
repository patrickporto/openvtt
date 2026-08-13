import type { EffectDefinition, EffectInstance } from './types';

export interface ResolvedEffect {
  readonly instance: EffectInstance;
  readonly definition: EffectDefinition;
}
