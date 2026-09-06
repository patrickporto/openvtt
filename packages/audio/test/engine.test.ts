import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { FakeHowl, FakeHowler, installHowlerMock } from './helpers/howler-mock';
import { FakeClock } from './helpers/fake-clock';

installHowlerMock();

const { AudioEngine } = await import('../src/engine');
const { defaultClock } = await import('../src/engine');

let engine: InstanceType<typeof AudioEngine> | null = null;

beforeEach(() => {
  FakeHowl.reset();
  FakeHowler.reset();
});

afterEach(() => {
  engine?.destroy();
  engine = null;
});

function makeEngine(): InstanceType<typeof AudioEngine> {
  engine = new AudioEngine({ clock: new FakeClock() });
  return engine;
}

function lastHowl(): FakeHowl {
  return FakeHowl.all[FakeHowl.all.length - 1];
}

describe('AudioEngine register', () => {
  it('cria Howl com as opções do def e aplica master no Howler', () => {
    const e = makeEngine();
    const id = e.register({ src: ['a.mp3', 'a.ogg'], volume: 0.5, loop: true, channel: 'music' });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(FakeHowl.all).toHaveLength(1);
    expect(FakeHowl.all[0].opts).toMatchObject({ src: ['a.mp3', 'a.ogg'], loop: true });
    expect(FakeHowler.calls.volume).toContainEqual([1]);
  });

  it('usa id fornecido e rejeita duplicata', () => {
    const e = makeEngine();
    const id = e.register({ id: '0198c0de-0000-7000-8000-000000000001', src: 'a.mp3' });
    expect(id).toBe('0198c0de-0000-7000-8000-000000000001');
    expect(() => e.register({ id, src: 'b.mp3' })).toThrow();
  });

  it('rejeita def inválido', () => {
    const e = makeEngine();
    expect(() => e.register({ src: 'a.mp3', volume: 3 } as never)).toThrow();
  });
});

describe('transport play/pause/stop', () => {
  it('play processa a fila no flush e emite sound:played', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3', channel: 'music' });
    const played: unknown[] = [];
    e.bus.on('sound:played', (payload) => played.push(payload));

    e.play(id);
    expect(lastHowl().calls.play).toBeUndefined();
    e.flush();

    expect(lastHowl().callCount('play')).toBe(1);
    expect(played).toEqual([{ soundId: id, channel: 'music' }]);
    expect(e.isPlaying(id)).toBe(true);
  });

  it('play consecutivo não duplica instância', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.play(id);
    e.flush();
    e.play(id);
    e.flush();
    expect(lastHowl().callCount('play')).toBe(1);
  });

  it('pause e stop emitem eventos', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    const events: string[] = [];
    e.bus.on('sound:paused', () => events.push('paused'));
    e.bus.on('sound:stopped', () => events.push('stopped'));

    e.play(id);
    e.flush();
    e.pause(id);
    e.flush();
    expect(events).toEqual(['paused']);

    e.play(id);
    e.flush();
    e.stop(id);
    e.flush();
    expect(events).toEqual(['paused', 'stopped']);
  });

  it('dedupe mantém apenas o último comando por som', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.play(id);
    e.stop(id);
    e.flush();
    expect(lastHowl().callCount('play')).toBe(0);
    expect(lastHowl().callCount('stop')).toBe(0);
  });

  it('comando para som desconhecido lança', () => {
    const e = makeEngine();
    expect(() => e.play('nope')).toThrow();
  });

  it('fim natural libera a instância primária', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.play(id);
    e.flush();
    const iid = 1;
    expect(e.isPlaying(id)).toBe(true);
    lastHowl().emits('end', iid);
    expect(e.isPlaying(id)).toBe(false);
  });

  it('stop interrompe todas as instâncias do som, não só a primária', () => {
    const clock = new FakeClock();
    engine = new AudioEngine({ clock });
    const id = engine.register({ src: 'wind.wav', loop: true });
    engine.playOnce(id, { origin: 'timeline:runner:track' });
    engine.play(id);
    engine.flush();
    expect(lastHowl().playingIids.size).toBe(2);
    engine.stop(id);
    engine.flush();
    expect(lastHowl().playing()).toBe(false);
    expect(engine.isPlaying(id)).toBe(false);
  });

  it('play após pause retoma a mesma instância', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.play(id);
    e.flush();
    e.pause(id);
    e.flush();
    e.play(id);
    e.flush();
    expect(lastHowl().calls.play).toEqual([[undefined], [1]]);
    expect(e.isPlaying(id)).toBe(true);
  });
});

