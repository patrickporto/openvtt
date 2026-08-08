export interface NotationErrorOptions {
  readonly position?: number;
  readonly input?: string;
  readonly cause?: unknown;
}

export class NotationError extends Error {
  readonly position?: number;
  readonly input?: string;

  constructor(message: string, options: NotationErrorOptions = {}) {
    super(message);
    this.name = 'NotationError';
    this.position = options.position;
    this.input = options.input;
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
