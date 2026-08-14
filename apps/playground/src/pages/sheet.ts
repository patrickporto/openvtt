import { v7 } from 'uuid';
import { evaluateRoll, type DieRoll } from '@openvtt/dice-core';
import { toFormula } from '@openvtt/dice-notation';
import {
  SheetEngine,
  createDocument,
  createSheetBus,
  flatten,
  setPath,
  type AuditEntry,
  type Change,
  type EffectDefinition,
  type RollTransform,
  type SystemPack,
} from '@openvtt/sheet';

const pack: SystemPack = {
  id: 'dnd5e-lab',
  version: '1.0.0',
  ordinals: {
    size: ['tiny', 'small', 'medium', 'large', 'huge'],
  },
  derived: {
    'mods.str': 'floor((abilities.str - 10) / 2)',
    'mods.dex': 'floor((abilities.dex - 10) / 2)',
    proficiency: '2 + floor((level - 1) / 4)',
    attack_mod: 'mods.str + proficiency + attack_bonus',
    ac: '10 + mods.dex + ac_bonus',
    'hp.bloodied_at': 'floor(hp.max / 2)',
  },
  rollTemplates: {
    attack: {
      expr: {
        '+': [
          { type: 'die', count: 1, faces: { kind: 'number', value: 20 } },
          { var: 'attack_mod' },
        ],
      },
      tags: ['attacks'],
    },
    'damage.longsword': {
      expr: {
        '+': [
          {
            '+': [
              { type: 'die', count: 1, faces: { kind: 'number', value: 8 } },
              { var: 'mods.str' },
            ],
          },
          { var: 'damage_bonus' },
        ],
      },
      tags: ['damage'],
    },
    'check.dex': {
      expr: {
        '+': [
          { type: 'die', count: 1, faces: { kind: 'number', value: 20 } },
          { var: 'mods.dex' },
        ],
      },
      tags: ['checks'],
    },
  },
  definitions: [
    {
      id: 'class.fighter.level-3',
      label: 'Fighter 3',
      changes: [{ kind: 'value', path: 'level', op: 'set', value: '3' }],
    },
    {
      id: 'class.fighter.level-5',
      label: 'Fighter 5',
      changes: [{ kind: 'value', path: 'level', op: 'set', value: '5' }],
    },
    {
      id: 'item.longsword+1',
      label: 'Longsword +1',
      changes: [{ kind: 'value', path: 'attack_bonus', op: 'add', value: '1' }],
    },
    {
      id: 'item.shield',
      label: 'Shield',
      changes: [{ kind: 'value', path: 'ac_bonus', op: 'add', value: '2' }],
    },
    {
      id: 'item.belt-of-giant-strength',
      label: 'Belt of Giant Strength',
      priority: 5,
      changes: [{ kind: 'value', path: 'abilities.str', op: 'set', value: '19' }],
    },
    {
      id: 'item.ring-of-fire-ward',
      label: 'Ring of Fire Ward',
      changes: [{ kind: 'value', path: 'resistances', op: 'append', value: 'fire' }],
    },
    {
      id: 'spell.mage-armor',
      label: 'Mage Armor',
      priority: 10,
      stacking: { group: 'armor', mode: 'highest-priority' },
      changes: [{ kind: 'value', path: 'ac_bonus', op: 'set', value: '3' }],
    },
    {
      id: 'spell.barkskin',
      label: 'Barkskin',
      priority: 20,
      stacking: { group: 'armor', mode: 'highest-priority' },
      changes: [{ kind: 'value', path: 'ac_bonus', op: 'set', value: '6' }],
    },
    {
      id: 'spell.haste',
      label: 'Haste',
      duration: { unit: 'turns', value: 3 },
      changes: [{ kind: 'value', path: 'ac_bonus', op: 'add', value: '2' }],
    },
    {
      id: 'spell.enlarge',
      label: 'Enlarge',
      duration: { unit: 'rounds', value: 10 },
      changes: [
        { kind: 'value', path: 'size', op: 'upgrade', value: 'size' },
        { kind: 'roll', target: 'damage', transform: { bonus: '2' } },
      ],
    },
    {
      id: 'spell.reduce',
      label: 'Reduce',
      duration: { unit: 'rounds', value: 10 },
      changes: [{ kind: 'value', path: 'size', op: 'downgrade', value: 'size' }],
    },
    {
      id: 'spell.elemental-weapon',
      label: 'Elemental Weapon',
      changes: [{ kind: 'value', path: 'damage_bonus', op: 'add', value: 'data.bonus' }],
    },
    {
      id: 'conditions.blessed',
      label: 'Blessed',
      duration: { unit: 'rounds', value: 10 },
      changes: [
        { kind: 'roll', target: 'attacks', transform: { extraDice: [{ count: 1, faces: 4 }] } },
      ],
    },
    {
      id: 'conditions.advantage',
      label: 'Advantage',
      changes: [
        {
          kind: 'roll',
          target: 'attack',
          transform: { addDice: 1, addModifiers: [{ op: 'keep-highest', count: 1 }] },
        },
      ],
    },
    {
      id: 'conditions.disadvantage',
      label: 'Disadvantage',
      changes: [
        {
          kind: 'roll',
          target: 'attack',
          transform: { addDice: 1, addModifiers: [{ op: 'keep-lowest', count: 1 }] },
        },
      ],
    },
    {
      id: 'conditions.stunned',
      label: 'Stunned',
      duration: { unit: 'seconds', value: 6 },
      changes: [{ kind: 'flag', path: 'stunned', value: true }],
    },
    {
      id: 'conditions.poisoned',
      label: 'Poisoned',
      duration: { unit: 'until-event', event: 'rest:long' },
      changes: [{ kind: 'flag', path: 'poisoned', value: true }],
    },
    {
      id: 'conditions.cursed',
      label: 'Cursed',
      changes: [{ kind: 'value', path: 'resistances', op: 'remove', value: 'fire' }],
    },
    {
      id: 'conditions.slowed',
      label: 'Slowed',
      changes: [{ kind: 'value', path: 'speed', op: 'multiply', value: '0.5' }],
    },
    {
      id: 'conditions.unconscious',
      label: 'Unconscious',
      changes: [{ kind: 'flag', path: 'unconscious', value: true }],
    },
    {
      id: 'conditions.bloodied',
      label: 'Bloodied',
      condition: 'hp.current < hp.max / 2',
      changes: [{ kind: 'flag', path: 'bloodied', value: true }],
    },
    {
      id: 'features.rage',
      label: 'Rage',
      condition: 'not flags.unconscious',
      grants: ['features.reckless'],
      changes: [
        { kind: 'flag', path: 'rage', value: true },
        { kind: 'value', path: 'damage_bonus', op: 'add', value: '2' },
      ],
    },
    {
      id: 'features.reckless',
      label: 'Reckless',
      changes: [{ kind: 'flag', path: 'reckless', value: true }],
    },
    {
      id: 'features.regeneration',
      label: 'Regeneration',
      changes: [],
      triggers: [{ on: 'turn:end', roll: '1d4', rollInto: { path: 'hp.current', op: 'add' } }],
    },
    {
      id: 'features.relentless',
      label: 'Relentless',
      changes: [],
      triggers: [
        {
          on: 'round:end',
          condition: 'hp.current < hp.max / 2',
          effect: 'conditions.bloodied',
        },
      ],
    },
  ],
};

