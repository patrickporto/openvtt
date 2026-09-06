import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { FakeHowl, FakeHowler, installHowlerMock } from '../../audio/test/helpers/howler-mock';

installHowlerMock();

const { AudioPlugin } = await import('../src/plugin');
const { soundsBus } = await import('../src/bus');
const { gridMapper } = await import('../src/listener');

import type { Canvas } from '@openvtt/canvas';
import { dynamicBus, PlaceableObject, definePlugin } from '@openvtt/canvas';
import * as v from 'valibot';
import type { SoundData } from '../src/schemas';

let CanvasCtor: typeof Canvas;
let canvas: Canvas;
let plugin: AudioPlugin;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
});

beforeEach(async () => {
  FakeHowl.reset();
  FakeHowler.reset();
  canvas?.destroy();
  canvas = new CanvasCtor({} as HTMLElement);
  plugin = new AudioPlugin();
  await canvas.use(plugin);
});

afterAll(() => {
  canvas?.destroy();
});

async function createSound(overrides: Partial<SoundData> = {}): Promise<SoundData & { id: string }> {
  const obj = await canvas.documents.create<SoundData, Partial<SoundData>>('sound', {
    x: 100,
    y: 200,
    src: 'thunder.mp3',
    ...overrides,
  });
  return { ...obj.document, id: obj.id } as SoundData & { id: string };
}

describe('AudioPlugin install', () => {
  it('registra documento, tool e hook sound:sources', () => {
    expect(canvas.bus.hasHook('sound:sources')).toBe(true);
    expect(canvas.bus.hasEvent('sound:create')).toBe(true);
    expect(canvas.documents.types()).toContain('sound');
    expect(canvas.documents.layer('sound')).toBeDefined();
  });

  it('expõe o controller via plugins.get', () => {
    expect(canvas.plugins.get<AudioPlugin>('audio')).toBe(plugin);
  });
});

describe('documentos de som', () => {
  it('create registra no engine e dá play', async () => {
    const doc = await createSound();
    expect(plugin.engine.has(doc.id)).toBe(true);
    expect(FakeHowl.all).toHaveLength(1);
    expect(FakeHowl.all[0].opts.src).toBe('thunder.mp3');
    expect(plugin.engine.isPlaying(doc.id)).toBe(true);
  });

  it('playing false não toca; update para true toca', async () => {
    const doc = await createSound({ playing: false });
    expect(plugin.engine.isPlaying(doc.id)).toBe(false);
    await canvas.documents.update('sound', doc.id, { playing: true });
    expect(plugin.engine.isPlaying(doc.id)).toBe(true);
  });

  it('update playing false interrompe', async () => {
    const doc = await createSound();
    await canvas.documents.update('sound', doc.id, { playing: false });
    expect(plugin.engine.isPlaying(doc.id)).toBe(false);
  });

  it('update volume propaga para o engine', async () => {
    const doc = await createSound({ volume: 1 });
    await canvas.documents.update('sound', doc.id, { volume: 0.5 });
    const howl = FakeHowl.all[0];
    expect(howl.calls.volume).toContainEqual([0.5, undefined]);
  });

  it('som one-shot não reinicia após o fim natural', async () => {
    await createSound({ loop: false });
    const howl = FakeHowl.all[0];
    expect(howl.callCount('play')).toBe(1);
    howl.emits('end', 1);
    plugin.syncNow();
    expect(howl.callCount('play')).toBe(1);
  });

  it('delete libera o som do engine', async () => {
    const doc = await createSound();
    await canvas.documents.delete('sound', doc.id);
    expect(plugin.engine.has(doc.id)).toBe(false);
  });

  it('mudança de src re-registra o som', async () => {
    const doc = await createSound();
    const firstHowl = FakeHowl.all[0];
    await canvas.documents.update('sound', doc.id, { src: 'rain.mp3' });
    expect(plugin.engine.has(doc.id)).toBe(true);
    expect(firstHowl.unloaded).toBe(true);
    expect(FakeHowl.all[FakeHowl.all.length - 1].opts.src).toBe('rain.mp3');
  });
});

