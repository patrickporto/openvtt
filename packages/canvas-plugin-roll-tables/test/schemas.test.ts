import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { RollTableAnchorSchema } from '../src/schemas';

describe('RollTableAnchorSchema', () => {
  it('parses a minimal anchor', () => {
    const data = v.parse(RollTableAnchorSchema, { x: 10, y: 20, tableId: 'Loot' });
    expect(data.x).toBe(10);
    expect(data.tableId).toBe('Loot');
    expect(data.label).toBeUndefined();
    expect(data.lastResult).toBeUndefined();
  });

  it('accepts color as number or string and persisted results', () => {
    const data = v.parse(RollTableAnchorSchema, {
      x: 0,
      y: 0,
      tableId: 't',
      label: 'Tesouro',
      color: '#8e6ff7',
      lastResult: 'Rubi',
    });
    expect(data.color).toBe('#8e6ff7');
    expect(data.lastResult).toBe('Rubi');
  });

  it('rejects anchors without tableId', () => {
    expect(() => v.parse(RollTableAnchorSchema, { x: 0, y: 0 })).toThrow();
  });
});
