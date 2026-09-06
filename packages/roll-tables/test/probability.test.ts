import { describe, expect, it } from 'bun:test';
import { createTable } from '../src';

describe('probability', () => {
  it('computes exact single-draw distribution', () => {
    const table = createTable({
      name: 'P',
      entries: [
        { type: 'text', text: 'a', weight: 1 },
        { type: 'text', text: 'b', weight: 2 },
        { type: 'text', text: 'c', weight: 1 },
      ],
    });
    const probs = table.probability();
    expect(probs.map((p) => p.probability)).toEqual([0.25, 0.5, 0.25]);
    expect(probs[0].range).toEqual([0, 1]);
    expect(probs[1].range).toEqual([1, 3]);
    expect(probs[2].range).toEqual([3, 4]);
  });

  it('returns empty for zero total weight', () => {
    const table = createTable({
      name: 'Z',
      entries: [{ type: 'text', text: 'a', weight: 0 }],
    });
    expect(table.probability()).toEqual([]);
  });

  it('matches empirical draws with a fixed seed', () => {
    const table = createTable({
      name: 'E',
      entries: [
        { type: 'text', text: 'a', weight: 1 },
        { type: 'text', text: 'b', weight: 3 },
      ],
    });
    const result = table.draw({ count: 2000, seed: 'empirical' });
    const b = result.draws.filter((d) => d.text === 'b').length / result.count;
    expect(b).toBeGreaterThan(0.7);
    expect(b).toBeLessThan(0.8);
  });
});
