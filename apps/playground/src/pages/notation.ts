import { evaluateRoll, type DieRoll, type RollExpr } from '@openvtt/dice-core';
import { hotkeys } from '../hotkeys';
import { fromFormula as parseCanonical, toFormula as printCanonical } from '@openvtt/dice-notation';
import { fromFormula as parseFoundry, toFormula as printFoundry } from '@openvtt/dice-foundry-notation';
import { fromFormula as parseRoll20, toFormula as printRoll20 } from '@openvtt/dice-roll20-notation';

type DialectId = 'canonical' | 'foundry' | 'roll20';

interface Dialect {
  id: DialectId;
  label: string;
  pkg: string;
  parse: (source: string) => RollExpr;
  print: (expr: RollExpr) => string;
  samples: { notation: string; label: string }[];
  scope?: Record<string, unknown>;
}

const DIALECTS: Dialect[] = [
  {
    id: 'canonical',
    label: 'Canonical',
    pkg: '@openvtt/dice-notation',
    parse: parseCanonical,
    print: printCanonical,
    samples: [
      { notation: '2d20kh1+5', label: '2d20kh1+5' },
      { notation: '4d6keep-highest3', label: '4d6keep-highest3' },
      { notation: '1d6!!+2', label: '1d6!!+2' },
      { notation: '4dF+1', label: '4dF+1' },
      { notation: '2dcoin', label: '2dcoin' },
      { notation: '4d10count-success>=8', label: '4d10cs>=8 (long)' },
    ],
  },
  {
    id: 'foundry',
    label: 'Foundry',
    pkg: '@openvtt/dice-foundry-notation',
    parse: parseFoundry,
    print: printFoundry,
    samples: [
      { notation: '4d6kh3', label: '4d6kh3' },
      { notation: '{2d6, 1d8}kh2', label: '{2d6,1d8}kh2' },
      { notation: '2d6rr<=2', label: '2d6rr<=2' },
      { notation: '1d20ms10', label: '1d20ms10' },
      { notation: '4df+2', label: '4df+2' },
      { notation: '2d6 + @abilities.str.mod', label: '@attributes' },
    ],
    scope: { abilities: { str: { mod: 3 } } },
  },
  {
    id: 'roll20',
    label: 'Roll20',
    pkg: '@openvtt/dice-roll20-notation',
    parse: parseRoll20,
    print: printRoll20,
    samples: [
      { notation: '4d6kh3', label: '4d6kh3' },
      { notation: '2d6ro<=2', label: '2d6ro<=2' },
      { notation: '1d6!p', label: '1d6!p' },
      { notation: '5d10>6', label: '5d10>6' },
      { notation: '4dF+2', label: '4dF+2' },
      { notation: '4d10cs>=8', label: '4d10cs>=8' },
    ],
  },
];

