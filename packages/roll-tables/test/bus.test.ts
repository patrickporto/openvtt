import { describe, expect, it } from 'bun:test';
import { createTable } from '../src';

describe('bus events and hooks', () => {
  it('emits draw and entry:selected', () => {
    const table = createTable({
      name: 'Evt',
      entries: [{ type: 'text', text: 'x', weight: 1 }],
    });
    const events: string[] = [];
    table.bus.on('entry:selected', () => events.push('selected'));
    table.bus.on('draw', () => events.push('draw'));
    table.draw({ count: 2, seed: 'evt' });
    expect(events).toEqual(['selected', 'selected', 'draw']);
  });

  it('beforeDraw can change count and pool', () => {
    const table = createTable({
      name: 'Hook',
      entries: [
        { type: 'text', text: 'a', weight: 1 },
        { type: 'text', text: 'b', weight: 1 },
      ],
    });
    table.bus.tap('beforeDraw', 'only-b', (ctx) => ({
      ...ctx,
      count: 1,
      pool: ctx.pool.filter((e: { text?: string }) => e.text === 'b'),
    }));
    const result = table.draw({ count: 5, seed: 'hook' });
    expect(result.count).toBe(1);
    expect(result.draws[0].text).toBe('b');
  });

  it('beforeResolve transforms results', () => {
    const table = createTable({
      name: 'Trans',
      entries: [{ type: 'text', text: 'sem sorte', weight: 1 }],
    });
    table.bus.tap('beforeResolve', 'curse', (ctx) => ({
      ...ctx,
      result: { ...ctx.result, text: 'AMALDICOADO: sem sorte' },
    }));
    const result = table.draw({ seed: 'curse' });
    expect(result.draws[0].text).toBe('AMALDICOADO: sem sorte');
  });

  it('afterDraw observes the finished draw', () => {
    const table = createTable({
      name: 'After',
      entries: [{ type: 'text', text: 'x', weight: 1 }],
    });
    let observed = -1;
    table.bus.tap('afterDraw', 'watcher', (ctx) => {
      observed = ctx.count;
    });
    table.draw({ count: 3, seed: 'after' });
    expect(observed).toBe(3);
  });

  it('emits error event when a draw fails', () => {
    const table = createTable({
      name: 'Err',
      entries: [{ type: 'table', tableRef: 'Nada', weight: 1 }],
    });
    const errors: string[] = [];
    table.bus.on('error', (p) => errors.push(p.code));
    expect(() => table.draw({ seed: 'err' })).toThrow();
    expect(errors).toEqual(['unknown-table-ref']);
  });
});
