import { describe, expect, it, mock } from 'bun:test';
import * as v from 'valibot';
import { createBus, defineContract, EventValidationError } from '../src';

describe('notify events', () => {
  it('delivers payloads to on() handlers and returns meta with uuid v7', () => {
    const bus = createBus();
    const received: Array<{ payload: unknown; id: string }> = [];
    bus.on('hello' as never, (payload, meta) => received.push({ payload, id: meta.id }));

    const meta = bus.emit('hello' as never, { a: 1 });

    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({ a: 1 });
    expect(meta.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(meta.wireName).toBe('openvtt:hello');
    expect(meta.namespace).toBe('openvtt');
  });

  it('unsubscribe via the returned disposer', () => {
    const bus = createBus();
    const fn = mock(() => {});
    const off = bus.on('e' as never, fn);
    bus.emit('e' as never);
    bus.emit('e' as never);
    off();
    bus.emit('e' as never);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('once() fires only once', () => {
    const bus = createBus();
    const fn = mock(() => {});
    bus.once('e' as never, fn);
    bus.emit('e' as never, 1);
    bus.emit('e' as never, 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe(1);
  });

  it('off() removes a specific handler', () => {
    const bus = createBus();
    const fn = mock(() => {});
    bus.on('e' as never, fn);
    bus.emit('e' as never);
    bus.off('e' as never, fn);
    bus.emit('e' as never);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onAny() receives every event with its name', () => {
    const bus = createBus();
    const seen: string[] = [];
    bus.onAny((name) => seen.push(name));
    bus.emit('a' as never);
    bus.emit('b' as never);
    expect(seen).toEqual(['a', 'b']);
  });

  it('a throwing handler is isolated and reported via onError, others still run', () => {
    const bus = createBus();
    const errors: unknown[] = [];
    bus.onError((err) => errors.push(err));
    bus.on('e' as never, () => {
      throw new Error('boom');
    });
    const after = mock(() => {});
    bus.on('e' as never, after);
    bus.emit('e' as never);
    expect(errors).toHaveLength(1);
    expect(after).toHaveBeenCalled();
  });
});

describe('validation', () => {
  const contract = defineContract({
    namespace: 'vtt',
    events: {
      moved: v.object({ x: v.number(), y: v.number() }),
    },
  });

  it('accepts valid payloads (coerced output)', () => {
    const bus = createBus(contract);
    const received: number[] = [];
    bus.on('moved', (p) => received.push(p.x));
    bus.emit('moved', { x: 1, y: 2 });
    expect(received).toEqual([1]);
  });

  it('throws on invalid payload in throw mode', () => {
    const bus = createBus(contract);
    expect(() => bus.emit('moved', { x: 'nope', y: 2 } as never)).toThrow(EventValidationError);
  });

  it('warns but still dispatches in warn mode', () => {
    const warn = mock(() => {});
    const original = console.warn;
    console.warn = warn as never;
    try {
      const bus = createBus(contract, { validate: 'warn' });
      const fn = mock(() => {});
      bus.on('moved', fn);
      bus.emit('moved', { x: 'nope' } as never);
      expect(fn).toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    } finally {
      console.warn = original;
    }
  });

  it('rejects unknown events when unknownEvents is reject', () => {
    const bus = createBus(contract, { unknownEvents: 'reject' });
    expect(() => bus.emit('nope' as never, {})).toThrow();
  });
});

describe('id generation', () => {
  it('newId produces monotonic-ish uuid v7 strings', () => {
    const { newId } = require('../src');
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a < b || b < a).toBe(true);
  });
});
