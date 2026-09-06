import { describe, expect, it } from 'bun:test';
import {
  ActionRegistry,
  DuplicateActionError,
  HotkeysError,
  InvalidComboError,
  NotEditableError,
  UnknownActionError,
  comboId,
} from '../src';

describe('ActionRegistry.register', () => {
  it('registers actions with parsed default binds', () => {
    const registry = new ActionRegistry();
    const info = registry.register('core', 'ping', {
      name: 'Ping',
      binds: ['Ctrl+P', 'F1'],
    });
    expect(info.namespace).toBe('core');
    expect(info.action).toBe('ping');
    expect(info.name).toBe('Ping');
    expect(info.context).toBe('global');
    expect(info.editable).toBe(true);
    expect(info.defaults).toHaveLength(2);
    expect(info.defaults.map(comboId)).toEqual(['ctrl+p', 'f1']);
    expect(info.binds).toEqual(info.defaults);
    expect(info.hasOverride).toBe(false);
  });

  it('generates uuid v7 ids for binds', () => {
    const registry = new ActionRegistry();
    const info = registry.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P'] });
    const id = info.defaults[0].id;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('rejects duplicate actions', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'ping', { name: 'Ping' });
    expect(() => registry.register('core', 'ping', { name: 'Ping' })).toThrow(DuplicateActionError);
  });

  it('rejects invalid identifiers', () => {
    const registry = new ActionRegistry();
    expect(() => registry.register('', 'ping', { name: 'Ping' })).toThrow(HotkeysError);
    expect(() => registry.register('core', '', { name: 'Ping' })).toThrow(HotkeysError);
    expect(() => registry.register('ns/x', 'ping', { name: 'Ping' })).toThrow(HotkeysError);
  });

  it('allows the same action name in different namespaces', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'ping', { name: 'Ping' });
    expect(() => registry.register('dice', 'ping', { name: 'Ping' })).not.toThrow();
    expect(registry.list()).toHaveLength(2);
  });
});

describe('ActionRegistry binds', () => {
  it('sets and resets overrides', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P'] });

    const override = registry.setBinds('core', 'ping', ['Ctrl+Shift+P']);
    expect(override.map(comboId)).toEqual(['ctrl+shift+p']);

    const entry = registry.require('core', 'ping');
    expect(registry.effectiveBinds(entry).map(comboId)).toEqual(['ctrl+shift+p']);

    registry.reset('core', 'ping');
    expect(registry.effectiveBinds(entry).map(comboId)).toEqual(['ctrl+p']);
  });

  it('resetAll clears every override', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'a', { name: 'A', binds: ['F1'] });
    registry.register('core', 'b', { name: 'B', binds: ['F2'] });
    registry.setBinds('core', 'a', ['F3']);
    registry.setBinds('core', 'b', ['F4']);
    registry.resetAll();
    for (const entry of registry.list()) {
      expect(entry.override).toBeUndefined();
    }
  });

  it('rejects overrides for unknown or non-editable actions', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'fixed', { name: 'Fixed', editable: false, binds: ['F1'] });

    expect(() => registry.setBinds('core', 'nope', ['F1'])).toThrow(UnknownActionError);
    expect(() => registry.setBinds('core', 'fixed', ['F2'])).toThrow(NotEditableError);
    expect(() => registry.reset('core', 'nope')).toThrow(UnknownActionError);
  });

  it('does not mutate overrides when parsing fails', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'ping', { name: 'Ping', binds: ['F1'] });
    registry.setBinds('core', 'ping', ['F2']);

    expect(() => registry.setBinds('core', 'ping', ['Not+A+Combo'])).toThrow(InvalidComboError);
    const entry = registry.require('core', 'ping');
    expect(registry.effectiveBinds(entry).map(comboId)).toEqual(['f2']);
  });

  it('supports clearing binds with an empty array', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'ping', { name: 'Ping', binds: ['F1'] });
    registry.setBinds('core', 'ping', []);
    const entry = registry.require('core', 'ping');
    expect(registry.effectiveBinds(entry)).toEqual([]);
  });
});

describe('ActionRegistry.unregister', () => {
  it('removes a single action or a whole namespace', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'a', { name: 'A' });
    registry.register('core', 'b', { name: 'B' });
    registry.register('dice', 'c', { name: 'C' });

    expect(registry.unregister('core', 'a')).toBe(1);
    expect(registry.get('core', 'a')).toBeUndefined();
    expect(registry.unregister('core', 'a')).toBe(0);
    expect(registry.unregister('core')).toBe(1);
    expect(registry.list()).toHaveLength(1);
  });
});

describe('ActionRegistry.conflicts', () => {
  it('detects conflicting binds between distinct actions', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'a', { name: 'A', binds: ['Ctrl+D'] });
    registry.register('ui', 'b', { name: 'B', binds: ['Ctrl+D'] });
    registry.register('ui', 'c', { name: 'C', binds: ['Ctrl+Shift+D'] });

    const conflicts = registry.conflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].combo).toBe('ctrl+d');
    expect(conflicts[0].actions.map((a) => `${a.namespace}/${a.action}`).sort()).toEqual([
      'core/a',
      'ui/b',
    ]);
  });

  it('ignores duplicate binds within the same action', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'a', { name: 'A', binds: ['Ctrl+D', 'Ctrl+D'] });
    expect(registry.conflicts()).toHaveLength(0);
  });

  it('clears conflicts once binds are rebound', () => {
    const registry = new ActionRegistry();
    registry.register('core', 'a', { name: 'A', binds: ['Ctrl+D'] });
    registry.register('ui', 'b', { name: 'B', binds: ['Ctrl+D'] });
    expect(registry.conflicts()).toHaveLength(1);

    registry.setBinds('ui', 'b', ['Ctrl+E']);
    expect(registry.conflicts()).toHaveLength(0);
  });
});
