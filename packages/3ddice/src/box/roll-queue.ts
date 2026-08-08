import type { QueueMode } from './config';

export class RollQueue {
  #tail: Promise<unknown> = Promise.resolve();

  constructor(
    private getMode: () => QueueMode,
    private cancelCurrent: () => void
  ) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const mode = this.getMode();
    if (mode === 'parallel') {
      return task();
    }
    if (mode === 'replace') {
      this.cancelCurrent();
    }
    const run = this.#tail.then(task, task);
    this.#tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  reset(): void {
    this.#tail = Promise.resolve();
  }
}
