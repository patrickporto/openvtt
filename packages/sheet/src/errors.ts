export type SheetErrorCode =
  | 'CYCLE'
  | 'UNKNOWN_EFFECT'
  | 'UNKNOWN_TEMPLATE'
  | 'UNKNOWN_ORDINAL'
  | 'PACK_VALIDATION'
  | 'TRIGGER';

export interface SheetErrorOptions {
  readonly code: SheetErrorCode;
  readonly effectIds?: readonly string[];
  readonly cause?: unknown;
}

export class SheetError extends Error {
  readonly code: SheetErrorCode;
  readonly effectIds: readonly string[];

  constructor(message: string, options: SheetErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'SheetError';
    this.code = options.code;
    this.effectIds = options.effectIds ?? [];
  }
}

export class EffectCycleError extends SheetError {
  constructor(effectIds: readonly string[]) {
    super(
      `Effect conditions did not stabilize after 2 passes (cycle): ${effectIds.join(', ')}`,
      { code: 'CYCLE', effectIds },
    );
    this.name = 'EffectCycleError';
  }
}

export class UnknownEffectError extends SheetError {
  constructor(ref: string) {
    super(`Unknown effect definition "${ref}"`, { code: 'UNKNOWN_EFFECT' });
    this.name = 'UnknownEffectError';
  }
}

export class UnknownTemplateError extends SheetError {
  constructor(templateId: string) {
    super(`Unknown roll template "${templateId}"`, { code: 'UNKNOWN_TEMPLATE' });
    this.name = 'UnknownTemplateError';
  }
}

export class UnknownOrdinalError extends SheetError {
  constructor(ladder: string) {
    super(`Unknown ordinal ladder "${ladder}"`, { code: 'UNKNOWN_ORDINAL' });
    this.name = 'UnknownOrdinalError';
  }
}

export class PackValidationError extends SheetError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`System pack failed validation:\n${issues.map((i) => `  - ${i}`).join('\n')}`, {
      code: 'PACK_VALIDATION',
    });
    this.name = 'PackValidationError';
    this.issues = issues;
  }
}
