import {
  TableError,
  type RandomTable,
  type TableDef,
} from '@openvtt/roll-tables';
import { flattenDraw, type RollTablesRegistry } from '@openvtt/canvas-plugin-roll-tables';

export interface RollTablesWindowHooks {
  log?: (key: string, message: string) => void;
  onTablesChanged?: () => void;
}

export function tableToDef(table: RandomTable): TableDef {
  return {
    id: table.id,
    name: table.name,
    description: table.description,
    formula: table.formula,
    replacement: table.replacement,
    reshuffle: table.reshuffle,
    displayRoll: table.displayRoll,
    entries: table.tableEntries.map(({ condition: _condition, ...entry }) => entry),
  };
}

const ROW = 'display:flex;align-items:center;gap:6px;width:100%';
const LABEL = 'flex:1;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
const DIM = 'font-size:10px;opacity:.55';
const INPUT =
  'background:transparent;border:1px solid rgba(255,255,255,.15);border-radius:5px;color:inherit;font:inherit;padding:2px 6px;font-size:11px';
const BTN =
  'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:5px;color:inherit;font:inherit;padding:2px 8px;font-size:11px;cursor:pointer';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cssText: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = cssText;
  if (text != null) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', BTN, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function buildRollTablesWindow(
  registry: RollTablesRegistry,
  hooks: RollTablesWindowHooks = {},
): HTMLElement {
  const root = el('div', 'display:flex;flex-direction:column;gap:10px;min-width:260px');
  const list = el('div', 'display:flex;flex-direction:column;gap:8px');
  const detail = el('div', '');
  root.append(list, detail);

  const emitChange = (): void => {
    renderList();
    hooks.onTablesChanged?.();
  };

  const draw = (table: RandomTable): void => {
    try {
      const result = registry.draw(table.id);
      const texts = flattenDraw(result);
      hooks.log?.('roll-table', `${table.name} → ${texts.join(', ')}`);
    } catch (error) {
      const code = error instanceof TableError ? error.code : 'error';
      hooks.log?.('roll-table', `${table.name} · ${code}`);
    }
    emitChange();
  };

  const openEditor = (table: RandomTable): void => {
    detail.innerHTML = '';
    detail.append(buildEditor(table));
  };

  const buildEditor = (table: RandomTable): HTMLElement => {
    const def = tableToDef(table);
    const entries = def.entries.map((entry) => ({ ...entry }));

    const wrap = el('div', 'display:flex;flex-direction:column;gap:6px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px');
    wrap.append(el('div', 'font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;opacity:.7', `Edit · ${def.name}`));

    const rows = el('div', 'display:flex;flex-direction:column;gap:4px');
    const renderRows = (): void => {
      rows.innerHTML = '';
      entries.forEach((entry, index) => {
        const row = el('div', ROW);
        const text = el('input', `${INPUT};flex:1;min-width:60px`);
        text.value = entry.text ?? entry.formula ?? entry.tableRef ?? '';
        text.placeholder = 'text / [[formula]]';
        text.addEventListener('input', () => {
          entry.text = text.value;
        });
        const weight = el('input', `${INPUT};width:44px;text-align:right`);
        weight.type = 'number';
        weight.min = '0';
        weight.value = String(entry.weight ?? 1);
        weight.addEventListener('input', () => {
          entry.weight = Math.max(0, Number(weight.value) || 0);
        });
        row.append(text, weight, button('✕', () => {
          entries.splice(index, 1);
          renderRows();
        }));
        rows.append(row);
      });
    };
    renderRows();

    const actions = el('div', ROW);
    actions.append(
      button('+ entry', () => {
        entries.push({ type: 'text', text: '', weight: 1 });
        renderRows();
      }),
      button('Save', () => {
        registry.unregister(table.id);
        registry.register({ ...def, entries });
        detail.innerHTML = '';
        hooks.log?.('roll-table', `${def.name} saved (${entries.length} entries)`);
        emitChange();
      }),
      button('Close', () => {
        detail.innerHTML = '';
      }),
    );
    wrap.append(rows, actions);
    return wrap;
  };

  const probabilityBars = (table: RandomTable): HTMLElement => {
    const wrap = el('div', 'display:flex;flex-direction:column;gap:2px;margin-top:4px');
    const byId = new Map(table.tableEntries.map((entry) => [entry.id, entry]));
    for (const p of table.probability()) {
      const entry = byId.get(p.entryId);
      const row = el('div', ROW);
      row.append(el('span', `${DIM};width:34px;text-align:right`, `${(p.probability * 100).toFixed(1)}%`));
      const track = el('div', 'flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden');
      const fill = el('div', `height:100%;background:rgba(142,111,247,.75);width:${(p.probability * 100).toFixed(2)}%`);
      track.append(fill);
      row.append(track, el('span', `${DIM};max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`, entry?.text ?? entry?.formula ?? entry?.tableRef ?? '?'));
      wrap.append(row);
    }
    return wrap;
  };

  const renderList = (): void => {
    list.innerHTML = '';
    const tables = registry.list();
    if (tables.length === 0) {
      list.append(el('div', DIM, 'No tables registered'));
      return;
    }
    for (const table of tables) {
      const card = el('div', 'display:flex;flex-direction:column;gap:4px;padding:6px;border:1px solid rgba(255,255,255,.1);border-radius:6px');
      const head = el('div', ROW);
      head.append(
        el('span', LABEL, table.name),
        el('span', DIM, table.replacement ? `${table.tableEntries.length} entries` : `deck ${table.remainingCount}/${table.tableEntries.length}`),
        button('Draw', () => draw(table)),
        button('Edit', () => openEditor(table)),
      );
      card.append(head);
      if (!table.replacement && table.drawnCount > 0) {
        card.firstChild!.appendChild(button('Reset deck', () => {
          table.reset();
          hooks.log?.('roll-table', `${table.name} · deck reset`);
          emitChange();
        }));
      }
      card.append(probabilityBars(table));
      list.append(card);
    }
  };

  renderList();
  return root;
}
