import { describe, expect, it } from 'bun:test';
import { COLOR_PRESETS, CONDITION_PRESETS, RingPresetRegistry } from '../src/presets';

describe('RingPresetRegistry', () => {
  it('registers, retrieves and lists presets', () => {
    const registry = new RingPresetRegistry();
    registry.register({ id: 'blue', label: 'Blue', style: { color: '#1a6aff' } });
    expect(registry.has('blue')).toBe(true);
    expect(registry.has('nope')).toBe(false);
    expect(registry.get('blue')?.label).toBe('Blue');
    expect(registry.get('nope')).toBeUndefined();
    expect(registry.list().map((preset) => preset.id)).toEqual(['blue']);
  });

  it('resolves style defaults on register', () => {
    const registry = new RingPresetRegistry();
    registry.register({ id: 'blue', label: 'Blue', style: { color: '#1a6aff' } });
    const style = registry.get('blue')!.style;
    expect(style.color).toBe('#1a6aff');
    expect(style.width).toBe(3);
    expect(style.alpha).toBe(1);
    expect(style.shape).toBe('circle');
    expect(style.dash).toEqual([]);
    expect(style.pulse).toBe(false);
    expect(style.glow).toBe(false);
  });

  it('replaces on re-register keeping insertion position', () => {
    const registry = new RingPresetRegistry();
    registry.register({ id: 'a', label: 'A', style: { color: '#1a6aff' } });
    registry.register({ id: 'b', label: 'B', style: { color: '#ff7433' } });
    registry.register({ id: 'a', label: 'A2', style: { color: '#ff4d4d' } });
    expect(registry.list().map((preset) => preset.id)).toEqual(['a', 'b']);
    expect(registry.list().length).toBe(2);
    expect(registry.get('a')?.label).toBe('A2');
    expect(registry.get('a')?.style.color).toBe('#ff4d4d');
  });

  it('unregisters presets', () => {
    const registry = new RingPresetRegistry();
    registry.register({ id: 'a', label: 'A', style: {} });
    expect(registry.unregister('a')).toBe(true);
    expect(registry.unregister('a')).toBe(false);
    expect(registry.has('a')).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it('rejects invalid styles', () => {
    const registry = new RingPresetRegistry();
    expect(() => registry.register({ id: 'bad', label: 'Bad', style: { color: 'red' } })).toThrow();
    expect(registry.has('bad')).toBe(false);
  });
});

describe('COLOR_PRESETS', () => {
  it('has 12 unique ids', () => {
    expect(COLOR_PRESETS.length).toBe(12);
    expect(new Set(COLOR_PRESETS.map((preset) => preset.id)).size).toBe(12);
  });

  it('covers the Owlbear palette colors', () => {
    const colors = new Map(COLOR_PRESETS.map((preset) => [preset.id, preset.style.color]));
    expect(colors.get('blue')).toBe('#1a6aff');
    expect(colors.get('orange')).toBe('#ff7433');
    expect(colors.get('red')).toBe('#ff4d4d');
    expect(colors.get('yellow')).toBe('#ffd433');
    expect(colors.get('brown')).toBe('#b07126');
    expect(colors.get('purple')).toBe('#884dff');
    expect(colors.get('green')).toBe('#85ff66');
    expect(colors.get('forest')).toBe('#519e00');
    expect(colors.get('pink')).toBe('#eb8aff');
    expect(colors.get('cyan')).toBe('#44e0f1');
    expect(colors.get('black')).toBe('#222222');
    expect(colors.get('white')).toBe('#ffffff');
  });
});

describe('CONDITION_PRESETS', () => {
  it('has unique ids', () => {
    expect(new Set(CONDITION_PRESETS.map((preset) => preset.id)).size).toBe(CONDITION_PRESETS.length);
  });

  it('defines poisoned with a dashed pattern', () => {
    const poisoned = CONDITION_PRESETS.find((preset) => preset.id === 'poisoned');
    expect(poisoned?.label).toBe('Poisoned');
    expect(poisoned?.style.color).toBe('#519e00');
    expect(poisoned?.style.dash).toEqual([4, 4]);
  });

  it('defines bloodied with pulse and blinded with a thicker width', () => {
    expect(CONDITION_PRESETS.find((preset) => preset.id === 'bloodied')?.style.pulse).toBe(true);
    expect(CONDITION_PRESETS.find((preset) => preset.id === 'blinded')?.style.width).toBe(5);
  });
});
