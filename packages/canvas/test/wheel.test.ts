import { describe, it, expect } from 'bun:test';
import { classifyWheelZoom } from '../src/input/wheel';

describe('classifyWheelZoom', () => {
  it('mouse wheel (integer deltaY, no deltaX) zooms', () => {
    expect(classifyWheelZoom({ deltaX: 0, deltaY: -120, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe(true);
    expect(classifyWheelZoom({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe(true);
  });

  it('mouse wheel in line mode zooms', () => {
    expect(classifyWheelZoom({ deltaX: 0, deltaY: -3, deltaMode: 1, ctrlKey: false, metaKey: false })).toBe(true);
  });

  it('trackpad two-finger scroll (horizontal) pans', () => {
    expect(classifyWheelZoom({ deltaX: 30, deltaY: 20, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('trackpad two-finger scroll (fractional) pans', () => {
    expect(classifyWheelZoom({ deltaX: 0, deltaY: 12.5, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('trackpad pinch (ctrl) zooms', () => {
    expect(classifyWheelZoom({ deltaX: 0, deltaY: 10, deltaMode: 0, ctrlKey: true, metaKey: false })).toBe(true);
    expect(classifyWheelZoom({ deltaX: 0, deltaY: -120, deltaMode: 0, ctrlKey: false, metaKey: true })).toBe(true);
  });

  it('ctrl overrides trackpad pan into zoom', () => {
    expect(classifyWheelZoom({ deltaX: 30, deltaY: 20, deltaMode: 0, ctrlKey: true, metaKey: false })).toBe(true);
  });
});
