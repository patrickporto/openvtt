import { describe, expect, it } from 'bun:test';
import { normalizeTracker } from '../src/schemas';
import { computeLabel, computeRatio, computeVisibility, resolveTracker, EVERYTHING_VIEWER } from '../src/resolve';

const GM = EVERYTHING_VIEWER;
const PLAYER: typeof GM = { role: 'player', owns: (id) => id === 'mine' };
const UI = { hovered: false, selected: false };

describe('computeVisibility', () => {
  it('respects the visible flag', () => {
    const tracker = normalizeTracker({ name: 'HP', visible: false });
    expect(computeVisibility('t', tracker, 5, GM, UI)).toBe(false);
  });

  it('honors audience modes', () => {
    const tracker = normalizeTracker({ name: 'HP', audience: { others: 'never' } });
    expect(computeVisibility('mine', tracker, 5, GM, UI)).toBe(true);
    expect(computeVisibility('other', tracker, 5, PLAYER, UI)).toBe(false);
  });

  it('hover/selected modes track ui state', () => {
    const tracker = normalizeTracker({ name: 'HP', audience: { others: 'hover' } });
    expect(computeVisibility('other', tracker, 5, PLAYER, { hovered: false, selected: true })).toBe(false);
    expect(computeVisibility('other', tracker, 5, PLAYER, { hovered: true, selected: false })).toBe(true);

    const selectedOnly = normalizeTracker({ name: 'HP', audience: { others: 'selected' } });
    expect(computeVisibility('other', selectedOnly, 5, PLAYER, { hovered: true, selected: false })).toBe(true);
    expect(computeVisibility('other', selectedOnly, 5, PLAYER, { hovered: false, selected: false })).toBe(false);
  });

  it('hideEmpty and hideFull', () => {
    const empty = normalizeTracker({ name: 'Temp', kind: 'bar', value: 0, max: 10, hideEmpty: true });
    expect(computeVisibility('t', empty, 0, GM, UI)).toBe(false);
    expect(computeVisibility('t', empty, 1, GM, UI)).toBe(true);

    const full = normalizeTracker({ name: 'HP', kind: 'bar', value: 10, max: 10, hideFull: true });
    expect(computeVisibility('t', full, 10, GM, UI)).toBe(false);
    expect(computeVisibility('t', full, 9, GM, UI)).toBe(true);
  });
});

describe('computeRatio', () => {
  it('returns undefined for counters and bars without max', () => {
    expect(computeRatio(normalizeTracker({ name: 'AC', kind: 'counter' }), 5, undefined)).toBeUndefined();
    expect(computeRatio(normalizeTracker({ name: 'HP', kind: 'bar' }), 5, undefined)).toBeUndefined();
  });

  it('normalizes value into 0..1 with clamping', () => {
    const tracker = normalizeTracker({ name: 'HP', kind: 'bar', value: 5, max: 10 });
    expect(computeRatio(tracker, 5, 10)).toBeCloseTo(0.5);
    expect(computeRatio(tracker, 20, 10)).toBe(1);
    expect(computeRatio(tracker, -3, 10)).toBe(0);
  });

  it('quantizes into segments rounding up', () => {
    const tracker = normalizeTracker({ name: 'Ammo', kind: 'bar', value: 9, max: 10, segments: 3 });
    expect(computeRatio(tracker, 9, 10)).toBeCloseTo(1);
    expect(computeRatio(tracker, 1, 10)).toBeCloseTo(1 / 3);
    expect(computeRatio(tracker, 0, 10)).toBe(0);
  });

  it('inverts the ratio for wound-style bars', () => {
    const tracker = normalizeTracker({ name: 'Wounds', kind: 'bar', value: 0, max: 4, invert: true });
    expect(computeRatio(tracker, 0, 4)).toBe(1);
    expect(computeRatio(tracker, 4, 4)).toBe(0);
  });

  it('respects a custom min', () => {
    const tracker = normalizeTracker({ name: 'Pips', kind: 'bar', value: 5, max: 10, min: 5 });
    expect(computeRatio(tracker, 5, 10)).toBe(0);
    expect(computeRatio(tracker, 7.5, 10)).toBeCloseTo(0.5);
  });
});

describe('computeLabel', () => {
  it('renders each label style', () => {
    const base = { name: 'HP', kind: 'bar' as const, value: 7, max: 10 };
    expect(computeLabel(normalizeTracker({ ...base, label: 'none' }), 7, 10)).toBe('');
    expect(computeLabel(normalizeTracker({ ...base, label: 'value' }), 7, 10)).toBe('7');
    expect(computeLabel(normalizeTracker({ ...base, label: 'max' }), 7, 10)).toBe('10');
    expect(computeLabel(normalizeTracker({ ...base, label: 'fraction' }), 7, 10)).toBe('7/10');
    expect(computeLabel(normalizeTracker({ ...base, label: 'percent' }), 7, 10)).toBe('70%');
  });

  it('appends prefix and units', () => {
    const tracker = normalizeTracker({ name: 'HP', label: 'fraction', prefix: 'HP', units: 'pt' });
    expect(computeLabel(tracker, 7, 10)).toBe('HP7/10pt');
  });

  it('approximates the value with segments', () => {
    const tracker = normalizeTracker({ name: 'Ammo', kind: 'bar', segments: 3, label: 'fraction' });
    expect(computeLabel(tracker, 9, 10)).toBe('3/3');
    expect(computeLabel(tracker, 1, 10)).toBe('1/3');
  });

  it('falls back to plain value when max is missing', () => {
    const tracker = normalizeTracker({ name: 'HP', label: 'fraction' });
    expect(computeLabel(tracker, 4, undefined)).toBe('4');
  });

  it('rounds fractional values for display', () => {
    const tracker = normalizeTracker({ name: 'W', label: 'value' });
    expect(computeLabel(tracker, 3.14159, undefined)).toBe('3.14');
  });
});

describe('resolveTracker', () => {
  it('produces the full render payload', () => {
    const tracker = normalizeTracker({ name: 'HP', kind: 'bar', value: 8, max: 10, label: 'fraction' });
    const resolved = resolveTracker('t', tracker, { value: 8, max: 10 }, GM, UI);
    expect(resolved.value).toBe(8);
    expect(resolved.max).toBe(10);
    expect(resolved.ratio).toBeCloseTo(0.8);
    expect(resolved.label).toBe('8/10');
    expect(resolved.visible).toBe(true);
    expect(resolved.fillColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('source value overrides stored value', () => {
    const tracker = normalizeTracker({ name: 'HP', kind: 'bar', value: 0, max: 10 });
    const resolved = resolveTracker('t', tracker, { value: 10, max: 10 }, GM, UI);
    expect(resolved.value).toBe(10);
    expect(resolved.ratio).toBe(1);
  });

  it('out-of-range values clamp for ratio but keep exact label', () => {
    const tracker = normalizeTracker({ name: 'HP', kind: 'bar', value: 12, max: 10, clamp: false, label: 'value' });
    const resolved = resolveTracker('t', tracker, { value: 12, max: 10 }, GM, UI);
    expect(resolved.ratio).toBe(1);
    expect(resolved.label).toBe('12');
  });
});
