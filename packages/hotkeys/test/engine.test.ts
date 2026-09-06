import { describe, expect, it, mock } from 'bun:test';
import { NotAttachedError, createHotkeyManager } from '../src';
import type { HotkeyManager } from '../src';
import { FakeTarget, fakeKeyEvent } from './fake';

function managerWithPing(options: { onDown?: () => boolean | void } = {}): HotkeyManager {
  const manager = createHotkeyManager();
  manager.register('core', 'ping', {
    name: 'Ping',
    binds: ['Ctrl+P'],
    onDown: options.onDown ?? (() => true),
  });
  return manager;
}

describe('dispatch', () => {
  it('triggers onDown for matching binds and reports handled', () => {
    const onDown = mock(() => true);
    const manager = managerWithPing({ onDown });
    const triggered: unknown[] = [];
    manager.bus.on('hotkeyTriggered', (payload) => triggered.push(payload));

    const handled = manager.handle(fakeKeyEvent({ code: 'KeyP', ctrl: true }));
    expect(handled).toBe(true);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(triggered).toEqual([
      { namespace: 'core', action: 'ping', combo: 'ctrl+p', phase: 'down', repeat: false },
    ]);
  });

  it('does not trigger when the key or modifiers do not match', () => {
    const onDown = mock(() => true);
    const manager = managerWithPing({ onDown });

    expect(manager.handle(fakeKeyEvent({ code: 'KeyP' }))).toBe(false);
    expect(manager.handle(fakeKeyEvent({ code: 'KeyP', ctrl: true, shift: true }))).toBe(false);
    expect(manager.handle(fakeKeyEvent({ code: 'KeyO', ctrl: true }))).toBe(false);
    expect(onDown).not.toHaveBeenCalled();
  });

  it('triggers onUp on the keyup phase', () => {
    const manager = createHotkeyManager();
    const onUp = mock(() => true);
    manager.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P'], onUp });

    const handled = manager.handle(fakeKeyEvent({ code: 'KeyP', ctrl: true }), 'up');
    expect(handled).toBe(true);
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('passes a full context to handlers', () => {
    const manager = createHotkeyManager();
    let received: unknown;
    manager.register('core', 'ping', {
      name: 'Ping',
      binds: ['Ctrl+P'],
      onDown: (ctx) => {
        received = ctx;
        return true;
      },
    });

    const event = fakeKeyEvent({ code: 'KeyP', ctrl: true });
    manager.handle(event);
    expect(received).toMatchObject({
      event,
      namespace: 'core',
      action: 'ping',
      combo: 'ctrl+p',
      phase: 'down',
      repeat: false,
    });
  });

  it('honors secondary binds', () => {
    const onDown = mock(() => true);
    const manager = createHotkeyManager();
    manager.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P', 'F9'], onDown });

    expect(manager.handle(fakeKeyEvent({ code: 'F9' }))).toBe(true);
    expect(onDown).toHaveBeenCalledTimes(1);
  });
});

describe('modifiers and repeats', () => {
  it('allows extra modifiers declared as reserved', () => {
    const onDown = mock(() => true);
    const manager = createHotkeyManager();
    manager.register('core', 'ping', {
      name: 'Ping',
      binds: ['Ctrl+P'],
      reservedModifiers: ['shift'],
      onDown,
    });

    expect(manager.handle(fakeKeyEvent({ code: 'KeyP', ctrl: true, shift: true }))).toBe(true);
    expect(manager.handle(fakeKeyEvent({ code: 'KeyP', ctrl: true, alt: true }))).toBe(false);
  });

  it('swallows key repeats unless the action opts in', () => {
    const manager = createHotkeyManager();
    const plain = mock(() => true);
    const repeating = mock(() => true);
    manager.register('core', 'plain', { name: 'Plain', binds: ['Digit1'], onDown: plain });
    manager.register('core', 'repeating', {
      name: 'Repeating',
      binds: ['Digit2'],
      onDown: repeating,
      repeat: true,
    });

    manager.handle(fakeKeyEvent({ code: 'Digit1', repeat: true }));
    manager.handle(fakeKeyEvent({ code: 'Digit2', repeat: true }));
    expect(plain).not.toHaveBeenCalled();
    expect(repeating).toHaveBeenCalledTimes(1);
  });
});

describe('contexts', () => {
  it('only fires scoped actions while their context is active', () => {
    const manager = createHotkeyManager();
    const onDown = mock(() => true);
    manager.register('canvas', 'measure', {
      name: 'Measure',
      binds: ['KeyM'],
      context: 'canvas',
      onDown,
    });

    const contexts: string[][] = [];
    manager.bus.on('contextsChanged', (payload) => contexts.push(payload.active));

    expect(manager.handle(fakeKeyEvent({ code: 'KeyM' }))).toBe(false);
    expect(onDown).not.toHaveBeenCalled();

    manager.activateContext('canvas');
    expect(manager.activeContexts()).toEqual(['canvas']);
    expect(manager.handle(fakeKeyEvent({ code: 'KeyM' }))).toBe(true);
    expect(onDown).toHaveBeenCalledTimes(1);

    manager.deactivateContext('canvas');
    expect(manager.handle(fakeKeyEvent({ code: 'KeyM' }))).toBe(false);
    expect(contexts).toEqual([['canvas'], []]);
  });

  it('replaces the active set via setActiveContexts', () => {
    const manager = createHotkeyManager();
    manager.setActiveContexts(['chat', 'sheet']);
    expect(manager.activeContexts()).toEqual(['chat', 'sheet']);
  });
});

describe('input fields', () => {
  it('skips actions while typing in inputs unless allowed', () => {
    const manager = createHotkeyManager();
    const blocked = mock(() => true);
    const allowed = mock(() => true);
    manager.register('core', 'blocked', { name: 'Blocked', binds: ['Escape'], onDown: blocked });
    manager.register('chat', 'escape', {
      name: 'Escape chat',
      binds: ['Escape'],
      onDown: allowed,
      allowInInputs: true,
    });

    const inInput = fakeKeyEvent({ code: 'Escape', target: { tagName: 'INPUT' } });
    manager.handle(inInput);
    expect(blocked).not.toHaveBeenCalled();
    expect(allowed).toHaveBeenCalledTimes(1);

    manager.handle(fakeKeyEvent({ code: 'Escape' }));
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it('treats contenteditable elements as inputs', () => {
    const manager = createHotkeyManager();
    const onDown = mock(() => true);
    manager.register('core', 'ping', { name: 'Ping', binds: ['Escape'], onDown });

    const handled = manager.handle(
      fakeKeyEvent({ code: 'Escape', target: { isContentEditable: true } }),
    );
    expect(handled).toBe(false);
    expect(onDown).not.toHaveBeenCalled();
  });

  it('can dispatch inside inputs when skipInputs is disabled', () => {
    const manager = createHotkeyManager({ skipInputs: false });
    const onDown = mock(() => true);
    manager.register('core', 'ping', { name: 'Ping', binds: ['Escape'], onDown });

    const handled = manager.handle(
      fakeKeyEvent({ code: 'Escape', target: { tagName: 'TEXTAREA' } }),
    );
    expect(handled).toBe(true);
    expect(onDown).toHaveBeenCalledTimes(1);
  });
});

describe('conflict resolution', () => {
  it('executes higher precedence actions first and stops when handled', () => {
    const manager = createHotkeyManager();
    const calls: string[] = [];
    manager.register('core', 'low', {
      name: 'Low',
      binds: ['Ctrl+D'],
      onDown: () => {
        calls.push('low');
        return true;
      },
    });
    manager.register('ui', 'high', {
      name: 'High',
      binds: ['Ctrl+D'],
      precedence: 10,
      onDown: () => {
        calls.push('high');
        return true;
      },
    });

    expect(manager.handle(fakeKeyEvent({ code: 'KeyD', ctrl: true }))).toBe(true);
    expect(calls).toEqual(['high']);
  });

  it('falls through to lower precedence when the winner does not handle it', () => {
    const manager = createHotkeyManager();
    const calls: string[] = [];
    manager.register('core', 'low', {
      name: 'Low',
      binds: ['Ctrl+D'],
      onDown: () => {
        calls.push('low');
        return true;
      },
    });
    manager.register('ui', 'high', {
      name: 'High',
      binds: ['Ctrl+D'],
      precedence: 10,
      onDown: () => {
        calls.push('high');
      },
    });

    expect(manager.handle(fakeKeyEvent({ code: 'KeyD', ctrl: true }))).toBe(true);
    expect(calls).toEqual(['high', 'low']);
  });

  it('breaks ties by registration order', () => {
    const manager = createHotkeyManager();
    const calls: string[] = [];
    manager.register('core', 'first', {
      name: 'First',
      binds: ['Ctrl+D'],
      onDown: () => {
        calls.push('first');
        return true;
      },
    });
    manager.register('ui', 'second', {
      name: 'Second',
      binds: ['Ctrl+D'],
      onDown: () => {
        calls.push('second');
        return true;
      },
    });

    manager.handle(fakeKeyEvent({ code: 'KeyD', ctrl: true }));
    expect(calls).toEqual(['first']);
  });

  it('isolates handler errors and keeps dispatching', () => {
    const manager = createHotkeyManager();
    const fallback = mock(() => true);
    const errors: unknown[] = [];
    manager.bus.on('hotkeyError', (payload) => errors.push(payload));
    manager.register('core', 'boom', {
      name: 'Boom',
      binds: ['Ctrl+D'],
      precedence: 10,
      onDown: () => {
        throw new Error('kaboom');
      },
    });
    manager.register('ui', 'fallback', { name: 'Fallback', binds: ['Ctrl+D'], onDown: fallback });

    expect(manager.handle(fakeKeyEvent({ code: 'KeyD', ctrl: true }))).toBe(true);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([
      { namespace: 'core', action: 'boom', combo: 'ctrl+d', message: 'kaboom' },
    ]);
  });
});

describe('beforeHotkey hook', () => {
  it('vetoes execution when a tap flags it', () => {
    const manager = createHotkeyManager();
    const onDown = mock(() => true);
    manager.register('chat', 'danger', { name: 'Danger', binds: ['Ctrl+D'], onDown });
    manager.bus.tap('beforeHotkey', 'guard', (ctx) =>
      ctx.action === 'danger' ? { ...ctx, veto: true } : undefined,
    );

    expect(manager.handle(fakeKeyEvent({ code: 'KeyD', ctrl: true }))).toBe(false);
    expect(onDown).not.toHaveBeenCalled();
  });

  it('lets taps enrich the context without vetoing', () => {
    const manager = createHotkeyManager();
    const onDown = mock(() => true);
    manager.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P'], onDown });
    manager.bus.tap('beforeHotkey', 'noop', (ctx) => ctx);

    expect(manager.handle(fakeKeyEvent({ code: 'KeyP', ctrl: true }))).toBe(true);
    expect(onDown).toHaveBeenCalledTimes(1);
  });
});

describe('default event handling', () => {
  it('prevents default when a handler claims the event', () => {
    const manager = managerWithPing();
    const event = fakeKeyEvent({ code: 'KeyP', ctrl: true });
    manager.handle(event);
    expect(event.prevented).toBe(true);
    expect(event.stopped).toBe(true);
  });

  it('leaves the event alone when nothing handles it', () => {
    const manager = createHotkeyManager();
    const event = fakeKeyEvent({ code: 'KeyP', ctrl: true });
    manager.handle(event);
    expect(event.prevented).toBe(false);
    expect(event.stopped).toBe(false);
  });

  it('can disable automatic preventDefault', () => {
    const manager = createHotkeyManager({ autoPreventDefault: false });
    manager.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P'], onDown: () => true });
    const event = fakeKeyEvent({ code: 'KeyP', ctrl: true });
    manager.handle(event);
    expect(event.prevented).toBe(false);
  });
});

describe('attach/detach', () => {
  it('wires keyboard listeners to the target', () => {
    const target = new FakeTarget();
    const manager = createHotkeyManager();
    const onDown = mock(() => true);
    const onUp = mock(() => true);
    manager.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P'], onDown, onUp });

    manager.attach(target);
    expect(manager.isAttached).toBe(true);

    const down = fakeKeyEvent({ code: 'KeyP', ctrl: true });
    target.dispatch('keydown', down);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(down.prevented).toBe(true);

    target.dispatch('keyup', fakeKeyEvent({ code: 'KeyP', ctrl: true }));
    expect(onUp).toHaveBeenCalledTimes(1);

    manager.detach();
    expect(manager.isAttached).toBe(false);
    expect(target.listeners.size).toBe(0);
  });

  it('throws when no keyboard target exists', () => {
    const manager = createHotkeyManager();
    if (typeof window === 'undefined') {
      expect(() => manager.attach()).toThrow(NotAttachedError);
    }
  });
});

describe('manager lifecycle', () => {
  it('rejects usage after destroy', () => {
    const manager = createHotkeyManager();
    manager.destroy();
    expect(manager.isDestroyed).toBe(true);
    expect(() => manager.register('core', 'ping', { name: 'Ping' })).toThrow();
  });

  it('does not destroy an injected bus', () => {
    const busManager = createHotkeyManager();
    const manager = createHotkeyManager({ bus: busManager.bus });
    manager.destroy();
    expect(busManager.bus.isDestroyed).toBe(false);
  });

  it('reflects registered actions in listActions and getAction', () => {
    const manager = createHotkeyManager();
    manager.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P'] });
    manager.register('core', 'pong', { name: 'Pong', binds: ['Ctrl+Shift+P'] });

    expect(manager.listActions().map((a) => a.action).sort()).toEqual(['ping', 'pong']);
    expect(manager.getAction('core', 'ping')?.name).toBe('Ping');
    expect(manager.getAction('core', 'nope')).toBeUndefined();
  });
});