describe('hierarquia de volume', () => {
  it('volume efetivo = def × canal (master fica no Howler)', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3', volume: 0.5, channel: 'music' });
    e.mixer.setChannelVolume('music', 0.5);
    e.play(id);
    e.flush();
    expect(lastHowl().calls.volume).toContainEqual([0.25, 1]);
  });

  it('mute/solo de canal re-aplica volumes', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3', volume: 1, channel: 'ambient' });
    e.play(id);
    e.flush();
    e.mixer.setChannelSolo('music', true);
    expect(lastHowl().calls.volume).toContainEqual([0, undefined]);
    e.mixer.setChannelSolo('music', false);
    expect(lastHowl().calls.volume).toContainEqual([1, undefined]);
  });

  it('setMasterVolume passa pelo hook e aplica no Howler', () => {
    const e = makeEngine();
    e.bus.tap('beforeVolume', 'cap', (payload) => {
      if (payload.target === 'master') payload.value = Math.min(payload.value, 0.5);
      return payload;
    });
    const events: unknown[] = [];
    e.bus.on('volume:changed', (payload) => events.push(payload));
    e.setMasterVolume(1);
    expect(FakeHowler.calls.volume).toContainEqual([0.5]);
    expect(events).toEqual([{ target: 'master', value: 0.5 }]);
  });

  it('setVolume aplica e emite evento', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.setVolume(id, 0.3);
    expect(lastHowl().calls.volume).toContainEqual([0.3, undefined]);
  });

  it('setMuted propaga para o howl', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.setMuted(id, true);
    expect(lastHowl().calls.mute).toContainEqual([true]);
  });
});

describe('hook beforePlay', () => {
  it('pode sobrescrever volume do play', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3', volume: 1 });
    e.bus.tap('beforePlay', 'quiet', (payload) => {
      payload.volume = 0.1;
      return payload;
    });
    e.play(id);
    e.flush();
    expect(lastHowl().calls.volume).toContainEqual([0.1, 1]);
  });
});

describe('som espacial', () => {
  it('setPosition e setSpatialAttrs aplicam pos/panner nas instâncias', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.play(id);
    e.flush();
    e.setPosition(id, 3, 0, 4);
    e.setSpatialAttrs(id, { distanceModel: 'linear', refDistance: 1, maxDistance: 8 });
    expect(lastHowl().calls.pos).toContainEqual([3, 0, 4, 1]);
    expect(lastHowl().calls.pannerAttr).toHaveLength(1);
    expect(lastHowl().calls.pannerAttr[0][0]).toMatchObject({ distanceModel: 'linear', maxDistance: 8 });
  });

  it('posição definida antes do play é aplicada ao iniciar', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.setPosition(id, 1, 2, 3);
    e.play(id);
    e.flush();
    expect(lastHowl().calls.pos).toContainEqual([1, 2, 3, 1]);
  });

  it('setListener posiciona o listener global', () => {
    const e = makeEngine();
    e.setListener(5, 0, -2);
    expect(FakeHowler.calls.pos).toContainEqual([5, 0, -2]);
    expect(FakeHowler.calls.orientation).toContainEqual([0, 0, -1, 0, 1, 0]);
  });

  it('ignora chamadas espaciais sem Web Audio', () => {
    FakeHowler.usingWebAudio = false;
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.play(id);
    e.flush();
    e.setPosition(id, 1, 2, 3);
    e.setListener(0, 0, 0);
    expect(lastHowl().calls.pos).toBeUndefined();
    expect(FakeHowler.calls.pos).toHaveLength(0);
  });
});

describe('fade', () => {
  it('delega para o howl e emite fade:ended no callback', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.play(id);
    e.flush();
    const events: unknown[] = [];
    e.bus.on('fade:ended', (payload) => events.push(payload));
    e.fade(id, 1, 0, 500);
    expect(lastHowl().calls.fade).toContainEqual([1, 0, 500, 1]);
    expect(events).toEqual([{ soundId: id, from: 1, to: 0 }]);
  });
});

