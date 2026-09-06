import { describe, expect, it } from 'bun:test';
import { createResolver, createTable, TableError } from '../src';

describe('nested tables', () => {
  it('resolves table entries through the resolver', () => {
    const inner = createTable({
      name: 'Gema',
      entries: [{ type: 'text', text: 'Rubi', weight: 1 }],
    });
    const outer = createTable(
      {
        name: 'Tesouro',
        entries: [{ type: 'table', tableRef: 'Gema', weight: 1 }],
      },
      { resolver: createResolver([inner]) },
    );
    const result = outer.draw({ seed: 'nested' });
    const draw = result.draws[0];
    expect(draw.nested).toBeDefined();
    expect(draw.nested!.tableName).toBe('Gema');
    expect(draw.nested!.draws[0].text).toBe('Rubi');
  });

  it('shares the seeded rng across the cascade', () => {
    const make = () => {
      const inner = createTable({
        name: 'Inner',
        entries: [
          { type: 'text', text: 'x', weight: 1 },
          { type: 'text', text: 'y', weight: 1 },
        ],
      });
      const outer = createTable(
        { name: 'Outer', entries: [{ type: 'table', tableRef: 'Inner', weight: 1 }] },
        { resolver: createResolver([inner]) },
      );
      return outer.draw({ seed: 'cascade' });
    };
    const a = make();
    const b = make();
    expect(a.draws[0].nested!.draws[0].text).toBe(b.draws[0].nested!.draws[0].text);
  });

  it('detects cycles', () => {
    const a = createTable({ name: 'A', entries: [{ type: 'table', tableRef: 'B', weight: 1 }] });
    const b = createTable({ name: 'B', entries: [{ type: 'table', tableRef: 'A', weight: 1 }] });
    const resolver = createResolver([a, b]);
    const withResolver = createTable(
      { name: 'A2', entries: [{ type: 'table', tableRef: a.id, weight: 1 }] },
      { resolver },
    );
    expect(() => withResolver.draw({ seed: 'cycle' })).toThrowError(TableError);
    try {
      withResolver.draw({ seed: 'cycle' });
    } catch (err) {
      expect((err as TableError).code).toBe('cycle-detected');
    }
  });

  it('enforces maxDepth', () => {
    const deep = createTable({
      name: 'Deep',
      entries: [{ type: 'text', text: 'fundo', weight: 1 }],
    });
    const mid = createTable(
      { name: 'Mid', entries: [{ type: 'table', tableRef: 'Deep', weight: 1 }] },
      { resolver: createResolver([deep]) },
    );
    const top = createTable(
      { name: 'Top', entries: [{ type: 'table', tableRef: 'Mid', weight: 1 }] },
      { resolver: createResolver([mid, deep]), maxDepth: 1 },
    );
    try {
      top.draw({ seed: 'depth' });
      expect.unreachable();
    } catch (err) {
      expect((err as TableError).code).toBe('max-depth');
    }
  });

  it('throws on unknown table refs', () => {
    const table = createTable({
      name: 'Orfã',
      entries: [{ type: 'table', tableRef: 'Inexistente', weight: 1 }],
    });
    try {
      table.draw({ seed: 'missing' });
      expect.unreachable();
    } catch (err) {
      expect((err as TableError).code).toBe('unknown-table-ref');
    }
  });

  it('emits table:nested when descending', () => {
    const inner = createTable({ name: 'In', entries: [{ type: 'text', text: 'i', weight: 1 }] });
    const outer = createTable(
      { name: 'Out', entries: [{ type: 'table', tableRef: 'In', weight: 1 }] },
      { resolver: createResolver([inner]) },
    );
    const seen: string[] = [];
    outer.bus.on('table:nested', (p) => {
      seen.push(p.tableRef);
    });
    outer.draw({ seed: 'ev' });
    expect(seen).toEqual(['In']);
  });
});
