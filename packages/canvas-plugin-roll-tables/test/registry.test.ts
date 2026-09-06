import { describe, expect, it } from 'bun:test';
import { RandomTable, TableError, createTable } from '@openvtt/roll-tables';
import { RollTablesRegistry, flattenDraw } from '../src/registry';

const loot = {
  name: 'Loot',
  entries: [
    { type: 'text' as const, text: 'Nada', weight: 1 },
    { type: 'text' as const, text: 'Ouro [[2d6]]', weight: 1 },
  ],
};

describe('RollTablesRegistry', () => {
  it('registers defs and draws by name or id', () => {
    const registry = new RollTablesRegistry();
    const table = registry.register(loot);
    expect(registry.get(table.id)).toBe(table);
    expect(registry.get('Loot')).toBe(table);
    expect(registry.list()).toHaveLength(1);

    const result = registry.draw('Loot', { seed: 's' });
    expect(result.count).toBe(1);
  });

  it('registers existing RandomTable instances', () => {
    const registry = new RollTablesRegistry();
    const table = createTable(loot);
    expect(registry.register(table)).toBe(table);
    expect(registry.get(table.id)).toBe(table);
  });

  it('unregisters by id or name', () => {
    const registry = new RollTablesRegistry();
    const table = registry.register(loot);
    expect(registry.unregister('Loot')).toBe(true);
    expect(registry.get(table.id)).toBeUndefined();
    expect(registry.unregister(table.id)).toBe(false);
  });

  it('throws unknown-table-ref for unregistered draws', () => {
    const registry = new RollTablesRegistry();
    try {
      registry.draw('Nope');
      expect.unreachable();
    } catch (err) {
      expect((err as TableError).code).toBe('unknown-table-ref');
    }
  });

  it('wires registered defs into a shared resolver for nested tables', () => {
    const registry = new RollTablesRegistry();
    registry.register({ name: 'Inner', entries: [{ type: 'text', text: 'gem', weight: 1 }] });
    const outer = registry.register({
      name: 'Outer',
      entries: [{ type: 'table', tableRef: 'Inner', weight: 1 }],
    });
    const result = registry.draw(outer.id, { seed: 'nested' });
    expect(result.draws[0].nested?.draws[0].text).toBe('gem');
  });

  it('shares one bus across registered defs', () => {
    const registry = new RollTablesRegistry();
    const table = registry.register(loot);
    expect(table.bus).toBe(registry.bus);

    const seen: string[] = [];
    registry.bus.on('draw', (p) => seen.push(p.tableName));
    registry.draw(table.id, { seed: 'ev' });
    expect(seen).toEqual(['Loot']);
  });

  it('keeps instances with their own bus untouched', () => {
    const registry = new RollTablesRegistry();
    const table = createTable(loot);
    registry.register(table);
    expect(table.bus).not.toBe(registry.bus);
  });
});

describe('flattenDraw', () => {
  it('flattens nested results depth-first', () => {
    const registry = new RollTablesRegistry();
    registry.register({ name: 'A', entries: [{ type: 'text', text: 'a', weight: 1 }] });
    const mid = registry.register({ name: 'B', entries: [{ type: 'table', tableRef: 'A', weight: 1 }] });
    const top = registry.register({ name: 'C', entries: [{ type: 'table', tableRef: mid.id, weight: 1 }] });
    const texts = flattenDraw(registry.draw(top.id, { seed: 'flat' }));
    expect(texts).toEqual(['a']);
  });

  it('uses the value for formula entries without text', () => {
    const registry = new RollTablesRegistry();
    const table = registry.register({ name: 'F', entries: [{ type: 'formula', formula: '1d4', weight: 1 }] });
    const [text] = flattenDraw(registry.draw(table.id, { seed: 'f' }));
    expect(Number(text)).toBeGreaterThanOrEqual(1);
    expect(Number(text)).toBeLessThanOrEqual(4);
  });
});
