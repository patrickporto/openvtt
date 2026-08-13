import { NotationErrorBase, type NotationErrorOptions } from '@openvtt/dice-notation-core';

export type Roll20NotationErrorOptions = NotationErrorOptions;

export class Roll20NotationError extends NotationErrorBase {
  constructor(message: string, options: Roll20NotationErrorOptions = {}) {
    super('Roll20NotationError', message, options);
  }
}