describe('grupos', () => {
  it('playGroup toca membro aleatório sem repetição imediata', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    const group = e.defineGroup({ members: [a, b] });
    let previous: string | null = null;
    for (let i = 0; i < 20; i++) {
      const pick = e.playGroup(group);
      expect(pick).not.toBeNull();
      expect(pick).not.toBe(previous);
      previous = pick!;
    }
    expect(FakeHowl.all[0].callCount('play') + FakeHowl.all[1].callCount('play')).toBe(20);
  });
});

describe('playOnce', () => {
  it('aplica fadeIn e duração via clock', () => {
    const clock = new FakeClock();
    engine = new AudioEngine({ clock });
    const id = engine.register({ src: 'a.mp3', volume: 1 });
    engine.playOnce(id, { fadeInMs: 50, durationMs: 200, fadeOutMs: 50 });
    const howl = lastHowl();
    expect(howl.calls.fade).toContainEqual([0, 1, 50, 1]);
    clock.tick(199);
    expect(howl.callCount('stop')).toBe(0);
    clock.tick(1);
    expect(howl.callCount('stop')).toBe(1);
  });

  it('seek aplica startOffsetMs', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.playOnce(id, { startOffsetMs: 1500 });
    expect(lastHowl().calls.seek).toContainEqual([1.5, 1]);
  });
});

describe('stopAll/pauseAll/resumeAll/destroy', () => {
  it('crossfadeToTimeline preserva instâncias que não são da timeline', () => {
    const clock = new FakeClock();
    engine = new AudioEngine({ clock });
    const id = engine.register({ src: 'wind.wav', loop: true });
    engine.play(id);
    engine.flush();
    engine.crossfadeToTimeline([{ cues: [{ soundId: id, startMs: 0, durationMs: 8000 }], loop: true }], {
      durationMs: 1800,
    });
    clock.tick(0);
    clock.tick(5000);
    expect(engine.isPlaying(id)).toBe(true);
  });

  it('crossfadeToTimeline encerra as instâncias da timeline anterior', () => {
    const clock = new FakeClock();
    engine = new AudioEngine({ clock });
    const id = engine.register({ src: 'wind.wav', loop: true });
    engine.startTimeline([{ cues: [{ soundId: id, startMs: 0, durationMs: 8000 }], loop: true }]);
    clock.tick(0);
    const firstIid = 1;
    expect(lastHowl().playingIids.has(firstIid)).toBe(true);
    engine.crossfadeToTimeline([{ cues: [{ soundId: id, startMs: 0, durationMs: 8000 }], loop: true }], {
      durationMs: 1800,
    });
    clock.tick(0);
    expect(lastHowl().playingIids.size).toBe(2);
    clock.tick(2000);
    expect(lastHowl().playingIids.has(firstIid)).toBe(false);
    expect(lastHowl().playingIids.size).toBe(1);
  });

  it('stopAll interrompe tudo', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    e.play(a);
    e.play(b);
    e.flush();
    e.stopAll();
    expect(e.isPlaying(a)).toBe(false);
    expect(e.isPlaying(b)).toBe(false);
  });

  it('pauseAll/resumeAll pausam e retomam instâncias', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    e.play(a);
    e.flush();
    e.pauseAll();
    expect(lastHowl().calls.pause).toContainEqual([1]);
    e.resumeAll();
    expect(lastHowl().calls.play).toContainEqual([1]);
  });

  it('unregister com agendamento pendente não lança no timer', () => {
    const clock = new FakeClock();
    engine = new AudioEngine({ clock });
    const id = engine.register({ src: 'a.mp3' });
    engine.playScheduled(id, { delayMs: 100 });
    engine.unregister(id);
    expect(() => clock.tick(200)).not.toThrow();
    expect(FakeHowl.all[0].callCount('play')).toBe(0);
  });

  it('destroy descarrega howls e destrói o bus', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    e.destroy();
    expect(FakeHowl.all[0].unloaded).toBe(true);
    expect(e.bus.isDestroyed).toBe(true);
  });

  it('defaultClock usa timers globais', () => {
    expect(typeof defaultClock.now()).toBe('number');
  });
});
