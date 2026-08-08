export interface FormulaErrorOptions {
  readonly position?: number;
  readonly input?: string;
  readonly cause?: unknown;
}

export class FormulaError extends Error {
  readonly position?: number;
  readonly input?: string;

  constructor(message: string, options: FormulaErrorOptions = {}) {
    super(message);
    this.name = 'FormulaError';
    this.position = options.position;
    this.input = options.input;
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  override toString(): string {
    const at =
      this.position !== undefined
        ? `\n  at position ${this.position}` +
          (this.input ? `: "${this.input.slice(0, this.position)}»${this.input.slice(this.position, this.position + 12)}"` : '')
        : '';
    return `${this.name}: ${this.message}${at}`;
  }
}