const BASE = {
  abilities: { str: 16, dex: 14 },
  level: 1,
  attack_bonus: 0,
  damage_bonus: 0,
  ac_bonus: 0,
  hp: { current: 12, max: 12 },
  speed: 30,
  size: 'medium',
  resistances: [] as string[],
};

const CUSTOM_TEMPLATE = `{
  "id": "custom.my-effect",
  "label": "My Effect",
  "changes": [
    { "kind": "value", "path": "attack_bonus", "op": "add", "value": "1" }
  ],
  "duration": { "unit": "rounds", "value": 3 }
}`;

const OP_SYMBOL: Record<string, string> = {
  set: '=',
  add: '+',
  multiply: '×',
  upgrade: '↑',
  downgrade: '↓',
  append: '⊕',
  remove: '⊖',
};

function transformSummary(t: RollTransform): string {
  const bits: string[] = [];
  if (t.addDice) bits.push(`+${t.addDice} die`);
  if (t.addModifiers?.length) bits.push(t.addModifiers.map((m) => m.op).join(','));
  if (t.extraDice?.length) bits.push(t.extraDice.map((d) => `+${d.count}d${d.faces}`).join(','));
  if (t.bonus) bits.push(`bonus ${t.bonus}`);
  return bits.join(' ');
}

function changeSummary(change: Change): string {
  if (change.kind === 'flag') return `⚑ ${change.path} = ${String(change.value)}`;
  if (change.kind === 'roll') return `🎲 ${change.target} · ${transformSummary(change.transform)}`;
  return `${change.path} ${OP_SYMBOL[change.op] ?? change.op} ${change.value}`;
}