function dieChip(die: DieRoll): string {
  const classes = ['die'];
  if (!die.kept) classes.push('dropped');
  if (die.exploded) classes.push('exploded');
  if (die.outcome === 'success') classes.push('success');
  if (die.outcome === 'failure') classes.push('failure');
  const title = [
    die.rerolled ? `rerolled · history ${die.history.join(' → ')}` : '',
    die.penetrated ? 'penetrating' : '',
    die.kept ? '' : 'dropped',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<span class="${classes.join(' ')}"${title ? ` title="${title}"` : ''}>${die.value}</span>`;
}

export function renderNotation(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="stage notation-stage">
      <div class="notation-grid">
        <section class="panel notation-pane" id="ir-pane">
          <header>Dice IR <span class="pkg">@openvtt/dice-core</span></header>
          <pre id="ir"></pre>
        </section>
        <section class="panel notation-pane" id="roll-pane">
          <header>Round-trip &amp; roll</header>
          <div class="roundtrip" id="roundtrip"></div>
          <div class="roll-out" id="roll-out"></div>
        </section>
      </div>
    </div>
    <div class="overlay page-title">
      <h1>Notation Lab</h1>
      <p>dice-core · dice-notation · foundry · roll20</p>
    </div>
    <div class="overlay dice-dock notation-dock">
      <div class="dice-chips" id="samples"></div>
      <div class="dice-bar">
        <div class="seg" id="dialects">
          ${DIALECTS.map((d) => `<button data-dialect="${d.id}">${d.label}</button>`).join('')}
        </div>
        <input id="notation" type="text" value="4d6kh3" placeholder="4d6kh3" spellcheck="false" autocomplete="off" />
        <input id="seed" type="text" placeholder="seed (optional)" spellcheck="false" autocomplete="off" />
        <button class="btn" id="run">Parse &amp; Roll</button>
      </div>
      <div class="dice-hint">
        <kbd>Enter</kbd> parse &amp; roll &nbsp;·&nbsp; hover a die for its history
      </div>
    </div>
    <div class="overlay dice-status pill" id="status" data-state="ready">
      <span class="dot"></span><span id="status-text">ready</span>
    </div>
  `;

  const notationInput = root.querySelector<HTMLInputElement>('#notation')!;
  const seedInput = root.querySelector<HTMLInputElement>('#seed')!;
  const runButton = root.querySelector<HTMLButtonElement>('#run')!;
  const statusPill = root.querySelector<HTMLDivElement>('#status')!;
  const statusText = root.querySelector<HTMLSpanElement>('#status-text')!;
  const irEl = root.querySelector<HTMLPreElement>('#ir')!;
  const roundtripEl = root.querySelector<HTMLDivElement>('#roundtrip')!;
  const rollOutEl = root.querySelector<HTMLDivElement>('#roll-out')!;
  const samplesEl = root.querySelector<HTMLDivElement>('#samples')!;
  const dialectsEl = root.querySelector<HTMLDivElement>('#dialects')!;

  let active: Dialect = DIALECTS[0]!;

  function setStatus(state: 'ready' | 'busy' | 'error', text: string) {
    statusPill.dataset.state = state;
    statusText.textContent = text;
  }

  function renderSamples(): void {
    samplesEl.innerHTML = active.samples
      .map((s) => `<button class="chip" data-notation="${s.notation.replace(/"/g, '&quot;')}">${s.label}</button>`)
      .join('');
  }

  function syncDialectUI(): void {
    for (const btn of dialectsEl.querySelectorAll<HTMLButtonElement>('button')) {
      btn.classList.toggle('on', btn.dataset.dialect === active.id);
    }
    renderSamples();
  }

  function run(): void {
    const source = notationInput.value.trim();
    if (!source) return;
    try {
      const expr = active.parse(source);
      irEl.textContent = JSON.stringify(expr, null, 2);

      const printed = active.print(expr);
      roundtripEl.innerHTML = `
        <div class="rt-row"><span>serialized</span><code>${printed}</code></div>
        <div class="rt-row"><span>round-trip</span><code>${printed === source ? 'identical' : 'normalized'}</code></div>
      `;

      const seed = seedInput.value.trim();
      const result = evaluateRoll(expr, {
        ...(seed ? { seed } : {}),
        ...(active.scope ? { scope: active.scope } : {}),
      });

      const terms = result.terms
        .map(
          (term) => `
          <div class="term">
            <div class="term-head">
              <span class="term-type">${term.type}</span>
              <span class="term-value">${term.value}</span>
              ${term.applied.length ? `<span class="term-mods">${term.applied.join(' · ')}</span>` : ''}
            </div>
            <div class="dice-row">${term.dice.map(dieChip).join('')}</div>
          </div>`,
        )
        .join('');

      rollOutEl.innerHTML = `
        <div class="roll-total"><span>total</span><b>${String(result.value)}</b></div>
        ${terms}
      `;
      setStatus('ready', `parsed with ${active.pkg}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      irEl.textContent = '';
      roundtripEl.innerHTML = '';
      rollOutEl.innerHTML = `<div class="parse-error">${message}</div>`;
      setStatus('error', 'parse error');
    }
  }

  dialectsEl.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-dialect]');
    if (!btn) return;
    active = DIALECTS.find((d) => d.id === btn.dataset.dialect)!;
    syncDialectUI();
    run();
  });

  samplesEl.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (chip?.dataset.notation) {
      notationInput.value = chip.dataset.notation;
      run();
    }
  });

  runButton.addEventListener('click', run);

  hotkeys.register('playground', 'notation:run', {
    name: 'Run notation',
    binds: ['Enter'],
    allowInInputs: true,
    onDown: () => {
      const active = document.activeElement;
      if (active !== notationInput && active !== seedInput) return;
      run();
      return true;
    },
  });

  syncDialectUI();
  run();

  return () => {
    hotkeys.unregister('playground');
  };
}
