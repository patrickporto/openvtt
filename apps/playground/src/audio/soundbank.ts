import type { TimelineTrackInput } from '@openvtt/audio';

const SAMPLE_RATE = 22050;

export interface LoopSpec {
  key: string;
  label: string;
  channel: string;
  seconds: number;
  volume: number;
  loopFadeSeconds?: number;
  build: (ctx: OfflineAudioContext, seconds: number) => void;
}

export interface PadSpec {
  key: string;
  label: string;
  channel: string;
  srcs: string[];
}

export interface MoodSpec {
  key: string;
  label: string;
  desc: string;
}

export interface SoundIds {
  loops: Map<string, string>;
  padMembers: Map<string, string[]>;
}

function assetPath(relative: string): string {
  return `${import.meta.env.BASE_URL}${relative}`;
}

function diceHits(kind: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => assetPath(`sounds/dicehit/dicehit_${kind}${i + 1}.mp3`));
}

function surfaces(kind: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => assetPath(`sounds/surfaces/surface_${kind}${i + 1}.mp3`));
}

export const PADS: PadSpec[] = [
  { key: 'dice-wood', label: 'Dice on wood', channel: 'effects', srcs: diceHits('wood', 12) },
  { key: 'dice-metal', label: 'Dice on metal', channel: 'effects', srcs: diceHits('metal', 12) },
  { key: 'dice-plastic', label: 'Dice on plastic', channel: 'effects', srcs: diceHits('plastic', 15) },
  { key: 'coins', label: 'Coins', channel: 'effects', srcs: diceHits('coin', 6) },
  { key: 'swords', label: 'Sword hits', channel: 'effects', srcs: surfaces('metal', 9) },
  { key: 'table', label: 'Table knocks', channel: 'effects', srcs: surfaces('wood_table', 7) },
  { key: 'tray', label: 'Tray thuds', channel: 'effects', srcs: surfaces('wood_tray', 7) },
  { key: 'felt', label: 'Felt taps', channel: 'effects', srcs: surfaces('felt', 7) },
];

function noiseBuffer(ctx: OfflineAudioContext, seconds: number, brown: boolean): AudioBuffer {
  const length = Math.floor(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white * 0.6;
    }
  }
  return buffer;
}

interface LayerOptions {
  brown?: boolean;
  filterType?: BiquadFilterType;
  frequency?: number;
  q?: number;
  gain?: number;
  modulations?: { target: 'filter' | 'gain'; cycles: number; depth: number }[];
}

function addNoiseLayer(ctx: OfflineAudioContext, seconds: number, options: LayerOptions): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, seconds, options.brown ?? false);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = options.filterType ?? 'lowpass';
  filter.frequency.value = options.frequency ?? 500;
  filter.Q.value = options.q ?? 0.8;
  const gain = ctx.createGain();
  gain.gain.value = options.gain ?? 0.5;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  for (const mod of options.modulations ?? []) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = mod.cycles / seconds;
    const amount = ctx.createGain();
    amount.gain.value = mod.depth;
    lfo.connect(amount);
    if (mod.target === 'filter') amount.connect(filter.frequency);
    else amount.connect(gain.gain);
    lfo.start();
  }
  source.start();
}

function addDroneLayer(ctx: OfflineAudioContext, seconds: number): void {
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  filter.connect(gain);
  gain.connect(ctx.destination);
  for (const [freq, level] of [
    [55, 0.5],
    [82.5, 0.24],
    [110, 0.14],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const oscGain = ctx.createGain();
    oscGain.gain.value = level;
    osc.connect(oscGain);
    oscGain.connect(filter);
    osc.start();
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / seconds;
  const amount = ctx.createGain();
  amount.gain.value = 0.08;
  lfo.connect(amount);
  amount.connect(gain.gain);
  lfo.start();
}

function addCrackles(ctx: OfflineAudioContext, seconds: number, count: number): void {
  const length = Math.floor(0.09 * ctx.sampleRate);
  for (let i = 0; i < count; i++) {
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const decay = 30 + Math.random() * 120;
    for (let j = 0; j < length; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.exp((-decay * j) / ctx.sampleRate);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + Math.random() * 2400;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.15 + Math.random() * 0.3;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(Math.random() * seconds);
  }
}

function addKick(ctx: OfflineAudioContext, time: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.26);
}

function addTom(ctx: OfflineAudioContext, time: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(190, time);
  osc.frequency.exponentialRampToValueAtTime(70, time + 0.09);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.22);
}

function addHat(ctx: OfflineAudioContext, time: number, level: number): void {
  const length = Math.floor(0.05 * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-220 * i) / ctx.sampleRate);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.value = level;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(time);
}

