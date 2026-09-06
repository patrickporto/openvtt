import { describe, expect, it } from 'bun:test';
import { createTable, TableError, type TableDef } from '../src';

const treasures: TableDef = {
  name: 'Tesouro',
  entries: [
    { type: 'text', text: 'Nada', weight: 5 },
    { type: 'text', text: 'Moedas de cobre', weight: 3 },
    { type: 'formula', text: 'Ouro', formula: '2d6', weight: 2 },
  ],
};

describe('RandomTable.draw', () => {
  it('draws one entry by default', () => {
    const table = createTable(treasures);
    const result = table.draw();
    expect(result.count).toBe(1);
    expect(result.draws).toHaveLength(1);
    expect(result.tableId).toBe(table.id);
  });

  it('is deterministic with a seed', () => {
    const a = createTable(treasures).draw({ seed: 'sessao-1' });
    const b = createTable(treasures).draw({ seed: 'sessao-1' });
    expect(a.draws.map((d) => d.text)).toEqual(b.draws.map((d) => d.text));
    expect(a.draws.map((d) => d.value)).toEqual(b.draws.map((d) => d.value));
  });

  it('evaluates formula entries', () => {
    const table = createTable({
      name: 'Ouro',
      entries: [{ type: 'formula', formula: '2d6', weight: 1 }],
    });
    const result = table.draw({ seed: 'gold' });
    const draw = result.draws[0];
    expect(draw.value).toBeGreaterThanOrEqual(2);
    expect(draw.value).toBeLessThanOrEqual(12);
    expect(draw.roll).toBeDefined();
  });

  it('evaluates inline [[...]] rolls in text', () => {
    const table = createTable({
      name: 'Loot',
      entries: [{ type: 'text', text: 'Voce acha [[2d6]] moedas', weight: 1 }],
    });
    const result = table.draw({ seed: 'inline' });
    const draw = result.draws[0];
    expect(draw.text).toMatch(/Voce acha \d+ moedas/);
    expect(draw.inlineRolls).toHaveLength(1);
  });

  it('rolls the table formula for draw count', () => {
    const table = createTable({
      name: 'Multi',
      formula: '1d4+1',
      entries: [{ type: 'text', text: 'x', weight: 1 }],
    });
    const result = table.draw({ seed: 'multi' });
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.count).toBeLessThanOrEqual(5);
    expect(result.countRoll).toBeDefined();
  });

  it('respects an explicit count override', () => {
    const table = createTable({ ...treasures, formula: '1d6' });
    const result = table.draw({ count: 7, seed: 'override' });
    expect(result.count).toBe(7);
    expect(result.countRoll).toBeUndefined();
  });

  it('throws on empty tables', () => {
    const table = createTable({ name: 'Vazia', entries: [] });
    expect(() => table.draw()).toThrowError(TableError);
  });

  it('count 0 is a no-op, even on empty tables', () => {
    const table = createTable({ name: 'Vazia', entries: [] });
    const result = table.draw({ count: 0 });
    expect(result.count).toBe(0);
    expect(result.draws).toEqual([]);
  });

  it('rejects invalid explicit counts', () => {
    const table = createTable(treasures);
    expect(() => table.draw({ count: 2.7 })).toThrowError(TableError);
    expect(() => table.draw({ count: -1 })).toThrowError(TableError);
    expect(() => table.draw({ count: NaN })).toThrowError(TableError);
  });
});

describe('weights, ranges and lookup', () => {
  it('uses range span as effective weight', () => {
    const table = createTable({
      name: 'Ranged',
      entries: [
        { type: 'text', text: 'a', range: [1, 5] },
        { type: 'text', text: 'b', range: [6, 10] },
      ],
    });
    const probs = table.probability();
    expect(probs[0].probability).toBeCloseTo(0.5);
    expect(probs[1].probability).toBeCloseTo(0.5);
  });

  it('lookup maps roll values to entries without consuming', () => {
    const table = createTable({
      name: 'Lookup',
      entries: [
        { type: 'text', text: 'a', range: [1, 5] },
        { type: 'text', text: 'b', range: [6, 10] },
      ],
    });
    expect(table.lookup(1)?.text).toBe('a');
    expect(table.lookup(5)?.text).toBe('a');
    expect(table.lookup(6)?.text).toBe('b');
    expect(table.lookup(10)?.text).toBe('b');
    expect(() => table.lookup(11)).toThrowError(TableError);
  });

  it('normalize rebalances weights to a target sum', () => {
    const table = createTable({
      name: 'Norm',
      entries: [
        { type: 'text', text: 'a', weight: 1 },
        { type: 'text', text: 'b', weight: 3 },
      ],
    });
    table.normalize(100);
    const probs = table.probability();
    expect(probs[0].probability).toBeCloseTo(0.25);
    expect(probs[1].probability).toBeCloseTo(0.75);
  });

  it('honors absolute range bands in lookup when all entries declare ranges', () => {
    const table = createTable({
      name: 'Bands',
      entries: [
        { type: 'text', text: 'alto', range: [50, 60] },
        { type: 'text', text: 'baixo', range: [1, 5] },
      ],
    });
    expect(table.lookup(55)?.text).toBe('alto');
    expect(table.lookup(3)?.text).toBe('baixo');
    expect(table.lookup(30)).toBeUndefined();
    expect(() => table.lookup(61)).toThrowError(TableError);
    const probs = table.probability();
    expect(probs[0].range).toEqual([50, 60]);
    expect(probs[1].range).toEqual([1, 5]);
  });

  it('zero-weight entries are never drawn', () => {
    const table = createTable({
      name: 'Zero',
      entries: [
        { type: 'text', text: 'nunca', weight: 0 },
        { type: 'text', text: 'sempre', weight: 1 },
      ],
    });
    const result = table.draw({ count: 20, seed: 'zero' });
    expect(result.draws.every((d) => d.text === 'sempre')).toBe(true);
  });
});

describe('conditional entries', () => {
  it('filters entries by condition', () => {
    const table = createTable({
      name: 'Cond',
      entries: [
        { type: 'text', text: 'comum', weight: 1 },
        { type: 'text', text: 'raro', weight: 1, condition: (ctx) => ctx.previous.length > 0 },
      ],
    });
    const result = table.draw({ count: 1, seed: 'cond' });
    expect(result.draws[0].text).toBe('comum');
  });
});
