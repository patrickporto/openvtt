import type { Modifier, RollExpr } from '@openvtt/dice-core';

export type ValueOp = 'set' | 'add' | 'multiply' | 'upgrade' | 'downgrade' | 'append' | 'remove';

export interface ValueChange {
  readonly kind: 'value';
  readonly path: string;
  readonly op: ValueOp;
  readonly value: string;
  readonly steps?: number;
  readonly priority?: number;
}

export interface ExtraDie {
  readonly count: number;
  readonly faces: number;
  readonly modifiers?: readonly Modifier[];
}

export interface RollTransform {
  readonly addDice?: number;
  readonly addModifiers?: readonly Modifier[];
  readonly extraDice?: readonly ExtraDie[];
  readonly bonus?: string;
}

export interface RollChange {
  readonly kind: 'roll';
  readonly target: string;
  readonly transform: RollTransform;
  readonly priority?: number;
}

export interface FlagChange {
  readonly kind: 'flag';
  readonly path: string;
  readonly value: boolean | string;
  readonly priority?: number;
}

export type Change = ValueChange | RollChange | FlagChange;

export type DurationUnit = 'seconds' | 'rounds' | 'turns' | 'until-event';

export interface DurationSpec {
  readonly unit: DurationUnit;
  readonly value?: number;
  readonly event?: string;
}

export interface ExpirationState {
  readonly unit: DurationUnit;
  readonly remaining?: number;
  readonly event?: string;
}

export interface TriggerRollInto {
  readonly path: string;
  readonly op?: 'add' | 'subtract' | 'set';
}

export interface TriggerSpec {
  readonly on: string;
  readonly condition?: string;
  readonly changes?: readonly Change[];
  readonly effect?: string;
  readonly roll?: RollExpr | string;
  readonly rollInto?: TriggerRollInto;
}

export type StackingMode = 'stack' | 'newest' | 'highest-priority';

export interface StackingRule {
  readonly group?: string;
  readonly mode?: StackingMode;
}

export type GrantRef = string | { readonly ref: string; readonly data?: Record<string, unknown> };

export interface EffectDefinition {
  readonly id: string;
  readonly label: string;
  readonly changes: readonly Change[];
  readonly duration?: DurationSpec;
  readonly triggers?: readonly TriggerSpec[];
  readonly grants?: readonly GrantRef[];
  readonly condition?: string;
  readonly stacking?: StackingRule;
  readonly priority?: number;
  readonly icon?: string;
}

export interface EffectSource {
  readonly kind: string;
  readonly id?: string;
}

export interface EffectInstance {
  readonly id: string;
  readonly ref?: string;
  readonly inline?: EffectDefinition;
  readonly source: EffectSource;
  enabled: boolean;
  expiresAt?: ExpirationState;
  readonly data?: Record<string, unknown>;
}

export interface CharacterDocument {
  readonly systemId: string;
  readonly systemVersion: string;
  readonly identity: Record<string, unknown>;
  readonly base: Record<string, unknown>;
  readonly effects: EffectInstance[];
}

export interface RollTemplate {
  readonly expr: RollExpr;
  readonly tags?: readonly string[];
}

export interface SystemPack {
  readonly id: string;
  readonly version: string;
  readonly ordinals?: Record<string, readonly string[]>;
  readonly derived?: Record<string, string>;
  readonly rollTemplates?: Record<string, RollTemplate>;
  readonly definitions?: readonly EffectDefinition[];
}

export type ApplyPass = 'flag' | 'set' | 'add' | 'multiply' | 'ordinal' | 'derived';

export interface AuditEntry {
  readonly effectId: string;
  readonly ref?: string;
  readonly pass: ApplyPass;
  readonly path: string;
  readonly op?: string;
  readonly input?: unknown;
  readonly result: unknown;
}

export interface ActiveRollTransform {
  readonly effectId: string;
  readonly ref?: string;
  readonly target: string;
  readonly transform: RollTransform;
}

export type SuppressionReason = 'disabled' | 'stacking' | 'condition';

export interface SuppressedEffect {
  readonly instance: EffectInstance;
  readonly reason: SuppressionReason;
}

export interface ComputedSheet {
  readonly values: Record<string, unknown>;
  readonly flags: Record<string, unknown>;
  readonly scope: Record<string, unknown>;
  readonly audit: readonly AuditEntry[];
  readonly effects: readonly EffectInstance[];
  readonly suppressed: readonly SuppressedEffect[];
  readonly rollTransforms: readonly ActiveRollTransform[];
}

export interface SheetPatch {
  readonly path: string;
  readonly previous: unknown;
  readonly next: unknown;
}
