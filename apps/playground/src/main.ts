import './style.css';
import { DiceBox, RollCancelledError, listThemes, type RollResult } from '@openvtt/dice';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="toolbar">
    <input id="notation" type="text" value="2d20+1d6" spellcheck="false" />
    <select id="theme"></select>
    <select id="environment">
      <option value="none">Env: procedural</option>
      <option value="neutral">Env: neutral</option>
      <option value="tavern">Env: tavern</option>
      <option value="neon">Env: neon</option>
    </select>
    <select id="shadows">
      <option value="none">Shadows: none</option>
      <option value="low">Shadows: low</option>
      <option value="medium" selected>Shadows: medium</option>
      <option value="high">Shadows: high</option>
    </select>
    <select id="antialias">
      <option value="none">AA: none</option>
      <option value="msaa">AA: MSAA</option>
      <option value="smaa" selected>AA: SMAA</option>
    </select>
    <label><input id="bloom" type="checkbox" /> Bloom</label>
    <select id="quick">
      <option value="">Quick...</option>
      <option value="1d4">1d4</option>
      <option value="1d6">1d6</option>
      <option value="1d8">1d8</option>
      <option value="1d10">1d10</option>
      <option value="1d12">1d12</option>
      <option value="1d20">1d20</option>
      <option value="1d100">1d100</option>
      <option value="1d2">Coin</option>
      <option value="2d20+1d6">2d20+1d6</option>
      <option value="4d6+3">4d6+3</option>
      <option value="10d6">10d6</option>
      <option value="1d20[boon]+1d20[bane]">boon/bane</option>
    </select>
    <button id="roll" disabled>Roll</button>
    <button id="clear" class="secondary" disabled>Clear</button>
    <span id="status">initializing...</span>
  </div>
  <div id="dice-container"></div>
  <div id="results"></div>
`;

const notationInput = document.querySelector<HTMLInputElement>('#notation')!;
const themeSelect = document.querySelector<HTMLSelectElement>('#theme')!;
const environmentSelect = document.querySelector<HTMLSelectElement>('#environment')!;
const shadowsSelect = document.querySelector<HTMLSelectElement>('#shadows')!;
const antialiasSelect = document.querySelector<HTMLSelectElement>('#antialias')!;
const bloomToggle = document.querySelector<HTMLInputElement>('#bloom')!;
const quickSelect = document.querySelector<HTMLSelectElement>('#quick')!;
const rollButton = document.querySelector<HTMLButtonElement>('#roll')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear')!;
const statusEl = document.querySelector<HTMLSpanElement>('#status')!;
const resultsEl = document.querySelector<HTMLDivElement>('#results')!;
const container = document.querySelector<HTMLDivElement>('#dice-container')!;

for (const [id, theme] of Object.entries(listThemes())) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = theme.name;
  themeSelect.appendChild(option);
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

diceBox.on('ready', () => {
  statusEl.textContent = 'ready';
  rollButton.disabled = false;
  clearButton.disabled = false;
});

diceBox.on('die:click', ({ id, value }) => {
  diceBox.select([id]);
  statusEl.textContent = `selected d#${id} (value: ${value?.value ?? '?'}) — click again to reroll, Esc clears`;
  selectedDie = id;
});

diceBox.on('error', (error) => {
  console.error('DiceBox error:', error);
  statusEl.textContent = 'error (see console)';
});

let selectedDie: number | null = null;
let rolling = false;

diceBox
  .initialize()
  .catch((error) => {
    console.error('Failed to initialize DiceBox:', error);
    statusEl.textContent = 'error (see console)';
  });

(window as any).__diceBox = diceBox;

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    diceBox.clearSelection();
    selectedDie = null;
  }
  if (event.key.toLowerCase() === 'r' && selectedDie !== null && !rolling) {
    rerollSelected();
  }
});

async function rerollSelected() {
  if (selectedDie === null) return;
  rolling = true;
  statusEl.textContent = 'rerolling...';
  try {
    await diceBox.reroll([selectedDie]);
    statusEl.textContent = 'ready';
  } catch (error) {
    if (!(error instanceof RollCancelledError)) console.error(error);
    statusEl.textContent = 'ready';
  } finally {
    rolling = false;
  }
}

function renderResults(result: RollResult) {
  const sets = result.sets
    .map(
      (set) =>
        `${set.num}${set.type}: [${set.rolls.map((roll) => roll.value).join(', ')}] = ${set.total}`
    )
    .join(' &nbsp;·&nbsp; ');
  const modifier = result.modifier ? ` &nbsp;·&nbsp; modifier ${result.modifier > 0 ? '+' : ''}${result.modifier}` : '';
  resultsEl.innerHTML = `
    <div class="total">${result.notation} &rarr; ${result.total}</div>
    <div class="sets">${sets}${modifier}</div>
  `;
}

async function roll() {
  if (rolling || !diceBox.initialized) return;
  rolling = true;
  rollButton.disabled = true;
  statusEl.textContent = 'rolling...';
  diceBox.clearSelection();
  try {
    const result = (await diceBox.roll(notationInput.value.trim() || '1d20')) as RollResult;
    renderResults(result);
    statusEl.textContent = 'ready';
  } catch (error) {
    if (!(error instanceof RollCancelledError)) {
      console.error('Roll failed:', error);
      statusEl.textContent = 'roll failed (see console)';
    } else {
      statusEl.textContent = 'ready';
    }
  } finally {
    rolling = false;
    rollButton.disabled = false;
  }
}

rollButton.addEventListener('click', roll);
notationInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') roll();
});

quickSelect.addEventListener('change', () => {
  if (quickSelect.value) {
    notationInput.value = quickSelect.value;
    quickSelect.value = '';
    roll();
  }
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
  statusEl.textContent = 'AA change applies on reload';
});

bloomToggle.addEventListener('change', () => {
  diceBox.updateConfig({ postprocessing: postprocessing() });
});

clearButton.addEventListener('click', () => {
  diceBox.clear();
  resultsEl.innerHTML = '';
});
