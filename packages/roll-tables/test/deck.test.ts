import { describe, expect, it } from 'bun:test';
import { createTable, TableError } from '../src';

const deck = {
  name: 'Deck',
  replacement: false,
  entries: [
    { type: 'text', text: 'a', weight: 1 },
    { type: 'text', text: 'b', weight: 1 },
    { type: 'text', text: 'c', weight: 1 },
  ],
} as const;

describe('deck mode (no replacement)', () => {
  it('never repeats entries until exhausted', () => {
    const table = createTable({ ...deck, entries: [...deck.entries] });
    const result = table.draw({ count: 3, seed: 'deck' });
    const texts = result.draws.map((d) => d.text);
    expect(new Set(texts).size).toBe(3);
    expect(table.remainingCount).toBe(0);
  });

  it('stops drawing when the deck is exhausted with reshuffle never', () => {
    const table = createTable({ ...deck, entries: [...deck.entries] });
    const result = table.draw({ count: 10, seed: 'deck' });
    expect(result.count).toBe(3);
    expect(table.remainingCount).toBe(0);
  });

  it('reset makes the full deck available again', () => {
    const table = createTable({ ...deck, entries: [...deck.entries] });
    table.draw({ count: 3, seed: 'deck' });
    expect(table.remainingCount).toBe(0);
    table.reset();
    expect(table.remainingCount).toBe(3);
    const result = table.draw({ count: 2, seed: 'deck-2' });
    expect(result.count).toBe(2);
  });

  it('auto reshuffle keeps drawing past exhaustion', () => {
    const table = createTable({ ...deck, entries: [...deck.entries], reshuffle: 'auto' });
    const result = table.draw({ count: 5, seed: 'deck' });
    expect(result.count).toBe(5);
  });

  it('excludes drawn entries from probability', () => {
    const table = createTable({ ...deck, entries: [...deck.entries] });
    table.draw({ count: 1, seed: 'deck' });
    expect(table.probability()).toHaveLength(2);
  });

  it('emits deck:empty when exhausted', () => {
    const table = createTable({ ...deck, entries: [...deck.entries] });
    let emitted = 0;
    table.bus.on('deck:empty', () => {
      emitted += 1;
    });
    table.draw({ count: 5, seed: 'deck' });
    expect(emitted).toBe(1);
  });

  it('throws deck-exhausted on a fresh draw against an exhausted deck', () => {
    const table = createTable({ ...deck, entries: [...deck.entries] });
    table.draw({ count: 3, seed: 'deck' });
    try {
      table.draw({ seed: 'deck-again' });
      expect.unreachable();
    } catch (err) {
      expect((err as TableError).code).toBe('deck-exhausted');
    }
  });

  it('auto reshuffle does not hang when conditions exclude everything', () => {
    const table = createTable({
      name: 'Blocked',
      replacement: false,
      reshuffle: 'auto',
      entries: [{ type: 'text', text: 'x', weight: 1, condition: () => false }],
    });
    try {
      table.draw({ seed: 'blocked' });
      expect.unreachable();
    } catch (err) {
      expect((err as TableError).code).toBe('empty-table');
    }
  });

  it('rolls back deck state when a nested draw fails', () => {
    const broken = createTable({
      name: 'Broken',
      entries: [{ type: 'table', tableRef: 'Sumiu', weight: 1 }],
    });
    const table = createTable(
      {
        name: 'Outer',
        replacement: false,
        entries: [{ type: 'table', tableRef: 'Broken', weight: 1 }],
      },
      { resolver: { get: (ref) => (ref === 'Broken' ? broken : undefined) } },
    );
    expect(() => table.draw({ seed: 'rollback' })).toThrowError(TableError);
    expect(table.drawnCount).toBe(0);
    expect(table.remainingCount).toBe(1);
  });
});