function addDrumPattern(ctx: OfflineAudioContext): void {
  const kicks = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 2.75, 3.0, 3.5];
  for (const time of kicks) addKick(ctx, time);
  for (const time of [1.75, 3.75]) addTom(ctx, time);
  for (let t = 0; t < 4; t += 0.25) addHat(ctx, t, t % 0.5 === 0.25 ? 0.16 : 0.09);
}

export const LOOPS: LoopSpec[] = [
  {
    key: 'wind',
    label: 'Cold wind',
    channel: 'ambient',
    seconds: 8,
    volume: 0.7,
    build: (ctx, seconds) =>
      addNoiseLayer(ctx, seconds, {
        brown: true,
        frequency: 420,
        gain: 0.5,
        modulations: [
          { target: 'filter', cycles: 2, depth: 220 },
          { target: 'gain', cycles: 3, depth: 0.16 },
        ],
      }),
  },
  {
    key: 'murmur',
    label: 'Crowd murmur',
    channel: 'ambient',
    seconds: 8,
    volume: 0.75,
    build: (ctx, seconds) => {
      addNoiseLayer(ctx, seconds, { brown: true, frequency: 280, gain: 0.4 });
      addNoiseLayer(ctx, seconds, {
        filterType: 'bandpass',
        frequency: 750,
        q: 1.6,
        gain: 0.16,
        modulations: [
          { target: 'gain', cycles: 3, depth: 0.09 },
          { target: 'gain', cycles: 5, depth: 0.06 },
          { target: 'filter', cycles: 2, depth: 160 },
        ],
      });
    },
  },
  {
    key: 'fire',
    label: 'Hearth fire',
    channel: 'ambient',
    seconds: 6,
    volume: 0.65,
    loopFadeSeconds: 0.15,
    build: (ctx, seconds) => {
      addNoiseLayer(ctx, seconds, { filterType: 'highpass', frequency: 1400, gain: 0.05 });
      addNoiseLayer(ctx, seconds, { brown: true, frequency: 200, gain: 0.2 });
      addCrackles(ctx, seconds, 34);
    },
  },
  {
    key: 'drone',
    label: 'Deep drone',
    channel: 'ambient',
    seconds: 8,
    volume: 0.8,
    build: (ctx, seconds) => addDroneLayer(ctx, seconds),
  },
  {
    key: 'drums',
    label: 'War drums',
    channel: 'music',
    seconds: 4,
    volume: 0.9,
    loopFadeSeconds: 0.04,
    build: (ctx) => addDrumPattern(ctx),
  },
];

function smoothLoop(buffer: AudioBuffer, fadeSeconds = 0.3): void {
  const data = buffer.getChannelData(0);
  const n = Math.min(Math.floor(fadeSeconds * buffer.sampleRate), Math.floor(data.length / 2));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const tail = data.length - n + i;
    data[tail] = data[tail] * (1 - t) + data[i] * t;
  }
}

