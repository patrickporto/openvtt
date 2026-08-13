import { describe, it, expect } from 'bun:test';
import { StateNode } from '../src/state/StateNode';
import type { Canvas } from '../src/canvas';
import type { CanvasPointerInfo } from '../src/input/types';

const canvas = {} as unknown as Canvas;

class Tracker extends StateNode {
  static id = 'tracker';
  events: string[] = [];
  override onEnter(): void {
    this.events.push('enter');
  }
  override onExit(): void {
    this.events.push('exit');
  }
  override onPointerDown(_info: CanvasPointerInfo): void {
    this.events.push('down');
  }
}

class BranchA extends StateNode {
  static id = 'a';
  static initial = 'tracker';
  static children() {
    return [Tracker];
  }
}

class BranchB extends StateNode {
  static id = 'b';
}

class Root extends StateNode {
  static id = 'root';
  static initial = 'a';
  static children() {
    return [BranchA, BranchB];
  }
}

describe('StateNode', () => {
  it('enters descending to the initial leaf', () => {
    const root = new Root(null, canvas);
    root.enter();
    expect(root.path).toBe('root.a.tracker');
  });

  it('transitions between children running exit/enter', () => {
    const root = new Root(null, canvas);
    root.enter();
    const tracker = root.current?.current as Tracker;
    root.transition('b');
    expect(root.path).toBe('root.b');
    expect(tracker.events).toEqual(['enter', 'exit']);
  });

  it('dispatches events from root down to the active leaf', () => {
    const root = new Root(null, canvas);
    root.enter();
    root.handleEvent('pointerdown', {} as CanvasPointerInfo);
    const tracker = root.current?.current as Tracker;
    expect(tracker.events).toContain('down');
  });

  it('transition to an unknown id is a safe no-op', () => {
    const root = new Root(null, canvas);
    root.enter();
    expect(() => root.transition('does-not-exist')).not.toThrow();
    expect(root.path).toBe('root.a.tracker');
  });

  it('supports dot-path transitions to deeper descendants', () => {
    const root = new Root(null, canvas);
    root.transition('a.tracker');
    expect(root.path).toBe('root.a.tracker');
  });
});
