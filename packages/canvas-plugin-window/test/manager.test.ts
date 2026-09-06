import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { CanvasBus } from '@openvtt/canvas';
import type { WindowFrameElement } from '../src/frame';

GlobalRegistrator.register();

const { createCanvasBus, dynamicBus } = await import('@openvtt/canvas');
const { WindowManager } = await import('../src/manager');
const { defineWindowElements, WINDOW_FRAME_TAG } = await import('../src/frame');

let host: HTMLElement;
let bus: CanvasBus;

beforeAll(() => {
  defineWindowElements();
  host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);
  bus = createCanvasBus();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function makeManager(): WindowManager {
  return new WindowManager({ bus, host });
}

function panel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
}

describe('WindowManager (DOM)', () => {
  it('creates floating windows with frames appended to the overlay', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, x: 50, y: 40 });
    expect(handle.state).toBe('normal');
    expect(handle.dock).toBe('float');
    const frame = handle.element as WindowFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.tagName.toLowerCase()).toBe(WINDOW_FRAME_TAG);
    expect(manager.list().length).toBe(1);
    manager.destroy();
  });

  it('reuses explicit ids and focuses the existing window', () => {
    const manager = makeManager();
    const first = manager.create({ id: 'x', title: 'X', content: panel('x') });
    const second = manager.create({ id: 'x', title: 'X', content: panel('x') });
    expect(second.id).toBe(first.id);
    expect(manager.list().length).toBe(1);
    manager.destroy();
  });

  it('open() runs the factory lazily once and focuses on re-open', () => {
    const manager = makeManager();
    let built = 0;
    manager.register({ id: 'demo', title: 'Demo', factory: () => { built += 1; return panel('demo'); } });
    const handle = manager.open('demo');
    expect(built).toBe(1);
    expect(handle?.content?.textContent).toBe('demo');
    manager.open('demo');
    expect(built).toBe(1);
    expect(manager.list().length).toBe(1);
    manager.destroy();
  });

  it('open() returns null for unknown definitions', () => {
    const manager = makeManager();
    expect(manager.open('nope')).toBeNull();
    manager.destroy();
  });

  it('unregister closes open windows and removes the definition', () => {
    const manager = makeManager();
    manager.register({ id: 'temp', title: 'Temp', factory: () => panel('temp') });
    const handle = manager.open('temp')!;
    expect(manager.list().length).toBe(1);
    manager.unregister('temp');
    expect(manager.list().length).toBe(0);
    expect(manager.open('temp')).toBeNull();
    expect(handle.state).toBe('normal');
    manager.destroy();
  });

  it('multi-instance definitions open independent windows', () => {
    const manager = makeManager();
    manager.register({ id: 'multi', title: 'M', instances: 'multi', factory: () => panel('m') });
    const a = manager.open('multi')!;
    const b = manager.open('multi')!;
    expect(a.id).not.toBe(b.id);
    expect(a.definitionId).toBe('multi');
    expect(manager.list().filter((h) => h.definitionId === 'multi').length).toBe(2);
    expect(manager.get('multi')).toBeNull();
    manager.destroy();
  });

  it('multi-instance windows round-trip through serialize/restore', () => {
    const manager = makeManager();
    manager.register({ id: 'notes', title: 'N', instances: 'multi', factory: () => panel('n') });
    const a = manager.open('notes')!;
    const b = manager.open('notes')!;
    const snapshot = manager.serialize();
    expect(snapshot.filter((s) => s.definitionId === 'notes').length).toBe(2);
    manager.closeAll();
    manager.restore(snapshot);
    expect(manager.list().filter((h) => h.definitionId === 'notes').length).toBe(2);
    expect(manager.get(a.id)).not.toBeNull();
    expect(manager.get(b.id)).not.toBeNull();
    manager.destroy();
  });

  it('emits window:* bus events on lifecycle changes', () => {
    const manager = makeManager();
    const seen: string[] = [];
    const dyn = dynamicBus(bus);
    const unsubs = (['window:created', 'window:closed', 'window:state', 'window:focus', 'window:blur', 'window:dock'] as const).map((name) =>
      dyn.on(name, () => seen.push(name)),
    );
    const handle = manager.create({ title: 'E', content: panel('e') });
    manager.create({ title: 'F', content: panel('f') });
    handle.close();
    for (const unsub of unsubs) unsub();
    expect(seen).toContain('window:created');
    expect(seen).toContain('window:blur');
    expect(seen).toContain('window:focus');
    expect(seen).toContain('window:closed');
    manager.destroy();
  });

  it('minimize/restore drives the taskbar', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'T', content: panel('t') });
    handle.minimize();
    expect(handle.state).toBe('minimized');
    expect(handle.element?.style.display).toBe('none');
    const taskbar = host.querySelector('.ovtt-windows .taskbar') as HTMLElement;
    expect(taskbar.classList.contains('active')).toBe(true);
    expect(taskbar.querySelectorAll('button').length).toBe(1);
    (taskbar.querySelector('button') as HTMLElement).click();
    expect(handle.state).toBe('normal');
    expect(handle.element?.style.display).not.toBe('none');
    manager.destroy();
  });

  it('maximize fills the overlay and restore returns the geometry', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'M', content: panel('m'), width: 300, height: 200, x: 10, y: 10 });
    handle.maximize();
    expect(handle.state).toBe('maximized');
    expect(handle.element?.getAttribute('state')).toBe('maximized');
    handle.restore();
    expect(handle.state).toBe('normal');
    expect(handle.element?.style.left).toBe('10px');
    manager.destroy();
  });

  it('modal shows backdrop and Esc closes non-persistent top modal', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'Modal', content: panel('modal'), modal: true });
    const backdrop = host.querySelector('.ovtt-windows .backdrop') as HTMLElement;
    expect(backdrop.classList.contains('active')).toBe(true);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(manager.list().length).toBe(0);
    expect(manager.get(handle.id)).toBeNull();
    manager.destroy();
  });

  it('persistent modal ignores Esc', () => {
    const manager = makeManager();
    manager.create({ title: 'P', content: panel('p'), modal: true, persistent: true, closable: false });
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(manager.list().length).toBe(1);
    manager.destroy();
  });

  it('dock/undock reparents the frame between overlay and dock stack', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'D', content: panel('d') });
    const frame = handle.element!;
    const root = host.querySelector('.ovtt-windows') as HTMLElement;
    expect(frame.parentElement).toBe(root);
    handle.dockTo('right');
    expect(handle.dock).toBe('right');
    expect(frame.parentElement?.className).toContain('dock-stack');
    expect(frame.getAttribute('mode')).toBe('dock');
    handle.undock();
    expect(handle.dock).toBe('float');
    expect(frame.parentElement).toBe(root);
    manager.destroy();
  });

  it('docked minimize collapses to the titlebar instead of the taskbar', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'C', content: panel('c') });
    handle.dockTo('left');
    handle.minimize();
    expect(handle.state).toBe('minimized');
    expect(handle.element?.getAttribute('state')).toBe('collapsed');
    const taskbar = host.querySelector('.ovtt-windows .taskbar') as HTMLElement;
    expect(taskbar.classList.contains('active')).toBe(false);
    handle.restore();
    expect(handle.state).toBe('normal');
    manager.destroy();
  });

  it('stacks multiple windows in the same dock edge', () => {
    const manager = makeManager();
    const a = manager.create({ title: 'A', content: panel('a') });
    const b = manager.create({ title: 'B', content: panel('b') });
    a.dockTo('left');
    b.dockTo('left');
    const stack = host.querySelector('.dock.left .dock-stack') as HTMLElement;
    expect(stack.children.length).toBe(2);
    manager.destroy();
  });

  it('setOptions can hide the taskbar', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'S', content: panel('s') });
    manager.setOptions({ taskbar: false });
    handle.minimize();
    const taskbar = host.querySelector('.ovtt-windows .taskbar') as HTMLElement;
    expect(taskbar.classList.contains('active')).toBe(false);
    manager.destroy();
  });

  it('serialize/restore round-trips registered windows', () => {
    const manager = makeManager();
    manager.register({ id: 'persist', title: 'Persist', factory: () => panel('persist') });
    const handle = manager.open('persist')!;
    handle.moveTo(120, 80);
    const snapshot = manager.serialize();
    expect(snapshot.length).toBe(1);
    expect(snapshot[0].definitionId).toBe('persist');
    manager.closeAll();

    manager.restore(snapshot);
    const after = manager.get('persist')!;
    expect(after).not.toBeNull();
    expect(after.element?.style.left).toBe('120px');
    expect(after.content?.textContent).toBe('persist');
    manager.destroy();
  });

  it('restore ignores orphan definitions silently', () => {
    const manager = makeManager();
    manager.restore([{ id: 'ghost', definitionId: 'missing', x: 0, y: 0, width: 100, height: 100, state: 'normal', dock: 'float' }]);
    expect(manager.list().length).toBe(0);
    manager.destroy();
  });

  it('restoreContent rehydrates window content', () => {
    const manager = makeManager();
    manager.register({
      id: 'stateful',
      title: 'Stateful',
      factory: () => panel(''),
      serializeContent: (el) => (el as HTMLElement).dataset.value,
      restoreContent: (el, data) => { (el as HTMLElement).dataset.value = String(data); },
    });
    const handle = manager.open('stateful')!;
    handle.content!.dataset.value = '42';
    const snapshot = manager.serialize();
    manager.closeAll();
    manager.restore(snapshot as Array<Record<string, unknown>>);
    expect(manager.get('stateful')!.content?.dataset.value).toBe('42');
    manager.destroy();
  });

  it('closeAll empties the manager', () => {
    const manager = makeManager();
    manager.create({ title: '1', content: panel('1') });
    manager.create({ title: '2', content: panel('2') });
    manager.closeAll();
    expect(manager.list().length).toBe(0);
    manager.destroy();
  });

  it('handle.on emits close, state and dock events', () => {
    const manager = makeManager();
    const events: string[] = [];
    const handle = manager.create({ title: 'H', content: panel('h') });
    handle.on('close', () => events.push('close'));
    handle.on('state', () => events.push('state'));
    handle.on('dock', () => events.push('dock'));
    handle.minimize();
    handle.dockTo('right');
    handle.close();
    expect(events).toEqual(['state', 'state', 'dock', 'close']);
    manager.destroy();
  });

  it('constraints clamp resizeTo', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'K', content: panel('k'), width: 300, height: 240, constraints: { minWidth: 250, minHeight: 200 } });
    handle.resizeTo(100, 100);
    expect(handle.element?.style.width).toBe('250px');
    expect(handle.element?.style.height).toBe('200px');
    manager.destroy();
  });

  it('resize accumulates deltas across events (no flicker back to start)', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'R', content: panel('r'), width: 300, height: 200, x: 10, y: 10 });
    const frame = handle.element!;
    frame.dispatchEvent(new CustomEvent('frame-resize-start', { detail: { dir: 'se' } }));
    frame.dispatchEvent(new CustomEvent('frame-resize', { detail: { dir: 'se', dx: 20, dy: 10, altKey: false, clientX: 0, clientY: 0 } }));
    frame.dispatchEvent(new CustomEvent('frame-resize', { detail: { dir: 'se', dx: 30, dy: 5, altKey: false, clientX: 0, clientY: 0 } }));
    frame.dispatchEvent(new CustomEvent('frame-resize-end', { detail: {} }));
    expect(frame.style.width).toBe('350px');
    expect(frame.style.height).toBe('215px');
    manager.destroy();
  });

  it('maximize is a no-op when the window is not resizable', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'NR', content: panel('nr'), resizable: false });
    handle.maximize();
    expect(handle.state).toBe('normal');
    manager.destroy();
  });

  it('docked maximize hides siblings and restore brings them back', () => {
    const manager = makeManager();
    const a = manager.create({ title: 'A', content: panel('a') });
    const b = manager.create({ title: 'B', content: panel('b') });
    a.dockTo('left');
    b.dockTo('left');
    a.maximize();
    expect(a.state).toBe('maximized');
    expect(b.element!.style.display).toBe('none');
    a.restore();
    expect(a.state).toBe('normal');
    expect(b.element!.style.display).not.toBe('none');
    expect(a.element!.style.flex).toBe('');
    manager.destroy();
  });

  it('collapsed docked window restores via the titlebar button', () => {
    const manager = makeManager();
    const handle = manager.create({ title: 'C', content: panel('c') });
    handle.dockTo('left');
    handle.minimize();
    expect(handle.state).toBe('minimized');
    expect(handle.element!.getAttribute('state')).toBe('collapsed');
    const minBtn = handle.element!.shadowRoot!.querySelector('.wbtn.min') as HTMLElement;
    expect(minBtn).not.toBeNull();
    minBtn.click();
    expect(handle.state).toBe('normal');
    expect(handle.element!.getAttribute('state')).toBe('normal');
    manager.destroy();
  });
});
