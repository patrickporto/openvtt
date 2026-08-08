import { describe, expect, it, mock } from 'bun:test';
import * as v from 'valibot';
import { createBus, defineContract, getBridgeRegistry, GLOBAL_KEY } from '../src';

describe('bridge global registry', () => {
  it('exposes a public handle under globalThis[GLOBAL_KEY] when bridge is enabled', () => {
    const ns = `bridge-${Math.random().toString(36).slice(2)}`;
    const bus = createBus(
      defineContract({ namespace: ns, events: { ping: v.object({ msg: v.string() }) } }),
      { bridge: true },
    );

    const registry = getBridgeRegistry();
    expect(registry).toBeDefined();
    expect(registry!.list()).toContain(ns);
    expect(registry!.has(ns)).toBe(true);

    const handle = registry!.get(ns);
    expect(handle?.namespace).toBe(ns);
    expect(handle?.events()).toEqual(['ping']);

    bus.destroy();
    expect(registry!.has(ns)).toBe(false);
  });

  it('external emit/on round-trips through the bus with validation', () => {
    const ns = `bridge2-${Math.random().toString(36).slice(2)}`;
    const bus = createBus(
      defineContract({ namespace: ns, events: { ping: v.object({ msg: v.string() }) } }),
      { bridge: true },
    );
    const handle = getBridgeRegistry()!.get(ns)!;
    const received: string[] = [];
    handle.on('ping', (payload) => received.push((payload as { msg: string }).msg));

    handle.emit('ping', { msg: 'hi' });
    expect(received).toEqual(['hi']);

    expect(() => handle.emit('ping', { msg: 123 } as never)).toThrow();

    bus.destroy();
  });
});

describe('bridge CustomEvent dispatch', () => {
  it('dispatches a namespaced CustomEvent on the resolved target', () => {
    const ns = `cbe-${Math.random().toString(36).slice(2)}`;
    const bus = createBus(defineContract({ namespace: ns }), { bridge: true });
    const captured: Array<{ detail: unknown }> = [];
    const handler = (event: Event) => captured.push({ detail: (event as CustomEvent).detail });
    globalThis.addEventListener(`${ns}:boom`, handler as EventListener);
    try {
      bus.emit('boom' as never, { v: 42 });
    } finally {
      globalThis.removeEventListener(`${ns}:boom`, handler as EventListener);
    }
    expect(captured).toHaveLength(1);
    expect((captured[0].detail as { payload: { v: number } }).payload).toEqual({ v: 42 });
    bus.destroy();
  });

  it('GLOBAL_KEY constant is exposed', () => {
    expect(GLOBAL_KEY).toBe('__OPENVTT_EVENTS__');
    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeDefined();
  });
});
