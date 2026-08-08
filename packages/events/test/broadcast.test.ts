import { describe, expect, it } from 'bun:test';
import { createBus } from '../src';

describe('broadcast (BroadcastChannel)', () => {
  it('delivers emits across two buses on the same channel', async () => {
    const channel = `bc-test-${Math.random().toString(36).slice(2)}`;

    const busA = createBus(undefined, { broadcast: { channel } });
    const busB = createBus(undefined, { broadcast: { channel } });

    const received: unknown[] = [];
    busB.on('shout' as never, (payload) => received.push(payload));

    busA.emit('shout' as never, { hello: 'world' });

    await new Promise((resolve) => setTimeout(resolve, 50));

    busA.destroy();
    busB.destroy();

    expect(received).toEqual([{ hello: 'world' }]);
  });

  it('does not re-broadcast received messages (no cross-tab echo)', async () => {
    const channel = `bc-loop-${Math.random().toString(36).slice(2)}`;
    const busA = createBus(undefined, { broadcast: { channel } });
    const busB = createBus(undefined, { broadcast: { channel } });

    let aDeliveries = 0;
    let bDeliveries = 0;
    busA.on('ping' as never, () => aDeliveries++);
    busB.on('ping' as never, () => bDeliveries++);

    busA.emit('ping' as never);
    await new Promise((resolve) => setTimeout(resolve, 80));

    busA.destroy();
    busB.destroy();

    expect(aDeliveries).toBe(1);
    expect(bDeliveries).toBe(1);
  });
});
