import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { FakeHowl, FakeHowler, installHowlerMock } from './helpers/howler-mock';
import { FakeClock } from './helpers/fake-clock';

installHowlerMock();

const { AudioEngine } = await import('../src/engine');

let clock: FakeClock;
let engine: InstanceType<typeof AudioEngine> | null = null;

beforeEach(() => {
  FakeHowl.reset();
  FakeHowler.reset();
  clock = new FakeClock();
});

afterEach(() => {
  engine?.destroy();
  engine = null;
});

function makeEngine(): InstanceType<typeof AudioEngine> {
  engine = new AudioEngine({ clock });
  return engine;
}

function howlFor(index: number): FakeHowl {
  return FakeHowl.all[index];
}

describe('playScheduled', () => {
  it('dispara no delay e para ao fim da duração', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.playScheduled(id, { delayMs: 100, durationMs: 200 });
    clock.tick(99);
    expect(howlFor(0).callCount('play')).toBe(0);
    clock.tick(1);
    expect(howlFor(0).callCount('play')).toBe(1);
    clock.tick(199);
    expect(howlFor(0).callCount('stop')).toBe(0);
    clock.tick(1);
    expect(howlFor(0).callCount('stop')).toBe(1);
  });

  it('cancel impede o disparo', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    const handle = e.playScheduled(id, { delayMs: 50 });
    handle.cancel();
    clock.tick(100);
    expect(howlFor(0).callCount('play')).toBe(0);
  });

  it('seek recebe startOffsetMs convertido para segundos', () => {
    const e = makeEngine();
    const id = e.register({ src: 'a.mp3' });
    e.playScheduled(id, { delayMs: 10, startOffsetMs: 2000 });
    clock.tick(10);
    expect(howlFor(0).calls.seek).toContainEqual([2, 1]);
  });
});

describe('startTimeline', () => {
  it('agenda cues nos tempos corretos', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    e.startTimeline([{ cues: [{ soundId: a, startMs: 0 }, { soundId: b, startMs: 100, durationMs: 50 }] }]);
    clock.tick(0);
    expect(howlFor(0).callCount('play')).toBe(1);
    clock.tick(100);
    expect(howlFor(1).callCount('play')).toBe(1);
    clock.tick(50);
    expect(howlFor(1).callCount('stop')).toBe(1);
  });

  it('emite timeline:started/ended no bus', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const events: string[] = [];
    e.bus.on('timeline:started', ({ loop }) => events.push(`started:${loop}`));
    e.bus.on('timeline:ended', ({ loop }) => events.push(`ended:${loop}`));
    e.startTimeline([{ cues: [{ soundId: a, startMs: 0, durationMs: 100 }] }]);
    clock.tick(100);
    expect(events).toEqual(['started:false', 'ended:false']);
    expect(e.activeTimeline).toBeNull();
  });

  it('stop cancela cues pendentes e interrompe instâncias', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    const handle = e.startTimeline([
      { cues: [{ soundId: a, startMs: 0 }, { soundId: b, startMs: 500, durationMs: 100 }] },
    ]);
    clock.tick(0);
    handle.stop();
    clock.tick(1000);
    expect(howlFor(0).callCount('play')).toBe(1);
    expect(howlFor(1).callCount('play')).toBe(0);
    expect(howlFor(0).callCount('stop')).toBe(1);
    expect(e.activeTimeline).toBeNull();
  });

  it('track em loop replays ao fim da janela', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    e.startTimeline([{ cues: [{ soundId: a, startMs: 0, durationMs: 100 }], loop: true }]);
    clock.tick(0);
    clock.tick(100);
    expect(howlFor(0).callCount('play')).toBe(2);
    clock.tick(100);
    expect(howlFor(0).callCount('play')).toBe(3);
  });

  it('timeline loop reinicia tudo ao fim', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    e.startTimeline([{ cues: [{ soundId: a, startMs: 0, durationMs: 100 }] }], { loop: true });
    clock.tick(0);
    clock.tick(100);
    expect(howlFor(0).callCount('play')).toBe(2);
    expect(e.activeTimeline).not.toBeNull();
  });

  it('pausa interrompe instâncias e resume recria com offset + reagenda pendentes', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    const handle = e.startTimeline([
      { cues: [{ soundId: a, startMs: 0, durationMs: 5000 }, { soundId: b, startMs: 500 }] },
    ]);
    clock.tick(0);
    clock.tick(200);
    handle.pause();
    expect(howlFor(0).calls.stop).toContainEqual([1]);
    clock.tick(300);
    expect(howlFor(1).callCount('play')).toBe(0);

    handle.resume();
    expect(howlFor(0).callCount('play')).toBe(2);
    expect(howlFor(0).calls.seek).toContainEqual([0.2, 2]);
    clock.tick(300);
    expect(howlFor(1).callCount('play')).toBe(1);
  });

  it('resume não recria cue já concluído antes da pausa', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    const handle = e.startTimeline([
      { cues: [{ soundId: a, startMs: 0, durationMs: 100 }, { soundId: b, startMs: 600, durationMs: 100 }] },
    ]);
    clock.tick(0);
    clock.tick(300);
    handle.pause();
    handle.resume();
    clock.tick(300);
    expect(howlFor(0).callCount('play')).toBe(1);
    expect(howlFor(1).callCount('play')).toBe(1);
  });
});

describe('crossfadeToTimeline', () => {
  it('faz fade-out das instâncias da timeline anterior e fade-in do novo', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    e.startTimeline([{ cues: [{ soundId: a, startMs: 0, durationMs: 5000 }] }]);
    clock.tick(0);
    e.crossfadeToTimeline([{ cues: [{ soundId: b, startMs: 0, durationMs: 500 }] }], { durationMs: 400 });

    const oldHowl = howlFor(0);
    expect(oldHowl.calls.fade).toContainEqual([1, 0, 400, 1]);
    clock.tick(400);
    expect(oldHowl.callCount('stop')).toBe(1);
    expect(howlFor(1).calls.fade).toContainEqual([0, 1, 400, 2]);
    expect(e.activeTimeline).not.toBeNull();
  });

  it('cancela agendamentos pendentes do estado anterior', () => {
    const e = makeEngine();
    const a = e.register({ src: 'a.mp3' });
    const b = e.register({ src: 'b.mp3' });
    e.playScheduled(a, { delayMs: 1000 });
    e.crossfadeToTimeline([{ cues: [{ soundId: b, startMs: 0 }] }], { durationMs: 100 });
    clock.tick(2000);
    expect(howlFor(0).callCount('play')).toBe(0);
  });
});

describe('validações', () => {
  it('rejeita track sem cues e cue com startMs negativo', () => {
    const e = makeEngine();
    expect(() => e.startTimeline([{ cues: [] }])).toThrow();
    expect(() =>
      e.startTimeline([{ cues: [{ soundId: 'x', startMs: -5 }] }]),
    ).toThrow();
  });
});
