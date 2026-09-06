import { DiceBox, RollCancelledError, listThemes, type RollResult } from '@openvtt/dice';
import { hotkeys } from '../hotkeys';

const ICONS = {
  gear: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
};

const QUICK_ROLLS: { notation: string; label: string }[] = [
  { notation: '1d4', label: 'd4' },
  { notation: '1d6', label: 'd6' },
  { notation: '1d8', label: 'd8' },
  { notation: '1d10', label: 'd10' },
  { notation: '1d12', label: 'd12' },
  { notation: '1d20', label: 'd20' },
  { notation: '1d100', label: 'd100' },
  { notation: '1d2', label: 'coin' },
  { notation: '4d6+3', label: '4d6+3' },
  { notation: '2d20+1d6', label: '2d20+1d6' },
  { notation: '1d20[boon]+1d20[bane]', label: 'boon/bane' },
];

export function renderDice(root: HTMLElement): () => void {
  root.innerHTML = `
    <div id="dice-container" class="stage"></div>
    <div class="overlay page-title">
      <h1>Dice Lab</h1>
      <p>@openvtt/dice</p>
    </div>
    <div class="overlay dice-result" id="result"></div>
    <div class="overlay dice-settings">
      <button class="icon-btn" id="settings-btn" title="Render settings">${ICONS.gear}</button>
      <div class="panel settings-panel" id="settings-panel">
        <label class="field"><span>Theme</span><span class="select"><select id="theme"></select></span></label>
        <label class="field"><span>Environment</span>
          <span class="select"><select id="environment">
            <option value="none">Procedural</option>
            <option value="neutral">Neutral</option>
            <option value="tavern">Tavern</option>
            <option value="neon">Neon</option>
          </select></span>
        </label>
        <label class="field"><span>Shadows</span>
          <span class="select"><select id="shadows">
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select></span>
        </label>
        <label class="field"><span>Antialiasing</span>
          <span class="select"><select id="antialias">
            <option value="none">None</option>
            <option value="msaa">MSAA</option>
            <option value="smaa" selected>SMAA</option>
          </select></span>
        </label>
        <label class="switch">Bloom<input id="bloom" type="checkbox" /><span class="track"></span></label>
      </div>
    </div>
    <div class="overlay dice-history" id="history"></div>
    <div class="overlay dice-dock">
      <div class="dice-chips">
        ${QUICK_ROLLS.map((q) => `<button class="chip" data-notation="${q.notation}">${q.label}</button>`).join('')}
      </div>
      <div class="dice-bar">
        <input id="notation" type="text" value="2d20+1d6" placeholder="2d20+1d6" spellcheck="false" autocomplete="off" />
        <button class="btn ghost" id="clear" title="Clear dice" disabled>${ICONS.trash}</button>
        <button class="btn" id="roll" disabled>Roll</button>
      </div>
      <div class="dice-hint">
        <kbd>Enter</kbd> roll &nbsp;·&nbsp; click a die to select &nbsp;·&nbsp; <kbd>R</kbd> reroll &nbsp;·&nbsp; <kbd>Esc</kbd> deselect
      </div>
    </div>
    <div class="overlay dice-status pill" id="status" data-state="busy">
      <span class="dot"></span><span id="status-text">initializing…</span>
    </div>
  `;

  const notationInput = root.querySelector<HTMLInputElement>('#notation')!;
  const themeSelect = root.querySelector<HTMLSelectElement>('#theme')!;
  const environmentSelect = root.querySelector<HTMLSelectElement>('#environment')!;
  const shadowsSelect = root.querySelector<HTMLSelectElement>('#shadows')!;
  const antialiasSelect = root.querySelector<HTMLSelectElement>('#antialias')!;
  const bloomToggle = root.querySelector<HTMLInputElement>('#bloom')!;
  const rollButton = root.querySelector<HTMLButtonElement>('#roll')!;
  const clearButton = root.querySelector<HTMLButtonElement>('#clear')!;
  const statusPill = root.querySelector<HTMLDivElement>('#status')!;
  const statusText = root.querySelector<HTMLSpanElement>('#status-text')!;
  const resultEl = root.querySelector<HTMLDivElement>('#result')!;
  const historyEl = root.querySelector<HTMLDivElement>('#history')!;
  const settingsBtn = root.querySelector<HTMLButtonElement>('#settings-btn')!;
  const settingsPanel = root.querySelector<HTMLDivElement>('#settings-panel')!;
  const container = root.querySelector<HTMLDivElement>('#dice-container')!;

  for (const [id, theme] of Object.entries(listThemes())) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = theme.name;
    themeSelect.appendChild(option);
  }

  function setStatus(state: 'ready' | 'busy' | 'error', text: string) {
    statusPill.dataset.state = state;
    statusText.textContent = text;
  }

  function postprocessing() {
    return {
      enabled: true,
      outline: { edgeStrength: 5, pulsePeriod: 0, visibleEdgeColor: '#ffb347', hiddenEdgeColor: '#7a5b20' },
      bloom: bloomToggle.checked ? { strength: 0.5, radius: 0.5, threshold: 0.8 } : false as const,
    };
  }

  const diceBox = new DiceBox(container, {
    assetPath: '/',
    theme: 'default',
    shadows: 'medium',
    antialias: antialiasSelect.value as 'none' | 'msaa' | 'smaa',
    environment: environmentSelect.value as 'none',
    normalMaps: false,
    postprocessing: postprocessing(),
  });

  let selectedDie: number | null = null;
  let rolling = false;
  let disposed = false;

  diceBox.on('ready', () => {
    if (disposed) return;
    setStatus('ready', 'ready');
    rollButton.disabled = false;
    clearButton.disabled = false;
  });

  diceBox.on('die:click', ({ id, value }) => {
    if (disposed) return;
    diceBox.select([id]);
    selectedDie = id;
    setStatus('ready', `die #${id} selected · value ${value?.value ?? '?'}`);
  });

  diceBox.on('error', (error) => {
    if (disposed) return;
    console.error('DiceBox error:', error);
    setStatus('error', 'error — see console');
  });

  const cleanupInit = diceBox.initialize().catch((error) => {
    console.error('Failed to initialize DiceBox:', error);
    setStatus('error', 'error — see console');
  });

  hotkeys.register('playground', 'dice:escape', {
    name: 'Clear dice selection',
    binds: ['Escape'],
    allowInInputs: true,
    onDown: () => {
      if (document.activeElement === notationInput) {
        notationInput.blur();
        return true;
      }
      diceBox.clearSelection();
      selectedDie = null;
      setStatus('ready', 'ready');
      return true;
    },
  });
  hotkeys.register('playground', 'dice:reroll', {
    name: 'Reroll selected die',
    binds: ['KeyR'],
    onDown: () => {
      if (selectedDie === null || rolling || document.activeElement === notationInput) return;
      rerollSelected();
      return true;
    },
  });

  const onOutsideClick = (event: MouseEvent) => {
    if (!settingsPanel.contains(event.target as Node) && event.target !== settingsBtn && !settingsBtn.contains(event.target as Node)) {
      settingsPanel.classList.remove('open');
      settingsBtn.classList.remove('on');
    }
  };
  document.addEventListener('click', onOutsideClick);

  settingsBtn.addEventListener('click', () => {
    const open = settingsPanel.classList.toggle('open');
    settingsBtn.classList.toggle('on', open);
  });

  async function rerollSelected() {
    if (selectedDie === null) return;
    rolling = true;
    setStatus('busy', 'rerolling…');
    try {
      await diceBox.reroll([selectedDie]);
      setStatus('ready', 'ready');
    } catch (error) {
      if (!(error instanceof RollCancelledError)) console.error(error);
      setStatus('ready', 'ready');
    } finally {
      rolling = false;
    }
  }

  function renderResult(result: RollResult) {
    const sets = result.sets
      .map((set) => `${set.num}${set.type} [${set.rolls.map((roll) => roll.value).join(', ')}] = ${set.total}`)
      .join('  ·  ');
    const modifier = result.modifier ? `  ·  mod ${result.modifier > 0 ? '+' : ''}${result.modifier}` : '';
    resultEl.innerHTML = `
      <div class="total">${result.total}</div>
      <div class="notation">${result.notation}</div>
      <div class="sets">${sets}${modifier}</div>
    `;
    resultEl.classList.add('show');

    const chip = document.createElement('button');
    chip.className = 'history-chip';
    chip.dataset.notation = result.notation;
    chip.append(result.notation + ' ');
    const total = document.createElement('b');
    total.textContent = `→ ${result.total}`;
    chip.append(total);
    historyEl.prepend(chip);
    while (historyEl.childElementCount > 6) historyEl.lastChild?.remove();
  }

  async function roll(notation?: string) {
    if (rolling || !diceBox.initialized) return;
    if (notation !== undefined) notationInput.value = notation;
    rolling = true;
    rollButton.disabled = true;
    setStatus('busy', 'rolling…');
    diceBox.clearSelection();
    selectedDie = null;
    try {
      const result = await diceBox.roll(notationInput.value.trim() || '1d20');
      renderResult(result);
      setStatus('ready', 'ready');
    } catch (error) {
      if (!(error instanceof RollCancelledError)) {
        console.error('Roll failed:', error);
        setStatus('error', 'roll failed — see console');
      } else {
        setStatus('ready', 'ready');
      }
    } finally {
      rolling = false;
      rollButton.disabled = false;
    }
  }

  rollButton.addEventListener('click', () => roll());
  notationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') roll();
  });

  root.querySelector('.dice-chips')!.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (chip?.dataset.notation) roll(chip.dataset.notation);
  });

  historyEl.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('.history-chip');
    if (chip?.dataset.notation) roll(chip.dataset.notation);
  });

  themeSelect.addEventListener('change', () => {
    diceBox.updateConfig({ theme: themeSelect.value });
  });

  environmentSelect.addEventListener('change', () => {
    diceBox.updateConfig({ environment: environmentSelect.value as 'none' });
  });

  shadowsSelect.addEventListener('change', () => {
    diceBox.updateConfig({ shadows: shadowsSelect.value as 'medium' });
  });

  antialiasSelect.addEventListener('change', () => {
    setStatus('ready', 'AA applies on reload');
  });

  bloomToggle.addEventListener('change', () => {
    diceBox.updateConfig({ postprocessing: postprocessing() });
  });

  clearButton.addEventListener('click', () => {
    diceBox.clear();
    resultEl.classList.remove('show');
    setStatus('ready', 'ready');
  });

  return () => {
    disposed = true;
    hotkeys.unregister('playground');
    document.removeEventListener('click', onOutsideClick);
    void cleanupInit;
    try {
      diceBox.destroy();
    } catch {
      // ignore
    }
  };
}
