import { describe, expect, it } from 'bun:test';
import { InvalidComboError, comboId, eventModifiers, formatCombo, keyFromEvent, keyLabel, matchesBind, parseCombo } from '../src';
import type { ParsedCombo } from '../src';
import { fakeKeyEvent } from './fake';

describe('parseCombo', () => {
  it('parses modifiers and key with canonical ordering', () => {
    expect(parseCombo('Ctrl+Shift+A')).toEqual({ key: 'a', modifiers: ['ctrl', 'shift'] });
    expect(parseCombo('Shift+Ctrl+A')).toEqual({ key: 'a', modifiers: ['ctrl', 'shift'] });
  });

  it('accepts modifier aliases', () => {
    expect(parseCombo('Alt+Cmd+K')).toEqual({ key: 'k', modifiers: ['alt', 'meta'] });
    expect(parseCombo('Control+Option+S')).toEqual({ key: 's', modifiers: ['alt', 'ctrl'] });
    expect(parseCombo('Win+S')).toEqual({ key: 's', modifiers: ['meta'] });
  });

  it('tolerates whitespace and case', () => {
    expect(parseCombo('  ctrl + f1 ')).toEqual({ key: 'f1', modifiers: ['ctrl'] });
  });

  it('accepts physical code aliases as the key part', () => {
    expect(parseCombo('Digit1')).toEqual({ key: '1', modifiers: [] });
    expect(parseCombo('KeyA')).toEqual({ key: 'a', modifiers: [] });
    expect(parseCombo('Ctrl+Numpad3')).toEqual({ key: 'numpad3', modifiers: ['ctrl'] });
    expect(parseCombo('ArrowUp')).toEqual({ key: 'arrowup', modifiers: [] });
    expect(parseCombo('Space')).toEqual({ key: 'space', modifiers: [] });
  });

  it('accepts object form', () => {
    expect(parseCombo({ key: 'a', modifiers: ['Control'] })).toEqual({
      key: 'a',
      modifiers: ['ctrl'],
    });
    expect(parseCombo({ key: 'Delete' })).toEqual({ key: 'delete', modifiers: [] });
  });

  it('rejects invalid combos', () => {
    expect(() => parseCombo('')).toThrow(InvalidComboError);
    expect(() => parseCombo('+')).toThrow(InvalidComboError);
    expect(() => parseCombo('Foo+A')).toThrow(InvalidComboError);
    expect(() => parseCombo('Ctrl+??')).toThrow(InvalidComboError);
    expect(() => parseCombo({ key: '' })).toThrow(InvalidComboError);
  });
});

describe('formatting', () => {
  it('formats display combos in a stable modifier order', () => {
    expect(formatCombo({ key: 'a', modifiers: ['shift', 'ctrl'] })).toBe('Ctrl+Shift+A');
    expect(formatCombo({ key: 'delete', modifiers: ['alt'] })).toBe('Alt+Delete');
    expect(formatCombo({ key: 'f5' })).toBe('F5');
    expect(formatCombo({ key: 'numpad3', modifiers: ['meta'] })).toBe('Meta+Num 3');
  });

  it('produces canonical combo ids', () => {
    expect(comboId({ key: 'a', modifiers: ['shift', 'ctrl'] })).toBe('ctrl+shift+a');
    expect(comboId({ key: 'escape' })).toBe('escape');
  });

  it('labels keys for ui', () => {
    expect(keyLabel('a')).toBe('A');
    expect(keyLabel('arrowup')).toBe('Arrow Up');
    expect(keyLabel('f12')).toBe('F12');
    expect(keyLabel('numpad7')).toBe('Num 7');
    expect(keyLabel('bracketleft')).toBe('[');
  });
});

describe('keyFromEvent', () => {
  it('maps physical codes to canonical tokens', () => {
    expect(keyFromEvent(fakeKeyEvent({ code: 'KeyA' }))).toBe('a');
    expect(keyFromEvent(fakeKeyEvent({ code: 'KeyZ', shift: true }))).toBe('z');
    expect(keyFromEvent(fakeKeyEvent({ code: 'Digit1' }))).toBe('1');
    expect(keyFromEvent(fakeKeyEvent({ code: 'Numpad3' }))).toBe('numpad3');
    expect(keyFromEvent(fakeKeyEvent({ code: 'ArrowUp' }))).toBe('arrowup');
    expect(keyFromEvent(fakeKeyEvent({ code: 'Space' }))).toBe('space');
    expect(keyFromEvent(fakeKeyEvent({ code: 'Semicolon' }))).toBe('semicolon');
  });

  it('normalizes modifier key codes', () => {
    expect(keyFromEvent(fakeKeyEvent({ code: 'ControlLeft' }))).toBe('ctrl');
    expect(keyFromEvent(fakeKeyEvent({ code: 'MetaRight' }))).toBe('meta');
    expect(keyFromEvent(fakeKeyEvent({ code: 'OSLeft' }))).toBe('meta');
  });

  it('falls back to key when code is missing', () => {
    expect(keyFromEvent(fakeKeyEvent({ key: 'A' }))).toBe('a');
    expect(keyFromEvent(fakeKeyEvent({ key: 'Enter' }))).toBe('enter');
    expect(keyFromEvent(fakeKeyEvent({ key: 'Escape' }))).toBe('escape');
    expect(keyFromEvent(fakeKeyEvent({}))).toBe('');
  });

  it('reads held modifiers', () => {
    expect(eventModifiers(fakeKeyEvent({ ctrl: true, shift: true }))).toEqual(['ctrl', 'shift']);
    expect(eventModifiers(fakeKeyEvent({}))).toEqual([]);
  });
});

describe('matchesBind', () => {
  const bind: ParsedCombo = { key: 'a', modifiers: ['ctrl'] };

  it('requires the exact key and modifiers', () => {
    expect(matchesBind(bind, fakeKeyEvent({ code: 'KeyA', ctrl: true }))).toBe(true);
    expect(matchesBind(bind, fakeKeyEvent({ code: 'KeyA' }))).toBe(false);
    expect(matchesBind(bind, fakeKeyEvent({ code: 'KeyA', ctrl: true, shift: true }))).toBe(false);
    expect(matchesBind(bind, fakeKeyEvent({ code: 'KeyB', ctrl: true }))).toBe(false);
  });

  it('allows extra held modifiers when reserved', () => {
    expect(matchesBind(bind, fakeKeyEvent({ code: 'KeyA', ctrl: true, shift: true }), ['shift'])).toBe(true);
    expect(matchesBind(bind, fakeKeyEvent({ code: 'KeyA', ctrl: true, alt: true }), ['shift'])).toBe(false);
  });

  it('is layout independent', () => {
    expect(matchesBind(bind, fakeKeyEvent({ code: 'KeyA', key: 'ф', ctrl: true }))).toBe(true);
  });
});
