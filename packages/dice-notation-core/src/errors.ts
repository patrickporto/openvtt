export interface NotationErrorOptions {
  readonly position?: number;
  readonly input?: string;
  readonly cause?: unknown;
}

export type NotationErrorFactory = (message: string, options: NotationErrorOptions) => Error;

export class NotationErrorBase extends Error {
  readonly position?: number;
  readonly input?: string;

  constructor(name: string, message: string, options: NotationErrorOptions = {}) {
    super(message);
    this.name = name;
    this.position = options.position;
    this.input = options.input;
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
