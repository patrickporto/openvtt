export type EventBusErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_EVENT'
  | 'UNKNOWN_HOOK'
  | 'HOOK_ERROR'
  | 'BRIDGE_ERROR'
  | 'NOT_INITIALIZED'
  | 'EVENT_BUS_ERROR';

export class EventBusError extends Error {
  readonly code: EventBusErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: EventBusErrorCode = 'EVENT_BUS_ERROR', cause?: unknown) {
    super(message);
    this.name = 'EventBusError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EventValidationError extends EventBusError {
  readonly issues: readonly unknown[];

  constructor(message: string, issues: readonly unknown[] = []) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'EventValidationError';
    this.issues = issues;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnknownEventError extends EventBusError {
  constructor(name: string) {
    super(`Unknown event "${name}". Register it in the contract or use a freeform bus.`, 'UNKNOWN_EVENT');
    this.name = 'UnknownEventError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnknownHookError extends EventBusError {
  constructor(name: string) {
    super(`Unknown hook "${name}". Register it in the contract.`, 'UNKNOWN_HOOK');
    this.name = 'UnknownHookError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class HookError extends EventBusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'HOOK_ERROR', cause);
    this.name = 'HookError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
