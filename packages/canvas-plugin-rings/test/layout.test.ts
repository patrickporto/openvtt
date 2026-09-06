import { describe, expect, it } from 'bun:test';
import { dashedArcs, DEFAULT_RING_LAYOUT, ringRadius, ringSlots, sortRingsForLayout } from '../src/layout';

describe('DEFAULT_RING_LAYOUT', () => {
  it('matches the documented defaults', () => {
    expect(DEFAULT_RING_LAYOUT).toEqual({ spread: 'outward', gap: 6, startInset: 2 });
  });
});

describe('ringSlots', () => {
  it('spreads outward from the token edge by default', () => {
    expect(ringSlots(3)).toEqual([
      { index: 0, inset: 2 },
      { index: 1, inset: 8 },
      { index: 2, inset: 14 },
    ]);
  });

  it('spreads inward when configured', () => {
    const slots = ringSlots(3, { spread: 'inward', gap: 4, startInset: 1 });
    expect(slots).toEqual([
      { index: 0, inset: -1 },
      { index: 1, inset: -5 },
      { index: 2, inset: -9 },
    ]);
  });

  it('returns an empty array for zero rings', () => {
    expect(ringSlots(0)).toEqual([]);
  });

  it('honors custom gap and startInset', () => {
    const slots = ringSlots(2, { spread: 'outward', gap: 10, startInset: 5 });
    expect(slots.map((slot) => slot.inset)).toEqual([5, 15]);
  });
});

describe('sortRingsForLayout', () => {
  it('sorts by order ascending', () => {
    const rings = [{ id: 'c', order: 3 }, { id: 'a', order: 1 }, { id: 'b', order: 2 }];
    expect(sortRingsForLayout(rings).map((ring) => ring.id)).toEqual(['a', 'b', 'c']);
  });

  it('treats missing order as zero', () => {
    const rings = [{ id: 'a', order: 1 }, { id: 'z' }, { id: 'b', order: -1 }];
    expect(sortRingsForLayout(rings).map((ring) => ring.id)).toEqual(['b', 'z', 'a']);
  });

  it('breaks ties by id ascending', () => {
    const rings = [
      { id: '0192b', order: 0 },
      { id: '0192a', order: 0 },
      { id: '0192c', order: 0 },
    ];
    expect(sortRingsForLayout(rings).map((ring) => ring.id)).toEqual(['0192a', '0192b', '0192c']);
  });

  it('does not mutate the input', () => {
    const rings = [{ id: 'b', order: 2 }, { id: 'a', order: 1 }];
    const copy = rings.map((ring) => ({ ...ring }));
    sortRingsForLayout(rings);
    expect(rings).toEqual(copy);
  });
});

describe('ringRadius', () => {
  it('adds the inset to the token radius', () => {
    expect(ringRadius(40, 4)).toBe(44);
    expect(ringRadius(40, -6)).toBe(34);
  });

  it('clamps to a minimum of 1', () => {
    expect(ringRadius(10, -20)).toBe(1);
    expect(ringRadius(0, 0)).toBe(1);
  });
});

describe('dashedArcs', () => {
  it('returns a solid arc for an empty dash pattern', () => {
    expect(dashedArcs(10, [])).toEqual([{ start: 0, end: Math.PI * 2 }]);
  });

  it('returns a solid arc for an all-zero dash pattern', () => {
    expect(dashedArcs(10, [0, 0])).toEqual([{ start: 0, end: Math.PI * 2 }]);
  });

  it('returns a solid arc for a non-finite radius', () => {
    expect(dashedArcs(Number.NaN, [4, 4])).toEqual([{ start: 0, end: Math.PI * 2 }]);
    expect(dashedArcs(Number.POSITIVE_INFINITY, [4, 4])).toEqual([{ start: 0, end: Math.PI * 2 }]);
  });

  it('alternates on and off segments starting with on', () => {
    const twoPi = 8;
    expect(dashedArcs(1, [2, 2], twoPi)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
  });

  it('wraps the circle ending exactly at twoPi', () => {
    const arcs = dashedArcs(1, [6, 2], 8);
    expect(arcs).toEqual([{ start: 0, end: 6 }]);
    expect(arcs[0].end).toBe(8 - 2);
  });

  it('produces non-overlapping arcs within [0, twoPi] with half coverage', () => {
    const twoPi = Math.PI * 2;
    const arcs = dashedArcs(10, [4, 4]);
    expect(arcs.length).toBeGreaterThan(1);
    let total = 0;
    for (let i = 0; i < arcs.length; i++) {
      expect(arcs[i].start).toBeGreaterThanOrEqual(-1e-9);
      expect(arcs[i].end).toBeLessThanOrEqual(twoPi + 1e-9);
      expect(arcs[i].end).toBeGreaterThan(arcs[i].start);
      if (i > 0) {
        expect(arcs[i].start).toBeGreaterThanOrEqual(arcs[i - 1].end - 1e-9);
      }
      total += arcs[i].end - arcs[i].start;
    }
    expect(total * 10).toBeCloseTo(32, 6);
  });

  it('scales a pattern larger than the circumference', () => {
    const arcs = dashedArcs(10, [100, 100]);
    expect(arcs.length).toBe(1);
    expect(arcs[0].start).toBe(0);
    expect(arcs[0].end).toBeCloseTo(Math.PI, 9);
  });

  it('treats an odd-length pattern like SVG dasharray (values repeat)', () => {
    expect(dashedArcs(1, [2], 8)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
  });

  it('continues alternation across pattern repeats', () => {
    expect(dashedArcs(1, [2, 2, 2], 12)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
      { start: 8, end: 10 },
    ]);
  });
});
