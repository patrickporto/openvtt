export class FakeClock {
  nowValue = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.nowValue;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.nowValue + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  tick(ms: number): void {
    const target = this.nowValue + ms;
    for (;;) {
      let dueId: number | null = null;
      let dueTask: { at: number; fn: () => void } | null = null;
      for (const [id, task] of this.tasks) {
        if (task.at <= target && (dueTask === null || task.at < dueTask.at)) {
          dueId = id;
          dueTask = task;
        }
      }
      if (dueId === null || dueTask === null) break;
      this.nowValue = dueTask.at;
      this.tasks.delete(dueId);
      dueTask.fn();
    }
    this.nowValue = target;
  }

  get pendingCount(): number {
    return this.tasks.size;
  }
}
