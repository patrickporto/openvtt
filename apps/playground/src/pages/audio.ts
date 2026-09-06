import { v7 } from 'uuid';
import { AudioEngine, DEFAULT_CHANNELS } from '@openvtt/audio';
import { hotkeys } from '../hotkeys';
import { LOOPS, MOODS, PADS, moodTracks, renderLoopUri, type SoundIds } from '../audio/soundbank';

const CHANNEL_LABELS: Record<string, string> = {
  music: 'Music',
  ambient: 'Ambient',
  effects: 'Effects',
  voice: 'Voice',
};

const ICON_PLAY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5-13-7.5Z"/></svg>`;
const ICON_STOP = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;

export function renderAudio(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="stage audio-stage">
      <div class="audio-grid">
        <section class="panel audio-pane moods-pane">
          <header>Moods <span class="pkg">timeline crossfade</span></header>
          <div class="mood-list" id="moods"></div>
        </section>
        <section class="panel audio-pane pads-pane">
          <header>One-shots <span class="pkg">random groups · no repeats</span></header>
          <div class="pad-grid" id="pads"></div>
        </section>
        <section class="panel audio-pane elements-pane">
          <header>Elements <span class="pkg">ambient loops</span></header>
          <div class="el-list" id="elements"></div>
        </section>
        <section class="panel audio-pane mixer-pane">
          <header>Mixer <span class="pkg">channels</span></header>
          <div class="mix-list" id="mixer"></div>
          <div class="mix-master" id="master"></div>
          <div class="mix-actions">
            <button class="btn ghost" id="stop-all">Stop all</button>
          </div>
        </section>
        <section class="panel audio-pane log-pane">
          <header>Event bus <button class="log-clear" id="clear-log">clear</button></header>
          <div class="log-body" id="log"></div>
        </section>
      </div>
      <div class="audio-lock" id="lock">
        <div class="audio-lock-card">
          <h2>Audio Lab</h2>
          <p>browsers need a gesture before sound can play</p>
          <button class="btn" id="enable">Enable audio</button>
        </div>
      </div>
    </div>
    <div class="overlay page-title">
      <h1>Audio Lab</h1>
      <p>@openvtt/audio · soundboard</p>
    </div>
    <div class="overlay dice-status pill audio-status" id="status" data-state="busy">
      <span class="dot"></span><span id="status-text">rendering loops…</span>
    </div>
  `;

  const engine = new AudioEngine();
  const ids: SoundIds = { loops: new Map(), padMembers: new Map() };
  const groupByPad = new Map<string, string>();
  const names = new Map<string, string>();
  const playingLoops = new Set<string>();
  let activeMood: string | null = null;
  let disposed = false;
  let renderFailed = false;
  let lockTimer: ReturnType<typeof setTimeout> | null = null;

  const status = root.querySelector<HTMLDivElement>('#status')!;
  const statusText = root.querySelector<HTMLSpanElement>('#status-text')!;
  const logBody = root.querySelector<HTMLDivElement>('#log')!;
  const moodsEl = root.querySelector<HTMLDivElement>('#moods')!;
  const padsEl = root.querySelector<HTMLDivElement>('#pads')!;
  const elementsEl = root.querySelector<HTMLDivElement>('#elements')!;
  const mixerEl = root.querySelector<HTMLDivElement>('#mixer')!;
  const masterEl = root.querySelector<HTMLDivElement>('#master')!;
  const lockEl = root.querySelector<HTMLDivElement>('#lock')!;

  function setStatus(state: 'ready' | 'busy' | 'error', text: string): void {
    status.dataset.state = state;
    statusText.textContent = text;
  }

  function log(kind: string, detail: string): void {
    const line = document.createElement('div');
    const time = document.createElement('span');
    time.className = 't';
    time.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const name = document.createElement('span');
    name.className = 'k';
    name.textContent = kind;
    line.append(time, name, document.createTextNode(` ${detail}`));
    logBody.append(line);
    while (logBody.childElementCount > 120) logBody.firstElementChild?.remove();
    logBody.scrollTop = logBody.scrollHeight;
  }

  const offBus = engine.bus.onAny((name, payload) => {
    const data = payload as Record<string, unknown>;
    const friendly = typeof data.soundId === 'string' ? names.get(data.soundId) ?? data.soundId.slice(0, 8) : '';
    const rest = Object.entries(data)
      .filter(([key]) => key !== 'soundId')
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
    log(name, [friendly, rest].filter(Boolean).join(' · '));
  });

  for (const pad of PADS) {
    const memberIds = pad.srcs.map((src, index) => {
      const id = v7();
      engine.register({ id, src, channel: pad.channel, preload: false });
      names.set(id, `${pad.label} #${index + 1}`);
      return id;
    });
    ids.padMembers.set(pad.key, memberIds);
    groupByPad.set(pad.key, engine.defineGroup({ members: memberIds }));
  }

  padsEl.innerHTML = PADS.map((pad) => `<button class="pad" data-pad="${pad.key}">${pad.label}</button>`).join('');
  padsEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-pad]');
    if (!button) return;
    const groupId = groupByPad.get(button.dataset.pad!);
    if (groupId) engine.playGroup(groupId);
    button.classList.remove('hit');
    void button.offsetWidth;
    button.classList.add('hit');
  });

  moodsEl.innerHTML = MOODS.map(
    (mood) => `
      <button class="mood-card" data-mood="${mood.key}" disabled>
        <span class="mood-dot"></span>
        <span class="mood-text"><b>${mood.label}</b><span>${mood.desc}</span></span>
      </button>`,
  ).join('');

  function setMood(key: string | null): void {
    activeMood = key;
    for (const card of moodsEl.querySelectorAll<HTMLButtonElement>('.mood-card')) {
      card.classList.toggle('on', card.dataset.mood === key);
    }
  }

  function resetElementsUI(): void {
    playingLoops.clear();
    for (const row of elementsEl.querySelectorAll<HTMLDivElement>('.el-row')) {
      row.classList.remove('on');
      const toggle = row.querySelector<HTMLButtonElement>('.el-toggle');
      if (toggle) toggle.innerHTML = ICON_PLAY;
    }
  }

  moodsEl.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mood]');
    if (!card || card.disabled) return;
    const key = card.dataset.mood!;
    if (activeMood === key) {
      engine.stopTimeline();
      setMood(null);
      return;
    }
    const tracks = moodTracks(key, ids);
    if (!tracks) return;
    engine.crossfadeToTimeline(tracks, { durationMs: 1800 });
    setMood(key);
  });

  elementsEl.innerHTML = LOOPS.map(
    (spec) => `
      <div class="el-row pending" data-loop="${spec.key}">
        <button class="el-toggle" title="play/stop" disabled>${ICON_PLAY}</button>
        <span class="el-name">${spec.label}</span>
        <span class="el-chan">${spec.channel}</span>
        <span class="sub-slider el-vol">
          <input type="range" min="0" max="100" value="${Math.round(spec.volume * 100)}" style="--fill: ${spec.volume * 100}%" disabled />
          <span class="sub-value">${Math.round(spec.volume * 100)}</span>
        </span>
      </div>`,
  ).join('');

  elementsEl.addEventListener('click', (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLButtonElement>('.el-toggle');
    if (!toggle || toggle.disabled) return;
    const row = toggle.closest<HTMLDivElement>('.el-row')!;
    const key = row.dataset.loop!;
    const soundId = ids.loops.get(key);
    if (!soundId) return;
    if (playingLoops.has(key)) {
      engine.stop(soundId);
      playingLoops.delete(key);
    } else {
      engine.play(soundId);
      playingLoops.add(key);
    }
    toggle.innerHTML = playingLoops.has(key) ? ICON_STOP : ICON_PLAY;
    row.classList.toggle('on', playingLoops.has(key));
  });

  elementsEl.addEventListener('input', (event) => {
    const slider = event.target as HTMLInputElement;
    if (slider.type !== 'range') return;
    const row = slider.closest<HTMLDivElement>('.el-row')!;
    const soundId = ids.loops.get(row.dataset.loop!);
    if (!soundId) return;
    const value = Number(slider.value);
    slider.style.setProperty('--fill', `${value}%`);
    slider.nextElementSibling!.textContent = String(value);
    engine.setVolume(soundId, value / 100);
  });

  function mixerRow(id: string, label: string): string {
    const state = engine.mixer.get(id);
    const volume = Math.round((state?.volume ?? 1) * 100);
    return `
      <div class="mix-row" data-channel="${id}">
        <span class="mix-name">${label}</span>
        <span class="sub-slider mix-vol">
          <input type="range" min="0" max="100" value="${volume}" style="--fill: ${volume}%" />
          <span class="sub-value">${volume}</span>
        </span>
        <button class="mix-flag" data-flag="mute" title="mute">M</button>
        <button class="mix-flag" data-flag="solo" title="solo">S</button>
      </div>`;
  }

  mixerEl.innerHTML = DEFAULT_CHANNELS.map((id) => mixerRow(id, CHANNEL_LABELS[id] ?? id)).join('');
  masterEl.innerHTML = `
    <div class="mix-row master" data-channel="__master__">
      <span class="mix-name">Master</span>
      <span class="sub-slider mix-vol">
        <input type="range" min="0" max="100" value="100" style="--fill: 100%" />
        <span class="sub-value">100</span>
      </span>
      <button class="mix-flag" data-flag="mute" title="mute">M</button>
    </div>`;

  const mixerPane = root.querySelector<HTMLElement>('.mixer-pane')!;

  mixerPane.addEventListener('input', (event) => {
    const slider = event.target as HTMLInputElement;
    if (slider.type !== 'range') return;
    const row = slider.closest<HTMLDivElement>('.mix-row')!;
    const channel = row.dataset.channel!;
    const value = Number(slider.value);
    slider.style.setProperty('--fill', `${value}%`);
    slider.nextElementSibling!.textContent = String(value);
    if (channel === '__master__') engine.setMasterVolume(value / 100);
    else engine.setChannelVolume(channel, value / 100);
  });

  mixerPane.addEventListener('click', (event) => {
    const flag = (event.target as HTMLElement).closest<HTMLButtonElement>('.mix-flag');
    if (!flag) return;
    const row = flag.closest<HTMLDivElement>('.mix-row')!;
    const channel = row.dataset.channel!;
    const isMaster = channel === '__master__';
    if (flag.dataset.flag === 'mute') {
      const muted = isMaster ? !engine.mixer.master.muted : !engine.mixer.get(channel)?.muted;
      if (isMaster) engine.setMasterMuted(muted);
      else engine.setChannelMuted(channel, muted);
      flag.classList.toggle('on', muted);
    } else if (!isMaster) {
      const solo = !engine.mixer.get(channel)?.solo;
      engine.setChannelSolo(channel, solo);
      flag.classList.toggle('on', solo);
    }
    refreshMixerDim();
  });

  function refreshMixerDim(): void {
    for (const row of mixerPane.querySelectorAll<HTMLDivElement>('.mix-row')) {
      const channel = row.dataset.channel!;
      const gain = channel === '__master__' ? engine.mixer.masterGain() : engine.mixer.channelGain(channel);
      row.classList.toggle('dim', gain === 0);
    }
  }

  root.querySelector<HTMLButtonElement>('#stop-all')!.addEventListener('click', () => {
    engine.stopAll();
    setMood(null);
    resetElementsUI();
  });

  root.querySelector<HTMLButtonElement>('#clear-log')!.addEventListener('click', () => {
    logBody.innerHTML = '';
  });

  root.querySelector<HTMLButtonElement>('#enable')!.addEventListener('click', () => {
    engine.unlock();
    lockEl.classList.add('off');
    lockTimer = setTimeout(() => lockEl.remove(), 450);
  });

  hotkeys.register('playground', 'audio:stop', {
    name: 'Stop all sounds',
    binds: ['Space'],
    onDown: () => {
      root.querySelector<HTMLButtonElement>('#stop-all')!.click();
      return true;
    },
  });
  hotkeys.register('playground', 'audio:mute', {
    name: 'Toggle master mute',
    binds: ['KeyM'],
    onDown: () => {
      masterEl.querySelector<HTMLButtonElement>('.mix-flag')!.click();
      return true;
    },
  });

  let rendered = 0;
  for (const spec of LOOPS) {
    void renderLoopUri(spec)
      .then((uri) => {
        if (disposed) return;
        const id = v7();
        engine.register({ id, src: uri, loop: true, channel: spec.channel, volume: spec.volume });
        ids.loops.set(spec.key, id);
        names.set(id, spec.label);
        rendered += 1;
        const row = elementsEl.querySelector<HTMLDivElement>(`.el-row[data-loop="${spec.key}"]`)!;
        row.classList.remove('pending');
        row.querySelector<HTMLButtonElement>('.el-toggle')!.disabled = false;
        row.querySelector<HTMLInputElement>('input[type="range"]')!.disabled = false;
        if (rendered === LOOPS.length) {
          setStatus('ready', 'ready');
          for (const card of moodsEl.querySelectorAll<HTMLButtonElement>('.mood-card')) {
            card.disabled = false;
          }
        } else if (!renderFailed) {
          setStatus('busy', `rendering loops… ${rendered}/${LOOPS.length}`);
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        renderFailed = true;
        const row = elementsEl.querySelector<HTMLDivElement>(`.el-row[data-loop="${spec.key}"]`);
        row?.classList.add('failed');
        setStatus('error', error instanceof Error ? error.message : 'loop render failed');
      });
  }

  return () => {
    disposed = true;
    if (lockTimer !== null) clearTimeout(lockTimer);
    hotkeys.unregister('playground');
    offBus();
    engine.destroy();
  };
}
