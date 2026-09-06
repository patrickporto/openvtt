import { formatCombo, type ActionInfo } from '@openvtt/hotkeys';
import { hotkeys } from '../hotkeys';

const DEMO_CONTEXT = 'demo';

let vetoActive = false;

hotkeys.bus.tap('beforeHotkey', 'lab-veto', (ctx) =>
  ctx.action === 'demo:vetoed' && vetoActive ? { ...ctx, veto: true } : undefined,
);

export function renderHotkeys(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="hotkeys-page">
      <header class="page-title">
        <h1>Hotkeys Lab</h1>
        <p>@openvtt/hotkeys</p>
      </header>

      <div class="hotkeys-grid">
        <section class="panel hk-panel">
          <div class="hk-panel-head">
            <h2>Actions</h2>
            <button class="btn ghost" id="hk-reset">Reset all</button>
          </div>
          <div class="hk-actions" id="hk-actions"></div>
          <div class="hk-conflicts" id="hk-conflicts"></div>
        </section>

        <section class="panel hk-panel">
          <div class="hk-panel-head">
            <h2>Event log</h2>
            <button class="btn ghost" id="hk-clear">Clear</button>
          </div>
          <div class="log-body hk-log" id="hk-log"></div>
        </section>

        <section class="panel hk-panel">
          <div class="hk-panel-head"><h2>Contexts</h2></div>
          <div class="hk-contexts">
            <label class="switch hk-ctx"><b>demo</b><input id="hk-ctx-demo" type="checkbox" /><span class="track"></span></label>
          </div>
          <p class="hk-note">A action <code>playground/demo:scoped</code> só dispara com o contexto <code>demo</code> ativo.</p>
        </section>

        <section class="panel hk-panel">
          <div class="hk-panel-head"><h2>Input fields</h2></div>
          <div class="hk-inputs">
            <input id="hk-plain" type="text" placeholder="typing here does NOT trigger hotkeys (skipInputs)" spellcheck="false" autocomplete="off" />
            <p class="hk-note"><code>playground/demo:in-inputs</code> (<kbd>Alt+Enter</kbd>) tem <code>allowInInputs</code> — funciona mesmo dentro do input.</p>
          </div>
        </section>

        <section class="panel hk-panel">
          <div class="hk-panel-head"><h2>Veto hook</h2></div>
          <div class="hk-veto">
            <label class="switch hk-ctx"><b>block <code>playground/demo:vetoed</code> via <code>beforeHotkey</code></b><input id="hk-veto" type="checkbox" /><span class="track"></span></label>
          </div>
        </section>
      </div>

      <div class="hk-hint">
        <kbd>H</kbd> log &nbsp;·&nbsp; <kbd>Ctrl+K</kbd> konami &nbsp;·&nbsp; <kbd>F6</kbd> scoped &nbsp;·&nbsp; <kbd>Alt+Enter</kbd> in-inputs &nbsp;·&nbsp; <kbd>Shift+X</kbd> vetoed &nbsp;·&nbsp; <kbd>T</kbd> hold (repeat)
      </div>
    </div>
  `;

  const actionsEl = root.querySelector<HTMLDivElement>('#hk-actions')!;
  const conflictsEl = root.querySelector<HTMLDivElement>('#hk-conflicts')!;
  const logEl = root.querySelector<HTMLDivElement>('#hk-log')!;
  const ctxToggle = root.querySelector<HTMLInputElement>('#hk-ctx-demo')!;
  const vetoToggle = root.querySelector<HTMLInputElement>('#hk-veto')!;

  let holdCount = 0;

  const log = (key: string, msg: string): void => {
    const line = document.createElement('div');
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    line.innerHTML = `<span class="t">${time}</span><span class="k">${key}</span> ${msg}`;
    logEl.prepend(line);
    while (logEl.childElementCount > 80) logEl.lastChild?.remove();
  };

  hotkeys.register('playground', 'demo:log', {
    name: 'Log demo',
    binds: ['KeyH'],
    onDown: () => {
      log('demo:log', 'hello from H');
      return true;
    },
  });
  hotkeys.register('playground', 'demo:konami', {
    name: 'Konami chord',
    binds: ['Ctrl+KeyK'],
    onDown: () => {
      log('demo:konami', 'ctrl+k fired');
      return true;
    },
  });
  hotkeys.register('playground', 'demo:scoped', {
    name: 'Scoped to demo context',
    binds: ['F6'],
    context: DEMO_CONTEXT,
    onDown: () => {
      log('demo:scoped', 'f6 with demo context');
      return true;
    },
  });
  hotkeys.register('playground', 'demo:in-inputs', {
    name: 'Works inside inputs',
    binds: ['Alt+Enter'],
    allowInInputs: true,
    onDown: () => {
      log('demo:in-inputs', 'alt+enter (inputs allowed)');
      return true;
    },
  });
  hotkeys.register('playground', 'demo:vetoed', {
    name: 'Veto target',
    binds: ['Shift+X'],
    onDown: () => {
      log('demo:vetoed', 'shift+x passed the hook');
      return true;
    },
  });
  hotkeys.register('playground', 'demo:hold', {
    name: 'Hold T (repeat)',
    binds: ['KeyT'],
    repeat: true,
    onDown: () => {
      holdCount += 1;
      log('demo:hold', `repeat tick #${holdCount}`);
      return true;
    },
  });

  let rebinding: { namespace: string; action: string } | null = null;

  function renderActions(): void {
    const items = hotkeys.listActions();
    actionsEl.innerHTML = '';
    if (items.length === 0) {
      actionsEl.innerHTML = '<p class="hk-note">No actions registered.</p>';
    }
    for (const info of items) {
      actionsEl.appendChild(actionRow(info));
    }
    renderConflicts();
  }

  function actionRow(info: ActionInfo): HTMLElement {
    const row = document.createElement('div');
    row.className = 'hk-action';
    const id = `${info.namespace}/${info.action}`;
    const binds = info.binds.map((bind) => formatCombo(bind));
    const labels = binds.length > 0 ? binds.join(' · ') : '(no binds)';
    row.innerHTML = `
      <div class="hk-action-info">
        <b>${id}</b>
        <span class="hk-meta">${info.name}${info.context !== 'global' ? ` · ctx ${info.context}` : ''}${info.editable ? '' : ' · locked'}</span>
      </div>
      <div class="hk-action-binds">
        <span class="hk-binds${info.hasOverride ? ' overridden' : ''}" title="${info.hasOverride ? 'overridden' : 'defaults'}">${labels}</span>
        <button class="btn ghost hk-btn" data-rebind>rebind</button>
        <button class="btn ghost hk-btn" data-reset ${info.hasOverride ? '' : 'disabled'}>reset</button>
      </div>
    `;
    row.querySelector<HTMLButtonElement>('[data-rebind]')!.addEventListener('click', () => {
      rebinding = { namespace: info.namespace, action: info.action };
      row.classList.add('capturing');
      row.querySelector<HTMLSpanElement>('.hk-binds')!.textContent = 'press a combo…';
    });
    row.querySelector<HTMLButtonElement>('[data-reset]')!.addEventListener('click', () => {
      hotkeys.reset(info.namespace, info.action);
      log('reset', id);
    });
    return row;
  }

  function renderConflicts(): void {
    const conflicts = hotkeys.conflicts();
    conflictsEl.innerHTML = '';
    if (conflicts.length === 0) return;
    const box = document.createElement('div');
    box.className = 'hk-conflict-box';
    box.innerHTML = `<b>Conflicts</b>`;
    for (const conflict of conflicts) {
      const line = document.createElement('div');
      line.className = 'hk-conflict-line';
      line.innerHTML = `<span class="k">${conflict.combo}</span> ${conflict.actions.map((a) => `${a.namespace}/${a.action}`).join(' vs ')}`;
      box.appendChild(line);
    }
    conflictsEl.appendChild(box);
  }

  function captureBind(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!rebinding) return;
    const code = event.code;
    if (code === 'ControlLeft' || code === 'ControlRight' || code === 'AltLeft' || code === 'AltRight' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'MetaLeft' || code === 'MetaRight') return;
    const modifiers: string[] = [];
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.altKey) modifiers.push('alt');
    if (event.shiftKey) modifiers.push('shift');
    if (event.metaKey) modifiers.push('meta');
    const combo = [...modifiers, code].join('+');
    const target = rebinding;
    rebinding = null;
    try {
      hotkeys.setBinds(target.namespace, target.action, [combo]);
      log('rebind', `${target.namespace}/${target.action} → ${combo}`);
    } catch (error) {
      log('rebind:error', error instanceof Error ? error.message : String(error));
    }
  }

  const offTriggered = hotkeys.bus.on('hotkeyTriggered', (payload) => {
    log('triggered', `${payload.namespace}/${payload.action} · ${payload.combo} · ${payload.phase}${payload.repeat ? ' · repeat' : ''}`);
  });
  const offChanged = hotkeys.bus.on('bindsChanged', () => renderActions());
  const offError = hotkeys.bus.on('hotkeyError', (payload) => {
    log('error', `${payload.namespace}/${payload.action} · ${payload.message}`);
  });

  const capture = (event: KeyboardEvent): void => {
    if (!rebinding) return;
    captureBind(event);
  };
  window.addEventListener('keydown', capture, true);

  ctxToggle.checked = hotkeys.activeContexts().includes(DEMO_CONTEXT);
  ctxToggle.addEventListener('change', () => {
    if (ctxToggle.checked) hotkeys.activateContext(DEMO_CONTEXT);
    else hotkeys.deactivateContext(DEMO_CONTEXT);
    log('contexts', hotkeys.activeContexts().join(', ') || '(none)');
  });

  vetoToggle.addEventListener('change', () => {
    vetoActive = vetoToggle.checked;
    log('hook', vetoActive ? 'veto tap enabled' : 'veto tap disabled');
  });

  root.querySelector<HTMLButtonElement>('#hk-clear')!.addEventListener('click', () => {
    logEl.innerHTML = '';
  });
  root.querySelector<HTMLButtonElement>('#hk-reset')!.addEventListener('click', () => {
    hotkeys.resetAll();
    log('reset', 'all overrides cleared');
  });

  renderActions();
  log('ready', 'press any registered combo — try H, Ctrl+K, T (hold)');

  return () => {
    window.removeEventListener('keydown', capture, true);
    offTriggered();
    offChanged();
    offError();
    vetoActive = false;
    hotkeys.unregister('playground');
    if (hotkeys.activeContexts().includes(DEMO_CONTEXT)) hotkeys.deactivateContext(DEMO_CONTEXT);
  };
}
