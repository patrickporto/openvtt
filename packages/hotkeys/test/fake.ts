import type { MinimalKeyboardEvent } from '../src';

export interface FakeEventOptions {
  code?: string;
  key?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  repeat?: boolean;
  target?: unknown;
}

export type FakeKeyEvent = MinimalKeyboardEvent & {
  prevented: boolean;
  stopped: boolean;
};

export function fakeKeyEvent(options: FakeEventOptions = {}): FakeKeyEvent {
  let prevented = false;
  let stopped = false;
  const event = {
    code: options.code,
    key: options.key ?? '',
    ctrlKey: options.ctrl ?? false,
    altKey: options.alt ?? false,
    shiftKey: options.shift ?? false,
    metaKey: options.meta ?? false,
    repeat: options.repeat ?? false,
    target: options.target,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
  };
  return new Proxy(event, {
    get(targetRef, prop: string) {
      if (prop === 'prevented') return prevented;
      if (prop === 'stopped') return stopped;
      return Reflect.get(targetRef, prop);
    },
  }) as FakeKeyEvent;
}

export class FakeTarget {
  readonly listeners = new Map<string, (event: unknown) => void>();

  addEventListener(type: 'keydown' | 'keyup', listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: 'keydown' | 'keyup', listener: (event: unknown) => void): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type: 'keydown' | 'keyup', event: unknown): void {
    (this.listeners.get(type) as ((e: unknown) => void) | undefined)?.(event);
  }
}
