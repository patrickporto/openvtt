import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { RollTablesRegistry } from '@openvtt/canvas-plugin-roll-tables';
import { buildRollTablesWindow, tableToDef } from '../src/pages/rolltables-window';

const treasure = {
  name: 'Tesouro',
  entries: [
    { type: 'text' as const, text: 'Nada', weight: 5 },
    { type: 'text' as const, text: 'Ouro [[2d6]]', weight: 3 },
  ],
};

describe('buildRollTablesWindow', () => {
  let registry: RollTablesRegistry;

  beforeAll(() => {
    registry = new RollTablesRegistry();
  });

  it('lists registered tables with probability bars', () => {
    registry.register(treasure);
    const root = buildRollTablesWindow(registry);
    expect(root.textContent).toContain('Tesouro');
    expect(root.textContent).toContain('62.5%');
    expect(root.textContent).toContain('37.5%');
    expect(root.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('shows an empty state with no tables', () => {
    const empty = new RollTablesRegistry();
    const root = buildRollTablesWindow(empty);
    expect(root.textContent).toContain('No tables registered');
  });

  it('draws from the Draw button and logs the result', () => {
    const logs: string[] = [];
    const root = buildRollTablesWindow(registry, { log: (_k, msg) => logs.push(msg) });
    document.body.appendChild(root);
    const drawBtn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Draw')!;
    drawBtn.click();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/Tesouro → /);
    root.remove();
  });

  it('edits entries and saves keeping the table id', () => {
    const table = registry.get('Tesouro')!;
    const root = buildRollTablesWindow(registry);
    document.body.appendChild(root);

    const editBtn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!;
    editBtn.click();

    const saveBtn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
    const textInputs = root.querySelectorAll('input[type="text"], input:not([type])');
    (textInputs[0] as HTMLInputElement).value = 'Poeira';
    textInputs[0].dispatchEvent(new Event('input'));
    saveBtn.click();

    const updated = registry.get('Tesouro')!;
    expect(updated.id).toBe(table.id);
    expect(updated.tableEntries[0].text).toBe('Poeira');
    root.remove();
  });
});

describe('tableToDef', () => {
  it('round-trips a table into a def', () => {
    const registry = new RollTablesRegistry();
    const table = registry.register({ ...treasure, formula: '1d2' });
    const def = tableToDef(table);
    expect(def.id).toBe(table.id);
    expect(def.formula).toBe('1d2');
    expect(def.entries).toHaveLength(2);
    expect(def.replacement).toBe(true);
  });
});
