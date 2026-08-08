export interface Roll20NotationErrorOptions {
  readonly position?: number;
  readonly input?: string;
  readonly cause?: unknown;
}

export class Roll20NotationError extends Error {
  readonly position?: number;
  readonly input?: string;

  constructor(message: string, options: Roll20NotationErrorOptions = {}) {
    super(message);
    this.name = 'Roll20NotationError';
    this.position = options.position;
    this.input = options.input;
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
