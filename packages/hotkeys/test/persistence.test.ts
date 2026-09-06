import { describe, expect, it, mock } from 'bun:test';
import { InvalidProfileError, createHotkeyManager } from '../src';

function seedDefaults(): ReturnType<typeof createHotkeyManager> {
  const manager = createHotkeyManager();
  manager.register('core', 'ping', { name: 'Ping', binds: ['Ctrl+P', 'F1'] });
  manager.register('core', 'fixed', { name: 'Fixed', binds: ['Ctrl+F'], editable: false });
  manager.register('canvas', 'measure', { name: 'Measure', binds: ['KeyM'], context: 'canvas' });
  return manager;
}

describe('serialize', () => {
  it('returns an empty profile when nothing was rebound', () => {
    const manager = seedDefaults();
    expect(manager.serialize()).toEqual({ version: 1, overrides: {} });
  });

  it('only includes overrides that differ from defaults', () => {
    const manager = seedDefaults();
    manager.setBinds('core', 'ping', ['Ctrl+Shift+P']);
    manager.setBinds('canvas', 'measure', ['KeyM']);

    expect(manager.serialize()).toEqual({
      version: 1,
      overrides: { 'core/ping': ['ctrl+shift+p'] },
    });
  });
});

describe('applyProfile', () => {
  it('applies a valid profile and notifies bindsChanged', () => {
    const manager = seedDefaults();
    const changed: string[] = [];
    manager.bus.on('bindsChanged', (payload) => changed.push(`${payload.namespace}/${payload.action}`));

    manager.applyProfile({ version: 1, overrides: { 'core/ping': ['Ctrl+Alt+P', 'F2'] } });

    const info = manager.getAction('core', 'ping');
    expect(info?.binds.map((b) => [b.modifiers, b.key])).toEqual([
      [['alt', 'ctrl'], 'p'],
      [[], 'f2'],
    ]);
    expect(info?.hasOverride).toBe(true);
    expect(changed).toEqual(['core/ping']);
  });

  it('roundtrips through serialize', () => {
    const source = seedDefaults();
    source.setBinds('core', 'ping', ['Ctrl+Alt+P']);

    const target = seedDefaults();
    target.applyProfile(source.serialize());
    expect(target.serialize()).toEqual(source.serialize());
  });

  it('rejects invalid profile shapes with issues', () => {
    const manager = seedDefaults();
    expect(() => manager.applyProfile({ version: 2, overrides: {} })).toThrow(InvalidProfileError);
    expect(() => manager.applyProfile({ version: 1, overrides: { a: [] } })).toThrow(
      InvalidProfileError,
    );
  });

  it('rejects unknown actions', () => {
    const manager = seedDefaults();
    expect(() =>
      manager.applyProfile({ version: 1, overrides: { 'core/nope': ['F3'] } }),
    ).toThrow(/Unknown hotkey action/);
  });

  it('rejects non-editable actions', () => {
    const manager = seedDefaults();
    expect(() =>
      manager.applyProfile({ version: 1, overrides: { 'core/fixed': ['F3'] } }),
    ).toThrow(/not editable/);
  });

  it('rejects invalid combos with a cause', () => {
    const manager = seedDefaults();
    try {
      manager.applyProfile({ version: 1, overrides: { 'core/ping': ['Nope+F'] } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidProfileError);
      expect((error as InvalidProfileError).cause).toBeDefined();
    }
  });

  it('applies atomically when every entry is valid', () => {
    const manager = seedDefaults();
    expect(() =>
      manager.applyProfile({
        version: 1,
        overrides: { 'core/ping': ['F9'], 'core/nope': ['F3'] },
      }),
    ).toThrow(InvalidProfileError);
    expect(manager.getAction('core', 'ping')?.hasOverride).toBe(false);
  });

  it('resets to defaults with reset and resetAll', () => {
    const manager = seedDefaults();
    manager.applyProfile({ version: 1, overrides: { 'core/ping': ['F9'] } });
    manager.reset('core', 'ping');
    expect(manager.getAction('core', 'ping')?.binds.map((b) => b.key)).toEqual(['p', 'f1']);

    manager.applyProfile({ version: 1, overrides: { 'canvas/measure': ['F9'] } });
    manager.resetAll();
    expect(manager.serialize()).toEqual({ version: 1, overrides: {} });
  });
});

describe('settings flow', () => {
  it('supports the full rebind lifecycle used by a keybinds ui', () => {
    const manager = seedDefaults();
    const listener = mock(() => {});

    manager.register('core', 'roll', { name: 'Roll dice', binds: ['Ctrl+R'], onDown: () => true });
    manager.bus.on('bindsChanged', listener);

    manager.setBinds('core', 'roll', ['Ctrl+Shift+R']);
    expect(manager.getAction('core', 'roll')?.hasOverride).toBe(true);

    const conflicts = manager.conflicts();
    expect(conflicts).toHaveLength(0);

    const stored = JSON.parse(JSON.stringify(manager.serialize()));
    expect(stored).toEqual({ version: 1, overrides: { 'core/roll': ['ctrl+shift+r'] } });

    manager.reset('core', 'roll');
    expect(manager.getAction('core', 'roll')?.binds.map((b) => b.key)).toEqual(['r']);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
