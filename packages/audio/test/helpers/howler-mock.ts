import { mock } from 'bun:test';

export class FakeHowl {
  static all: FakeHowl[] = [];
  static nextIid = 1;

  readonly calls: Record<string, unknown[][]> = {};
  private readonly handlers = new Map<string, Array<(iid: number) => void>>();
  private readonly onceWrapped = new Map<string, Array<(iid: number) => void>>();

  volumeValue = 0;
  readonly playingIids = new Set<number>();
  unloaded = false;

  constructor(public readonly opts: Record<string, unknown>) {
    FakeHowl.all.push(this);
  }

  static reset(): void {
    FakeHowl.all = [];
    FakeHowl.nextIid = 1;
  }

  private record(method: string, ...args: unknown[]): void {
    (this.calls[method] ??= []).push(args);
  }

  private emit(event: string, iid: number): void {
    const wrapped = this.onceWrapped.get(event) ?? [];
    this.onceWrapped.set(event, []);
    for (const fn of wrapped) fn(iid);
    for (const fn of [...(this.handlers.get(event) ?? [])]) fn(iid);
  }

  on(event: string, handler: (iid: number) => void): this {
    (this.handlers.get(event) ?? this.handlers.set(event, []).get(event)!).push(handler);
    return this;
  }

  once(event: string, handler: (iid: number) => void): this {
    const wrapped = (iid: number): void => {
      const list = this.onceWrapped.get(event) ?? [];
      const index = list.indexOf(wrapped);
      if (index >= 0) list.splice(index, 1);
      handler(iid);
    };
    (this.onceWrapped.get(event) ?? this.onceWrapped.set(event, []).get(event)!).push(wrapped);
    return this;
  }

  off(event: string, handler: (iid: number) => void): this {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    }
    return this;
  }

  play(iid?: number): number {
    this.record('play', iid);
    if (iid !== undefined) {
      this.playingIids.add(iid);
      this.emit('play', iid);
      return iid;
    }
    const id = FakeHowl.nextIid++;
    this.playingIids.add(id);
    this.emit('play', id);
    return id;
  }

  pause(iid?: number): this {
    this.record('pause', iid);
    if (iid !== undefined) this.playingIids.delete(iid);
    else this.playingIids.clear();
    return this;
  }

  stop(iid?: number): this {
    this.record('stop', iid);
    if (iid !== undefined) {
      this.playingIids.delete(iid);
      this.emit('stop', iid);
    } else {
      this.playingIids.clear();
    }
    return this;
  }

  playing(iid?: number): boolean {
    this.record('playing', iid);
    if (iid === undefined) return this.playingIids.size > 0;
    return this.playingIids.has(iid);
  }

  volume(arg?: number, iid?: number): number {
    this.record('volume', arg, iid);
    if (typeof arg === 'number') this.volumeValue = arg;
    return this.volumeValue;
  }

  fade(from: number, to: number, durationMs: number, iid?: number): this {
    this.record('fade', from, to, durationMs, iid);
    this.volumeValue = to;
    this.emit('fade', iid ?? -1);
    return this;
  }

  mute(muted: boolean, iid?: number): this {
    this.record('mute', muted, iid);
    return this;
  }

  pos(x?: number, y?: number, z?: number, iid?: number): this {
    this.record('pos', x, y, z, iid);
    return this;
  }

  pannerAttr(attrs?: unknown, iid?: number): this {
    this.record('pannerAttr', attrs, iid);
    return this;
  }

  seek(position?: number, iid?: number): number {
    this.record('seek', position, iid);
    return 0;
  }

  state(): string {
    return 'loaded';
  }

  duration(): number {
    return 100;
  }

  unload(): this {
    this.record('unload');
    this.unloaded = true;
    return this;
  }

  emits(event: string, iid: number): void {
    this.emit(event, iid);
  }

  callCount(method: string): number {
    return this.calls[method]?.length ?? 0;
  }
}

export const FakeHowler = {
  calls: {
    volume: [] as unknown[][],
    mute: [] as unknown[][],
    pos: [] as unknown[][],
    orientation: [] as unknown[][],
  },
  usingWebAudio: true,
  volumeValue: 1,
  muted: false,
  ctx: { state: 'running' as string, resume: (): void => {} },

  volume(value?: number): number {
    this.calls.volume.push([value]);
    if (value !== undefined) this.volumeValue = value;
    return this.volumeValue;
  },

  mute(muted?: boolean): boolean {
    this.calls.mute.push([muted]);
    if (muted !== undefined) this.muted = muted;
    return this.muted;
  },

  pos(x?: number, y?: number, z?: number): number[] {
    this.calls.pos.push([x, y, z]);
    return [0, 0, 0];
  },

  orientation(x?: number, y?: number, z?: number, xUp?: number, yUp?: number, zUp?: number): number[] {
    this.calls.orientation.push([x, y, z, xUp, yUp, zUp]);
    return [0, 0, -1, 0, 1, 0];
  },

  reset(): void {
    this.calls.volume = [];
    this.calls.mute = [];
    this.calls.pos = [];
    this.calls.orientation = [];
    this.volumeValue = 1;
    this.muted = false;
    this.usingWebAudio = true;
    this.ctx.state = 'running';
  },
};

export function installHowlerMock(): void {
  mock.module('howler', () => ({ Howl: FakeHowl, Howler: FakeHowler }));
}
