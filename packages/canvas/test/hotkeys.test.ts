import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createHotkeyManager } from '@openvtt/hotkeys';
import { ToolManager } from '../src/tools/ToolManager';
import { RootState } from '../src/tools/RootState';
import { StateNode } from '../src/state/StateNode';
import type { Canvas } from '../src/canvas';

class FakeWallTool extends StateNode {
  static id = 'walls';
}

function fakeKey(code: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}) {
  return {
    code,
    key: '',
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    repeat: false,
  };
}

function makeCanvas(contributions: Parameters<ToolManager['constructor']>[1] = []) {
  const hotkeys = createHotkeyManager();
  const canvas = {
    hotkeys,
    interactionDisabled: false,
    setCursor: mock(),
    undo: mock(),
    redo: mock(),
    ping: mock(),
    preview: { clear: mock() },
    inputs: {
      isPointing: false,
      getCurrentWorldPoint: () => ({ x: 5, y: 7 }),
      getCurrentScreenPoint: () => ({ x: 0, y: 0 }),
      getPreviousScreenPoint: () => ({ x: 0, y: 0 }),
    },
  } as unknown as Canvas;
  const tools = new ToolManager(canvas, contributions);
  (canvas as { tools: ToolManager }).tools = tools;
  return { canvas, hotkeys, tools };
}

beforeEach(() => {
  RootState.extraTools = [];
});

describe('ToolManager hotkeys', () => {
  it('registers core tool actions with their default binds', () => {
    const { canvas, hotkeys, tools } = makeCanvas();
        expect(hotkeys.getAction('canvas', 'tool:select')?.binds.map((b) => b.key)).toEqual(['v']);
    expect(hotkeys.getAction('canvas', 'tool:hand')?.binds.map((b) => b.key)).toEqual(['h']);
    expect(hotkeys.getAction('canvas', 'tool:eraser')?.binds.map((b) => b.key)).toEqual(['e']);
    tools.destroy();
  });

  it('maps plugin tool contributions to rebindable actions', () => {
    const { hotkeys, tools } = makeCanvas([{ tool: FakeWallTool, hotkey: 'w' }]);
        expect(hotkeys.getAction('canvas', 'tool:walls')?.binds.map((b) => b.key)).toEqual(['w']);
    expect(tools.toolIds()).toContain('walls');
    tools.destroy();
  });

  it('switches tools via hotkey dispatch', () => {
    const { canvas, hotkeys, tools } = makeCanvas();
        expect(hotkeys.handle(fakeKey('KeyE'))).toBe(true);
    expect(tools.getCurrentToolId()).toBe('eraser');
    expect(hotkeys.handle(fakeKey('KeyV'))).toBe(true);
    expect(tools.getCurrentToolId()).toBe('select');
    tools.destroy();
  });

  it('undo and redo respond to ctrl and meta variants', () => {
    const { canvas, hotkeys, tools } = makeCanvas();
        hotkeys.handle(fakeKey('KeyZ', { ctrl: true }));
    expect(canvas.undo).toHaveBeenCalledTimes(1);
    hotkeys.handle(fakeKey('KeyZ', { meta: true, shift: true }));
    hotkeys.handle(fakeKey('KeyY', { ctrl: true }));
    expect(canvas.redo).toHaveBeenCalledTimes(2);
    expect(canvas.undo).toHaveBeenCalledTimes(1);
    tools.destroy();
  });

  it('ping uses the current world point', () => {
    const { canvas, hotkeys, tools } = makeCanvas();
        hotkeys.handle(fakeKey('KeyQ'));
    expect(canvas.ping).toHaveBeenCalledWith(5, 7);
    tools.destroy();
  });

  it('space toggles temporary pan and restores the previous tool', () => {
    const { canvas, hotkeys, tools } = makeCanvas();
        hotkeys.handle(fakeKey('KeyE'));
    expect(tools.getCurrentToolId()).toBe('eraser');

    hotkeys.handle(fakeKey('Space'));
    expect(tools.getCurrentToolId()).toBe('hand');
    hotkeys.handle(fakeKey('Space'), 'up');
    expect(tools.getCurrentToolId()).toBe('eraser');
    tools.destroy();
  });

  it('middle-button pan shares the temporary pan state', () => {
    const { canvas, tools } = makeCanvas();
        tools.handleEvent('pointerdown', { button: 1 } as never);
    expect(tools.getCurrentToolId()).toBe('hand');
    tools.handleEvent('pointerup', { button: 1 } as never);
    expect(tools.getCurrentToolId()).toBe('select');
    tools.destroy();
  });

  it('hotkeys are inert while interaction is disabled', () => {
    const { canvas, hotkeys, tools } = makeCanvas();
        canvas.interactionDisabled = true;
    expect(hotkeys.handle(fakeKey('KeyV'))).toBe(false);
    expect(hotkeys.handle(fakeKey('KeyZ', { ctrl: true }))).toBe(false);
    expect(canvas.undo).not.toHaveBeenCalled();
    expect(tools.getCurrentToolId()).toBe('select');
    tools.destroy();
  });

  it('tool keydowns no longer flow through the state machine', () => {
    const { canvas, tools } = makeCanvas();
        tools.handleEvent('keydown', { key: 'e', code: 'KeyE', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false } as never);
    expect(tools.getCurrentToolId()).toBe('select');
    tools.destroy();
  });

  it('destroy unregisters canvas actions but keeps the shared manager alive', () => {
    const { canvas, hotkeys, tools } = makeCanvas();
        tools.destroy();
    expect(hotkeys.getAction('canvas', 'tool:select')).toBeUndefined();
    expect(hotkeys.isDestroyed).toBe(false);
    expect(() => hotkeys.register('other', 'x', { name: 'X' })).not.toThrow();
    hotkeys.unregister('other');
  });
});