describe('posicionamento espacial', () => {
  it('syncNow mapeia posição e listener para unidades de grid', async () => {
    const doc = await createSound({ x: 250, y: 100 });
    plugin.syncNow();
    const howl = FakeHowl.all[0];
    expect(howl.calls.pos).toContainEqual([5, 0, 2, 1]);
    expect(howl.calls.pannerAttr).toHaveLength(1);
    expect(howl.calls.pannerAttr[0][0]).toMatchObject({ distanceModel: 'linear', maxDistance: 4 });

    await canvas.documents.update('sound', doc.id, { radius: 8 });
    expect(howl.calls.pannerAttr).toHaveLength(2);
    expect(howl.calls.pannerAttr[1][0]).toMatchObject({ maxDistance: 8 });
  });

  it('som global não recebe posição', async () => {
    await createSound({ global: true });
    plugin.syncNow();
    expect(FakeHowl.all[0].calls.pos).toBeUndefined();
  });

  it('attachToToken sobrepõe a posição do documento', async () => {
    class TokenStub extends PlaceableObject<{ id?: string; x: number; y: number }> {
      readonly objectType = 'token';
      get bounds() {
        return { x: -10, y: -10, width: 20, height: 20 };
      }
      refresh(): void {}
      protected loadAssets(): Promise<void> {
        return Promise.resolve();
      }
    }
    await canvas.use(
      definePlugin({
        id: 'token-stub',
        install(ctx) {
          ctx.registerDocumentType({
            type: 'token',
            schema: v.object({ id: v.optional(v.string()), x: v.number(), y: v.number() }),
            placeable: TokenStub,
            layer: { label: 'Tokens' },
          });
        },
      }),
    );
    const token = await canvas.documents.create('token', { x: 10, y: 20 });

    const doc = await createSound({ x: 250, y: 100 });
    plugin.attachToToken(doc.id, token.id);
    plugin.syncNow();
    expect(FakeHowl.all[0].calls.pos).toContainEqual([0.2, 0, 0.4, 1]);
    plugin.detachFromToken(doc.id);
  });
});

describe('hook sound:sources', () => {
  it('inclui os placeables na agregação', async () => {
    const doc = await createSound({ radius: 6 });
    const payload = soundsBus(canvas.bus).callSoundSources({ sources: [] });
    expect(payload.sources).toHaveLength(1);
    expect(payload.sources[0]).toMatchObject({
      key: doc.id,
      x: 100,
      y: 200,
      radius: 6,
      src: 'thunder.mp3',
      playing: true,
    });
  });

  it('fontes externas são registradas e liberadas pelo ciclo de sync', async () => {
    const port = soundsBus(canvas.bus);
    let external = true;
    port.tapSoundSources('test', (payload) => {
      if (external) payload.sources.push({ key: 'ext-1', x: 0, y: 0, src: 'ext.mp3', radius: 2 });
      return payload;
    });
    plugin.syncNow();
    expect(plugin.engine.list()).toHaveLength(1);
    expect(FakeHowl.all.some((howl) => howl.opts.src === 'ext.mp3')).toBe(true);
    external = false;
    plugin.syncNow();
    expect(plugin.engine.list()).toHaveLength(0);
  });
});

describe('listener', () => {
  it('setListenerMode token sem tokens instalados mantém engine íntegro', async () => {
    await createSound();
    plugin.setListenerMode('token');
    plugin.followToken('tok-404');
    plugin.syncNow();
    expect(plugin.engine.list()).toHaveLength(1);
    plugin.setListenerMode('camera');
  });
});

describe('ciclo de vida', () => {
  it('scene:teardown libera todos os sons', async () => {
    await createSound();
    await createSound({ src: 'rain.mp3' });
    expect(plugin.engine.list()).toHaveLength(2);
    canvas.bus.call('scene:teardown', {});
    expect(plugin.engine.list()).toHaveLength(0);
  });

  it('uninstall libera sons e remove o controller', async () => {
    await createSound();
    await canvas.plugins.unuse('audio');
    expect(plugin.engine.list()).toHaveLength(0);
    expect(canvas.plugins.get<AudioPlugin>('audio')).toBeUndefined();
  });
});

describe('gridMapper reexport', () => {
  it('é o mapper padrão em células', () => {
    expect(gridMapper({ x: 100, y: 50, gridSize: 50, scale: 1 })).toEqual({ x: 2, y: 0, z: 1 });
  });
});
