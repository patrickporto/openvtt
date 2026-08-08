export interface FoundryNotationErrorOptions {
  readonly position?: number;
  readonly input?: string;
  readonly cause?: unknown;
}

export class FoundryNotationError extends Error {
  readonly position?: number;
  readonly input?: string;

  constructor(message: string, options: FoundryNotationErrorOptions = {}) {
    super(message);
    this.name = 'FoundryNotationError';
    this.position = options.position;
    this.input = options.input;
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
