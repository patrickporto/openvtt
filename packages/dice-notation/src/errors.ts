import { NotationErrorBase, type NotationErrorOptions } from '@openvtt/dice-notation-core';

export type { NotationErrorOptions };

export class NotationError extends NotationErrorBase {
  constructor(message: string, options: NotationErrorOptions = {}) {
    super('NotationError', message, options);
  }
}
