import { describe, expect, it, mock } from 'bun:test';
import * as v from 'valibot';
import { createBus, defineContract, HookError } from '../src';

describe('sync hooks', () => {
  it('sync strategy runs all taps ignoring return values', () => {
    const bus = createBus(
      defineContract({
        hooks: {
          greet: { strategy: 'sync' },
        },
      }),
    );
    const a = mock((c: { name: string }) => {});
    const b = mock((c: { name: string }) => {});
    bus.tap('greet', 'a', a);
    bus.tap('greet', 'b', b);
    const result = bus.call('greet', { name: 'world' });
    expect(a).toHaveBeenCalledWith({ name: 'world' });
    expect(b).toHaveBeenCalledWith({ name: 'world' });
    expect(result).toEqual({ name: 'world' });
  });

  it('syncBail stops at the first non-undefined return and returns it', () => {
    const bus = createBus(
      defineContract({
        hooks: {
          check: { strategy: 'syncBail' },
        },
      }),
    );
    const c = mock((c: { v: number }) => (c.v > 0 ? 'positive' : undefined));
    const never = mock(() => 'should-not-run');
    bus.tap('check', 'c', c);
    bus.tap('check', 'never', never);
    const result = bus.call('check', { v: 5 });
    expect(result).toBe('positive');
    expect(never).not.toHaveBeenCalled();
  });

  it('syncWaterfall threads the return of each tap to the next', () => {
    const bus = createBus(
      defineContract({
        hooks: {
          transform: { strategy: 'syncWaterfall' },
        },
      }),
    );
    bus.tap('transform', 'double', (c: { n: number }) => ({ n: c.n * 2 }));
    bus.tap('transform', 'plus1', (c: { n: number }) => ({ n: c.n + 1 }));
    const result = bus.call('transform', { n: 3 });
    expect(result).toEqual({ n: 7 });
  });
});

describe('async hooks', () => {
  it('asyncSeries runs taps sequentially via callAsync', async () => {
    const bus = createBus(
      defineContract({
        hooks: {
          load: { strategy: 'asyncSeries' },
        },
      }),
    );
    const order: string[] = [];
    bus.tapPromise('load', 'a', async (c: { id: string }) => {
      order.push(`a:${c.id}`);
    });
    bus.tapPromise('load', 'b', async (c: { id: string }) => {
      order.push(`b:${c.id}`);
    });
    await bus.callAsync('load', { id: 'x' });
    expect(order).toEqual(['a:x', 'b:x']);
  });

  it('asyncSeriesWaterfall threads values through async taps', async () => {
    const bus = createBus(
      defineContract({
        hooks: {
          pipe: { strategy: 'asyncSeriesWaterfall' },
        },
      }),
    );
    bus.tapPromise('pipe', 'a', async (c: { n: number }) => ({ n: c.n + 10 }));
    bus.tapPromise('pipe', 'b', async (c: { n: number }) => ({ n: c.n * 2 }));
    const result = await bus.callAsync('pipe', { n: 1 });
    expect(result).toEqual({ n: 22 });
  });

  it('asyncParallel runs taps concurrently', async () => {
    const bus = createBus(
      defineContract({
        hooks: {
          fan: { strategy: 'asyncParallel' },
        },
      }),
    );
    let done = 0;
    bus.tapPromise('fan', 'a', async () => {
      done++;
    });
    bus.tapPromise('fan', 'b', async () => {
      done++;
    });
    await bus.callAsync('fan', {});
    expect(done).toBe(2);
  });

  it('calling an async hook via call() throws a HookError', () => {
    const bus = createBus(
      defineContract({
        hooks: {
          a: { strategy: 'asyncSeries' },
        },
      }),
    );
    expect(() => bus.call('a', {})).toThrow(HookError);
  });
});

describe('hook validation', () => {
  it('validates hook input against the schema', () => {
    const bus = createBus(
      defineContract({
        hooks: {
          roll: { strategy: 'syncWaterfall', schema: v.object({ total: v.number() }) },
        },
      }),
    );
    bus.tap('roll', 'bonus', (c: { total: number }) => ({ total: c.total + 5 }));
    expect(() => bus.call('roll', { total: 'bad' } as never)).toThrow();
    expect(bus.call('roll', { total: 10 })).toEqual({ total: 15 });
  });
});
