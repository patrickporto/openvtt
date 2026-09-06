import { describe, expect, it } from 'bun:test';
import { clampToBounds, computeSnap, detectDockZone } from '../src/snap';

describe('computeSnap', () => {
  it('snaps left edges within threshold', () => {
    const snap = computeSnap({ x: 6, y: 100, width: 100, height: 100 }, [{ x: 0, y: 50, width: 200, height: 300 }], 12);
    expect(snap).not.toBeNull();
    expect(snap!.x).toBe(0);
    expect(snap!.y).toBe(100);
    expect(snap!.guides.length).toBe(1);
  });

  it('snaps to sibling right edge', () => {
    const snap = computeSnap({ x: 210, y: 0, width: 100, height: 80 }, [{ x: 0, y: 0, width: 200, height: 80 }], 12);
    expect(snap!.x).toBe(200);
  });

  it('snaps both axes independently', () => {
    const snap = computeSnap({ x: 8, y: 192, width: 100, height: 100 }, [{ x: 0, y: 200, width: 300, height: 50 }], 12);
    expect(snap!.x).toBe(0);
    expect(snap!.y).toBe(200);
    expect(snap!.guides.length).toBe(2);
  });

  it('returns null beyond threshold', () => {
    const snap = computeSnap({ x: 40, y: 40, width: 100, height: 100 }, [{ x: 0, y: 0, width: 200, height: 200 }], 12);
    expect(snap).toBeNull();
  });

  it('ignores empty targets', () => {
    expect(computeSnap({ x: 5, y: 5, width: 50, height: 50 }, [], 12)).toBeNull();
  });
});

describe('detectDockZone', () => {
  const bounds = { width: 800, height: 600 };

  it('detects left, right and bottom edges', () => {
    expect(detectDockZone(10, 300, bounds)).toBe('left');
    expect(detectDockZone(790, 300, bounds)).toBe('right');
    expect(detectDockZone(400, 590, bounds)).toBe('bottom');
  });

  it('bottom wins in corner ambiguity', () => {
    expect(detectDockZone(10, 590, bounds)).toBe('bottom');
  });

  it('returns null away from edges', () => {
    expect(detectDockZone(400, 300, bounds)).toBeNull();
  });

  it('falls through to an allowed edge in corner ambiguity', () => {
    expect(detectDockZone(10, 590, bounds, 24, ['left'])).toBe('left');
  });

  it('ignores zones outside the allowed edges', () => {
    expect(detectDockZone(10, 300, bounds, 24, ['right', 'bottom'])).toBeNull();
    expect(detectDockZone(400, 590, bounds, 24, ['left'])).toBeNull();
  });

  it('returns null everywhere when no edge is allowed', () => {
    expect(detectDockZone(10, 300, bounds, 24, [])).toBeNull();
    expect(detectDockZone(10, 590, bounds, 24, [])).toBeNull();
  });

  it('treats a missing allowed list as all edges', () => {
    expect(detectDockZone(790, 300, bounds, 24, undefined)).toBe('right');
    expect(detectDockZone(790, 300, bounds, 24, null)).toBe('right');
  });
});

describe('clampToBounds', () => {
  it('keeps the titlebar reachable', () => {
    const clamped = clampToBounds({ x: -500, y: 900, width: 200, height: 150 }, { width: 800, height: 600 });
    expect(clamped.y).toBeLessThanOrEqual(600 - 34);
    expect(clamped.x).toBeGreaterThanOrEqual(-(200 - 48));
  });

  it('keeps a slice of the window visible horizontally', () => {
    const clamped = clampToBounds({ x: 900, y: 100, width: 200, height: 150 }, { width: 800, height: 600 });
    expect(clamped.x).toBe(800 - 48);
  });

  it('no-ops on zero bounds', () => {
    const rect = { x: 10, y: 10, width: 100, height: 100 };
    expect(clampToBounds(rect, { width: 0, height: 0 })).toEqual(rect);
  });
});
