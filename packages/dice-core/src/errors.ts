export interface DiceErrorOptions {
  readonly cause?: unknown;
  readonly position?: number;
  readonly input?: string;
}

export class DiceError extends Error {
  readonly position?: number;
  readonly input?: string;

  constructor(message: string, options: DiceErrorOptions = {}) {
    super(message);
    this.name = 'DiceError';
    this.position = options.position;
    this.input = options.input;
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