function usesData(def: EffectDefinition): boolean {
  return JSON.stringify(def).includes('data.');
}

function defBadges(def: EffectDefinition): string {
  const badges: string[] = [];
  if (def.duration) {
    badges.push(
      def.duration.unit === 'until-event'
        ? `until ${def.duration.event}`
        : `${def.duration.value ?? ''} ${def.duration.unit}`.trim(),
    );
  }
  if (def.condition) badges.push(`if ${def.condition}`);
  for (const t of def.triggers ?? []) badges.push(`on ${t.on}`);
  if (def.grants?.length) badges.push(`grants ${def.grants.length}`);
  if (def.stacking) badges.push(`${def.stacking.mode ?? 'stack'}:${def.stacking.group ?? def.id}`);
  if (def.priority) badges.push(`prio ${def.priority}`);
  if (usesData(def)) badges.push('needs data');
  return badges.map((b) => `<span class="badge">${b}</span>`).join('');
}

function dieChip(die: DieRoll): string {
  const classes = ['die'];
  if (!die.kept) classes.push('dropped');
  if (die.exploded) classes.push('exploded');
  const title = die.history.length > 1 ? `history ${die.history.join(' → ')}` : '';
  return `<span class="${classes.join(' ')}"${title ? ` title="${title}"` : ''}>${die.value}</span>`;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface SheetTab {
  id: string;
  engine: SheetEngine;
  lastRoll: string;
}

export function renderSheet(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="stage sheet-stage">
      <div class="sheet-layout">
        <section class="panel sheet-pane" id="library-pane">
          <header>Effect library <span class="pkg">drag onto the sheet</span></header>
          <div class="lib-tools">
            <input id="lib-search" type="text" placeholder="filter effects…" spellcheck="false" autocomplete="off" />
            <input id="lib-data" type="text" placeholder='data JSON (optional) · {"bonus":2}' spellcheck="false" autocomplete="off" />
          </div>
          <div class="lib-list scroll" id="lib-list"></div>
          <div class="lib-custom">
            <button class="lib-custom-toggle" id="custom-toggle">+ custom effect (JSON)</button>
            <div class="lib-custom-editor" id="custom-editor">
              <textarea id="custom-json" spellcheck="false">${CUSTOM_TEMPLATE}</textarea>
              <button class="btn" id="custom-register">Register definition</button>
            </div>
          </div>
        </section>
        <section class="panel sheet-pane" id="sheet-pane">
          <div class="tabs" id="tabs"></div>
          <div class="sheet-head">
            <input id="sheet-name" type="text" spellcheck="false" autocomplete="off" />
            <div class="sheet-head-actions">
              <button class="mini-btn" id="doc-export"><span>Export</span></button>
              <button class="mini-btn" id="doc-import"><span>Import</span></button>
              <button class="mini-btn danger" id="clear-manual"><span>Clear manual</span></button>
            </div>
          </div>
          <div class="sheet-body scroll" id="sheet-body">
            <div class="sheet-subhead">Base document <span class="pkg">setPath · loadDocument</span></div>
            <div class="sheet-base" id="base"></div>
            <div class="base-add">
              <input id="add-path" type="text" placeholder="path (e.g. abilities.con)" spellcheck="false" autocomplete="off" />
              <input id="add-value" type="text" placeholder="value (JSON)" spellcheck="false" autocomplete="off" />
              <button class="mini-btn" id="add-btn"><span>Set</span></button>
            </div>
            <div class="sheet-subhead">Active effects <span class="pkg">applyEffect · setEnabled · removeEffect</span></div>
            <div class="sheet-instances" id="instances"></div>
            <div class="sheet-subhead">Combat clock <span class="pkg">notifyEvent · tickSeconds</span></div>
            <div class="sheet-clock">
              <button class="mini-btn" data-event="turn:end"><span>End turn</span></button>
              <button class="mini-btn" data-event="round:end"><span>End round</span></button>
              <input id="tick-n" type="number" value="6" min="1" />
              <button class="mini-btn" id="tick"><span>Tick seconds</span></button>
              <input id="custom-event" type="text" placeholder="rest:long" spellcheck="false" autocomplete="off" />
              <button class="mini-btn" id="emit"><span>Emit</span></button>
            </div>
            <div class="sheet-subhead">Rolls <span class="pkg">buildRoll · rollTransforms</span></div>
            <div class="sheet-rolls" id="rolls"></div>
            <div class="roll-out" id="roll-out"></div>
          </div>
          <div class="drop-veil" id="drop-veil"><span>drop to apply effect</span></div>
        </section>
        <section class="panel sheet-pane" id="inspector-pane">
          <header>Computed sheet <span class="pkg">click a row for the audit trail</span></header>
          <div class="sheet-values scroll" id="values"></div>
          <div id="audit-wrap"></div>
          <div id="suppressed-wrap"></div>
          <div class="sheet-subhead">Event log <span class="pkg">createSheetBus</span></div>
          <div class="log-body sheet-log-body scroll" id="event-log"></div>
        </section>
      </div>
    </div>
    <div class="overlay page-title">
      <h1>Sheet Lab</h1>
      <p>@openvtt/sheet · formula · dice-core</p>
    </div>
    <div class="overlay dice-status pill" id="status" data-state="ready">
      <span class="dot"></span><span id="status-text">ready</span>
    </div>
  `;

  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const libSearch = $<HTMLInputElement>('#lib-search');
  const libData = $<HTMLInputElement>('#lib-data');
  const libList = $<HTMLDivElement>('#lib-list');
  const customToggle = $<HTMLButtonElement>('#custom-toggle');
  const customEditor = $<HTMLDivElement>('#custom-editor');
  const customJson = $<HTMLTextAreaElement>('#custom-json');
  const tabsEl = $<HTMLDivElement>('#tabs');
  const sheetPane = $<HTMLElement>('#sheet-pane');
  const sheetName = $<HTMLInputElement>('#sheet-name');
  const baseEl = $<HTMLDivElement>('#base');
  const instancesEl = $<HTMLDivElement>('#instances');
  const rollsEl = $<HTMLDivElement>('#rolls');
  const rollOutEl = $<HTMLDivElement>('#roll-out');
  const valuesEl = $<HTMLDivElement>('#values');
  const auditWrap = $<HTMLDivElement>('#audit-wrap');
  const suppressedWrap = $<HTMLDivElement>('#suppressed-wrap');
  const logEl = $<HTMLDivElement>('#event-log');
  const statusPill = $<HTMLDivElement>('#status');
  const statusText = $<HTMLSpanElement>('#status-text');

  const customDefs: EffectDefinition[] = [];
  const tabs: SheetTab[] = [];
  let active: SheetTab;
  let changedPaths = new Set<string>();
  let inspectedPath: string | null = null;
  let sheetCounter = 0;

  function setStatus(state: 'ready' | 'busy' | 'error', text: string) {
    statusPill.dataset.state = state;
    statusText.textContent = text;
  }

  function log(key: string, msg: string) {
    const line = document.createElement('div');
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    line.innerHTML = `<span class="t">${time}</span><span class="k">${key}</span> ${msg}`;
    logEl.prepend(line);
    while (logEl.childElementCount > 80) logEl.lastChild?.remove();
  }

  function labelOf(ref: string | undefined): string {
    if (!ref) return 'inline';
    return allDefs().find((d) => d.id === ref)?.label ?? active.engine.getDefinition(ref)?.label ?? ref;
  }

  function allDefs(): EffectDefinition[] {
    return [...(pack.definitions ?? []), ...customDefs];
  }

  function parseValue(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  function applyData(): Record<string, unknown> | undefined {
    const raw = libData.value.trim();
    if (!raw) return undefined;
    const parsed = parseValue(raw);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  }

  /* ------------------------------ tabs ------------------------------ */

  function makeSheet(name?: string): SheetTab {
    sheetCounter += 1;
    const bus = createSheetBus();
    const engine = new SheetEngine(
      createDocument(pack, {
        base: structuredClone(BASE),
        identity: { name: name ?? `Character ${sheetCounter}` },
      }),
      { pack, bus },
    );
    engine.attach();
    for (const def of customDefs) engine.registerDefinition(def);
    const tab: SheetTab = { id: v7(), engine, lastRoll: '' };
    const ifActive = (fn: () => void) => () => {
      if (active === tab) fn();
    };
    bus.on('effect:applied', ifActive(() => refresh()));
    bus.on('effect:removed', ifActive(() => refresh()));
    bus.on('effect:expired', ifActive(() => refresh()));
    bus.on('effect:enabled', ifActive(() => refresh()));
    bus.on('effect:disabled', ifActive(() => refresh()));
    bus.on('computed', ({ patches }) => {
      if (active !== tab) return;
      for (const patch of patches) {
        changedPaths.add(patch.path);
        log('patch', `${patch.path}: ${JSON.stringify(patch.previous)} → ${JSON.stringify(patch.next)}`);
      }
      refresh();
    });
    bus.on('effect:applied', ({ ref }) => {
      if (active === tab) log('effect', `applied ${labelOf(ref)}`);
    });
    bus.on('effect:removed', ({ ref }) => {
      if (active === tab) log('effect', `removed ${labelOf(ref)}`);
    });
    bus.on('effect:expired', ({ ref }) => {
      if (active === tab) log('effect', `expired ${labelOf(ref)}`);
    });
    bus.on('trigger:fired', ({ on }) => {
      if (active === tab) log('trigger', `fired on ${on}`);
    });
    bus.on('trigger:roll', ({ on, value }) => {
      if (active === tab) log('trigger', `roll on ${on} → ${value}`);
    });
    return tab;
  }

  function addSheet(): void {
    const tab = makeSheet();
    tabs.push(tab);
    switchTab(tab.id);
  }

  function switchTab(id: string): void {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    active = tab;
    changedPaths = new Set();
    inspectedPath = null;
    refresh();
  }

  function closeTab(id: string): void {
    if (tabs.length <= 1) return;
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    tabs[index]!.engine.destroy();
    tabs.splice(index, 1);
    if (active.id === id) switchTab(tabs[Math.max(0, index - 1)]!.id);
    else refresh();
  }

  function renderTabs(): void {
    tabsEl.innerHTML =
      tabs
        .map(
          (tab) => `
        <div class="tab${tab.id === active.id ? ' on' : ''}" data-tab="${tab.id}">
          <span>${esc(String(tab.engine.document.identity.name ?? 'sheet'))}</span>
          ${tabs.length > 1 ? `<button class="tab-x" data-close="${tab.id}" title="Close sheet">×</button>` : ''}
        </div>`,
        )
        .join('') + `<button class="tab-add" id="tab-add" title="New sheet">+</button>`;
  }

  /* ---------------------------- library ---------------------------- */

  function renderLibrary(): void {
    const query = libSearch.value.trim().toLowerCase();
    const defs = allDefs().filter(
      (def) => !query || def.id.toLowerCase().includes(query) || def.label.toLowerCase().includes(query),
    );
    const groups = new Map<string, EffectDefinition[]>();
    for (const def of defs) {
      const cat = def.id.split('.')[0] ?? 'misc';
      const list = groups.get(cat) ?? [];
      list.push(def);
      groups.set(cat, list);
    }
    libList.innerHTML = [...groups.entries()]
      .map(
        ([cat, list]) => `
        <div class="lib-group">${cat}</div>
        ${list
          .map(
            (def) => `
          <div class="def-card" draggable="true" data-def="${def.id}" title="Drag onto the sheet or click to apply">
            <div class="def-top"><span class="def-label">${def.label}</span></div>
            <div class="def-changes">${def.changes.map((c) => `<div>${esc(changeSummary(c))}</div>`).join('')}</div>
            <div class="def-badges">${defBadges(def)}</div>
          </div>`,
          )
          .join('')}`,
      )
      .join('');
  }

  function applyDef(defId: string): void {
    try {
      const data = applyData();
      active.engine.applyEffect(defId, { source: { kind: 'manual' }, ...(data ? { data } : {}) });
      setStatus('ready', `applied ${labelOf(defId)}`);
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : String(error));
    }
  }

  /* ----------------------------- sheet ----------------------------- */

  function renderBase(): void {
    const flat = flatten(active.engine.document.base);
    baseEl.innerHTML = Object.entries(flat)
      .map(([path, v]) => {
        const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `
        <label class="base-field">
          <span>${path}</span>
          <input type="text" data-path="${path}" value="${esc(value)}" spellcheck="false" autocomplete="off" />
        </label>`;
      })
      .join('');
    sheetName.value = String(active.engine.document.identity.name ?? '');
  }

  function renderInstances(): void {
    const doc = active.engine.document;
    const computed = active.engine.compute();
    const suppressedIds = new Map(computed.suppressed.map((s) => [s.instance.id, s.reason]));
    if (doc.effects.length === 0) {
      instancesEl.innerHTML = '<div class="empty">no active effects — drag one from the library</div>';
      return;
    }
    instancesEl.innerHTML = doc.effects
      .map((instance) => {
        const ref = instance.ref ?? instance.inline?.id;
        const reason = suppressedIds.get(instance.id);
        const badges: string[] = [];
        if (instance.source.kind !== 'manual') badges.push(instance.source.kind);
        if (instance.expiresAt) {
          badges.push(
            instance.expiresAt.unit === 'until-event'
              ? `until ${instance.expiresAt.event}`
              : `${instance.expiresAt.remaining ?? ''} ${instance.expiresAt.unit}`.trim(),
          );
        }
        if (reason) badges.push(`suppressed:${reason}`);
        return `
        <div class="inst-row${instance.enabled ? '' : ' off'}${reason ? ' suppressed' : ''}">
          <label class="switch"><input type="checkbox" data-toggle="${instance.id}"${instance.enabled ? ' checked' : ''} /><span class="track"></span></label>
          <span class="inst-label">${labelOf(ref)}</span>
          ${badges.map((b) => `<span class="badge">${b}</span>`).join('')}
          <button class="mini-btn danger" data-remove="${instance.id}"><span>×</span></button>
        </div>`;
      })
      .join('');
  }

  function roll(templateId: string): void {
    try {
      const expr = active.engine.buildRoll(templateId);
      const notation = toFormula(expr);
      const result = evaluateRoll(expr, { scope: active.engine.compute().scope });
      active.lastRoll = `
        <div class="roll-line"><code>${esc(notation)}</code><b>${String(result.value)}</b></div>
        <div class="dice-row">${result.rolls.map(dieChip).join('')}</div>
      `;
      rollOutEl.innerHTML = active.lastRoll;
      log('roll', `${templateId} · ${esc(notation)} → <b>${String(result.value)}</b>`);
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : String(error));
    }
  }

  /* --------------------------- inspector --------------------------- */

  function renderValues(): void {
    const flat = flatten(active.engine.compute().scope);
    valuesEl.innerHTML = Object.entries(flat)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, v]) => {
        const classes = ['val-row'];
        if (changedPaths.has(path)) classes.push('changed');
        if (inspectedPath === path) classes.push('inspecting');
        return `<div class="${classes.join(' ')}" data-path="${path}"><span>${path}</span><b>${esc(JSON.stringify(v) ?? 'undefined')}</b></div>`;
      })
      .join('');
    changedPaths.clear();
  }

  function renderAudit(): void {
    if (!inspectedPath) {
      auditWrap.innerHTML = '';
      return;
    }
    const entries: AuditEntry[] = active.engine
      .compute()
      .audit.filter((entry) => entry.path === inspectedPath);
    auditWrap.innerHTML = `
      <div class="sheet-subhead">Why · ${inspectedPath}</div>
      <div class="audit-list">
        ${
          entries.length === 0
            ? '<div class="empty">straight from the base document — no effect touched this path</div>'
            : entries
                .map(
                  (entry) => `
            <div class="audit-row">
              <span class="badge">${entry.pass}</span>
              <span class="audit-ref">${entry.ref ?? entry.effectId}</span>
              <span class="audit-io">${entry.op ? `${entry.op} ` : ''}${esc(JSON.stringify(entry.input) ?? '—')} → <b>${esc(JSON.stringify(entry.result) ?? '—')}</b></span>
            </div>`,
                )
                .join('')
        }
      </div>`;
  }

  function renderSuppressed(): void {
    const suppressed = active.engine.compute().suppressed;
    if (suppressed.length === 0) {
      suppressedWrap.innerHTML = '';
      return;
    }
    suppressedWrap.innerHTML = `
      <div class="sheet-subhead">Suppressed</div>
      <div class="sheet-values">
        ${suppressed
          .map(
            (s) => `
          <div class="val-row suppressed">
            <span>${labelOf(s.instance.ref ?? s.instance.inline?.id)}</span>
            <b>${s.reason}</b>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  /* ---------------------------- refresh ---------------------------- */

  function refresh(): void {
    renderTabs();
    renderLibrary();
    renderBase();
    renderInstances();
    renderValues();
    renderAudit();
    renderSuppressed();
    rollOutEl.innerHTML = active.lastRoll;
  }

  /* ---------------------------- listeners --------------------------- */

  tabsEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const close = target.closest<HTMLButtonElement>('[data-close]');
    if (close) {
      event.stopPropagation();
      closeTab(close.dataset.close!);
      return;
    }
    if (target.closest('#tab-add')) {
      addSheet();
      return;
    }
    const tab = target.closest<HTMLElement>('[data-tab]');
    if (tab) switchTab(tab.dataset.tab!);
  });

  libSearch.addEventListener('input', renderLibrary);

  libList.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.def-card[data-def]');
    if (card) applyDef(card.dataset.def!);
  });

  libList.addEventListener('dragstart', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.def-card[data-def]');
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', card.dataset.def!);
    event.dataTransfer.effectAllowed = 'copy';
    card.classList.add('dragging');
  });

  libList.addEventListener('dragend', () => {
    for (const card of libList.querySelectorAll('.def-card.dragging')) card.classList.remove('dragging');
  });

  customToggle.addEventListener('click', () => {
    customEditor.classList.toggle('open');
  });

  $<HTMLButtonElement>('#custom-register').addEventListener('click', () => {
    try {
      const def = JSON.parse(customJson.value) as EffectDefinition;
      const parsed = tabs[0]!.engine.registerDefinition(def);
      for (const tab of tabs.slice(1)) tab.engine.registerDefinition(parsed);
      customDefs.push(parsed);
      renderLibrary();
      setStatus('ready', `registered ${parsed.id}`);
      log('custom', `registered ${parsed.id}`);
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : String(error));
    }
  });

  let dragDepth = 0;
  sheetPane.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    sheetPane.classList.add('drop-target');
  });
  sheetPane.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  sheetPane.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) sheetPane.classList.remove('drop-target');
  });
  sheetPane.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    sheetPane.classList.remove('drop-target');
    const defId = event.dataTransfer?.getData('text/plain');
    if (defId && allDefs().some((d) => d.id === defId)) applyDef(defId);
  });

  baseEl.addEventListener('change', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-path]');
    if (!input) return;
    const doc = structuredClone(active.engine.document);
    setPath(doc.base, input.dataset.path!, parseValue(input.value));
    active.engine.loadDocument(doc);
    log('base', `${input.dataset.path} → ${input.value}`);
    refresh();
  });

  sheetName.addEventListener('change', () => {
    const doc = structuredClone(active.engine.document);
    doc.identity.name = sheetName.value;
    active.engine.loadDocument(doc);
    refresh();
  });

  $<HTMLButtonElement>('#add-btn').addEventListener('click', () => {
    const path = $<HTMLInputElement>('#add-path').value.trim();
    if (!path) return;
    const doc = structuredClone(active.engine.document);
    setPath(doc.base, path, parseValue($<HTMLInputElement>('#add-value').value));
    active.engine.loadDocument(doc);
    log('base', `${path} set`);
    refresh();
  });

  instancesEl.addEventListener('change', (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-toggle]');
    if (toggle) active.engine.setEnabled(toggle.dataset.toggle!, toggle.checked);
  });

  instancesEl.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-remove]');
    if (btn) active.engine.removeEffect(btn.dataset.remove!);
  });

  $<HTMLDivElement>('.sheet-clock').addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const eventBtn = target.closest<HTMLButtonElement>('button[data-event]');
    if (eventBtn) {
      active.engine.notifyEvent(eventBtn.dataset.event!);
      log('clock', eventBtn.dataset.event!);
      return;
    }
    if (target.closest('#tick')) {
      const seconds = Number($<HTMLInputElement>('#tick-n').value) || 0;
      active.engine.tickSeconds(seconds);
      log('clock', `tick ${seconds}s`);
      refresh();
      return;
    }
    if (target.closest('#emit')) {
      const name = $<HTMLInputElement>('#custom-event').value.trim();
      if (!name) return;
      active.engine.notifyEvent(name);
      log('clock', `emit ${name}`);
    }
  });

  rollsEl.innerHTML = Object.keys(pack.rollTemplates ?? {})
    .map((id) => `<button class="chip" data-roll="${id}">${id}</button>`)
    .join('');

  rollsEl.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-roll]');
    if (chip) roll(chip.dataset.roll!);
  });

  $<HTMLButtonElement>('#doc-export').addEventListener('click', () => {
    void navigator.clipboard
      .writeText(JSON.stringify(active.engine.document, null, 2))
      .then(() => setStatus('ready', 'document JSON copied to clipboard'));
  });

  $<HTMLButtonElement>('#doc-import').addEventListener('click', () => {
    const text = window.prompt('Paste a CharacterDocument JSON');
    if (!text) return;
    try {
      active.engine.loadDocument(JSON.parse(text));
      setStatus('ready', 'document imported');
      refresh();
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : String(error));
    }
  });

  $<HTMLButtonElement>('#clear-manual').addEventListener('click', () => {
    const removed = active.engine.removeBySource({ kind: 'manual' });
    log('effect', `cleared ${removed.length} manual effect(s)`);
    refresh();
  });

  valuesEl.addEventListener('click', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.val-row[data-path]');
    if (!row) return;
    inspectedPath = inspectedPath === row.dataset.path ? null : row.dataset.path!;
    renderValues();
    renderAudit();
  });

  /* ------------------------------ boot ------------------------------ */

  tabs.push(makeSheet());
  active = tabs[0]!;
  setStatus('ready', `${pack.id} · drag effects onto the sheet`);
  log('engine', 'sheet engine ready');
  refresh();

  return () => {
    for (const tab of tabs) tab.engine.destroy();
  };
}