function encodeWavUri(buffer: AudioBuffer): string {
  const samples = buffer.getChannelData(0);
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export async function renderLoopUri(spec: LoopSpec): Promise<string> {
  const ctx = new OfflineAudioContext(1, Math.ceil(spec.seconds * SAMPLE_RATE), SAMPLE_RATE);
  spec.build(ctx, spec.seconds);
  const rendered = await ctx.startRendering();
  smoothLoop(rendered, spec.loopFadeSeconds ?? 0.3);
  return encodeWavUri(rendered);
}

export const MOODS: MoodSpec[] = [
  { key: 'tavern', label: 'Tavern', desc: 'crowd murmur · hearth · dice games' },
  { key: 'dungeon', label: 'Dungeon', desc: 'deep drone · cold wind · chains' },
  { key: 'battle', label: 'Battle', desc: 'war drums · clashing steel' },
  { key: 'forest', label: 'Forest', desc: 'wind in the leaves · woodpecker' },
];

const MOOD_LENGTH_MS = 8000;

interface AccentCue {
  soundId: string;
  startMs: number;
  durationMs: number;
  fadeInMs: number;
}

function accentCue(soundId: string, startMs: number, durationMs: number): AccentCue {
  return { soundId, startMs, durationMs, fadeInMs: 0 };
}

function loopCue(soundId: string, fadeMs: number): { soundId: string; startMs: number; durationMs: number; fadeInMs: number; fadeOutMs: number } {
  return { soundId, startMs: 0, durationMs: MOOD_LENGTH_MS, fadeInMs: fadeMs, fadeOutMs: fadeMs };
}

export function moodTracks(key: string, ids: SoundIds): TimelineTrackInput[] | null {
  const loop = (loopKey: string): string | null => ids.loops.get(loopKey) ?? null;
  const member = (padKey: string, index: number): string | null => ids.padMembers.get(padKey)?.[index] ?? null;
  if (key === 'tavern') {
    const murmur = loop('murmur');
    const fire = loop('fire');
    const dice = member('dice-wood', 3);
    const coins = member('coins', 1);
    const knock = member('table', 2);
    if (!murmur || !fire || !dice || !coins || !knock) return null;
    return [
      { cues: [loopCue(murmur, 900), loopCue(fire, 600)], loop: true },
      {
        cues: [
          accentCue(dice, 2200, 1200),
          accentCue(coins, 5100, 1350),
          accentCue(knock, 6450, MOOD_LENGTH_MS - 6450),
        ],
        loop: true,
      },
    ];
  }
  if (key === 'dungeon') {
    const drone = loop('drone');
    const wind = loop('wind');
    const chainA = member('swords', 5);
    const chainB = member('swords', 7);
    if (!drone || !wind || !chainA || !chainB) return null;
    return [
      { cues: [loopCue(drone, 1200), loopCue(wind, 1200)], loop: true },
      {
        cues: [accentCue(chainA, 3300, 1200), accentCue(chainB, 7050, MOOD_LENGTH_MS - 7050)],
        loop: true,
      },
    ];
  }
  if (key === 'battle') {
    const drums = loop('drums');
    const wind = loop('wind');
    const swords = ids.padMembers.get('swords');
    if (!drums || !wind || !swords || swords.length < 5) return null;
    return [
      { cues: [loopCue(drums, 500), loopCue(wind, 1500)], loop: true },
      {
        cues: [
          accentCue(swords[0], 1000, 1100),
          accentCue(swords[2], 2350, 1100),
          accentCue(swords[4], 4700, 1100),
          accentCue(swords[1], 5820, 1050),
          accentCue(swords[3], 6900, MOOD_LENGTH_MS - 6900),
        ],
        loop: true,
      },
    ];
  }
  if (key === 'forest') {
    const wind = loop('wind');
    const knocks = ids.padMembers.get('tray');
    const rustle = member('felt', 2);
    if (!wind || !knocks || knocks.length < 3 || !rustle) return null;
    return [
      { cues: [loopCue(wind, 1000)], loop: true },
      {
        cues: [
          accentCue(knocks[0], 2000, 900),
          accentCue(knocks[1], 2160, 900),
          accentCue(knocks[2], 2320, 900),
          accentCue(rustle, 4600, MOOD_LENGTH_MS - 4600),
        ],
        loop: true,
      },
    ];
  }
  return null;
}
