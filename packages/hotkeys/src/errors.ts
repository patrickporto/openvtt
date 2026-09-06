export type HotkeysErrorCode =
  | 'INVALID_COMBO'
  | 'UNKNOWN_ACTION'
  | 'NOT_EDITABLE'
  | 'INVALID_PROFILE'
  | 'DUPLICATE_ACTION'
  | 'NOT_ATTACHED'
  | 'DESTROYED'
  | 'HOTKEYS_ERROR';

export class HotkeysError extends Error {
  readonly code: HotkeysErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: HotkeysErrorCode = 'HOTKEYS_ERROR', cause?: unknown) {
    super(message);
    this.name = 'HotkeysError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidComboError extends HotkeysError {
  constructor(input: unknown, reason?: string) {
    const display = typeof input === 'string' ? `"${input}"` : JSON.stringify(input);
    super(`Invalid key combo ${display}${reason ? `: ${reason}` : ''}`, 'INVALID_COMBO');
    this.name = 'InvalidComboError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnknownActionError extends HotkeysError {
  constructor(namespace: string, action: string) {
    super(`Unknown hotkey action "${namespace}/${action}".`, 'UNKNOWN_ACTION');
    this.name = 'UnknownActionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotEditableError extends HotkeysError {
  constructor(namespace: string, action: string) {
    super(`Hotkey action "${namespace}/${action}" is not editable.`, 'NOT_EDITABLE');
    this.name = 'NotEditableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidProfileError extends HotkeysError {
  readonly issues: readonly unknown[];

  constructor(message: string, issues: readonly unknown[] = [], cause?: unknown) {
    super(message, 'INVALID_PROFILE', cause);
    this.name = 'InvalidProfileError';
    this.issues = issues;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DuplicateActionError extends HotkeysError {
  constructor(namespace: string, action: string) {
    super(`Hotkey action "${namespace}/${action}" is already registered.`, 'DUPLICATE_ACTION');
    this.name = 'DuplicateActionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotAttachedError extends HotkeysError {
  constructor(message = 'Hotkeys engine is not attached to a keyboard target.') {
    super(message, 'NOT_ATTACHED');
    this.name = 'NotAttachedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
