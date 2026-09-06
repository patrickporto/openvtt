import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { FakeHowler, installHowlerMock } from '../../audio/test/helpers/howler-mock';

installHowlerMock();

const { AudioEngine } = await import('@openvtt/audio');
const { ListenerController, gridMapper } = await import('../src/listener');

import type { PluginContext } from '@openvtt/canvas';

let engine: InstanceType<typeof AudioEngine>;

beforeEach(() => {
  FakeHowler.reset();
  engine = new AudioEngine();
});

afterEach(() => {
  engine.destroy();
});

function makeCtx(overrides: Record<string, unknown> = {}): PluginContext {
  return {
    canvas: {
      documents: {
        layer: (type: string) =>
          type === 'token'
            ? { get: (id: string) => (id === 'tok-1' ? { x: 10, y: 20 } : undefined) }
            : undefined,
      },
      grid: { size: 50 },
      viewport: {
        state: { screenWidth: 1000, screenHeight: 800 },
        scale: 1,
        toLocal: (p: { x: number; y: number }) => ({ x: p.x + 100, y: p.y + 50 }),
      },
    },
    ...overrides,
  } as unknown as PluginContext;
}

describe('gridMapper', () => {
  it('converte pixels do mundo para células de grid no plano xz', () => {
    expect(gridMapper({ x: 250, y: -100, gridSize: 50, scale: 1 })).toEqual({ x: 5, y: 0, z: -2 });
  });
});

describe('ListenerController', () => {
  it('modo câmera usa o centro da viewport em coordenadas de mundo', () => {
    const controller = new ListenerController();
    expect(controller.mode).toBe('camera');
    expect(controller.position(makeCtx())).toEqual({ x: 600, y: 450 });
  });

  it('modo token segue o placeable', () => {
    const controller = new ListenerController();
    controller.followToken('tok-1');
    expect(controller.mode).toBe('token');
    expect(controller.position(makeCtx())).toEqual({ x: 10, y: 20 });
  });

  it('token ausente retorna null', () => {
    const controller = new ListenerController();
    controller.followToken('tok-x');
    expect(controller.position(makeCtx())).toBeNull();
  });

  it('setMode camera limpa o token seguido', () => {
    const controller = new ListenerController();
    controller.followToken('tok-1');
    controller.setMode('camera');
    expect(controller.tokenId).toBeNull();
    expect(controller.position(makeCtx())).toEqual({ x: 600, y: 450 });
  });

  it('apply posiciona o listener no engine com o mapper', () => {
    const controller = new ListenerController();
    controller.apply(makeCtx(), engine);
    expect(FakeHowler.calls.pos).toContainEqual([12, 0, 9]);
    expect(FakeHowler.calls.orientation).toContainEqual([0, 0, -1, 0, 1, 0]);
  });

  it('mapper customizado é respeitado', () => {
    const controller = new ListenerController();
    controller.mapper = ({ x, y }) => ({ x: x / 100, y: 1, z: y / 100 });
    controller.apply(makeCtx(), engine);
    expect(FakeHowler.calls.pos).toContainEqual([6, 1, 4.5]);
  });
});
