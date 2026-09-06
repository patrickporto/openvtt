import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { CanvasBus } from '@openvtt/canvas';
import type { WindowFrameElement } from '../src/frame';

GlobalRegistrator.register();

const { createCanvasBus, dynamicBus } = await import('@openvtt/canvas');
const { WindowManager } = await import('../src/manager');

interface PointerInit {
  clientX?: number;
  clientY?: number;
  button?: number;
  altKey?: boolean;
}

function pointer(type: string, init: PointerInit = {}): PointerEvent {
  const Ctor = (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent ?? Event;
  const base = { bubbles: true, composed: true, cancelable: true };
  if (Ctor === Event) {
    const event = new Event(type, base);
    Object.assign(event, { clientX: init.clientX ?? 0, clientY: init.clientY ?? 0, button: init.button ?? 0, altKey: init.altKey ?? false });
    return event as PointerEvent;
  }
  return new PointerEvent(type, { ...base, clientX: init.clientX ?? 0, clientY: init.clientY ?? 0, button: init.button ?? 0, altKey: init.altKey ?? false });
}

let host: HTMLElement;
let bus: CanvasBus;

beforeAll(() => {
  host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(host);
  bus = createCanvasBus();
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function panel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
}

function titlebarOf(handle: { element: HTMLElement | null }): HTMLElement {
  return (handle.element as WindowFrameElement).shadowRoot!.querySelector('.titlebar') as HTMLElement;
}

function dragTitlebar(handle: { element: HTMLElement | null }, from: { x: number; y: number }, to: { x: number; y: number }): void {
  titlebarOf(handle).dispatchEvent(pointer('pointerdown', { clientX: from.x, clientY: from.y }));
  document.dispatchEvent(pointer('pointermove', { clientX: to.x, clientY: to.y }));
  document.dispatchEvent(pointer('pointerup', { clientX: to.x, clientY: to.y }));
}

describe('dock divider resize (DOM)', () => {
  it('bottom divider grows when dragged up and shrinks when dragged down', () => {
    const manager = new WindowManager({ bus, host });
    manager.create({ title: 'B', content: panel('b') }).dockTo('bottom');
    const dock = host.querySelector('.dock.bottom') as HTMLElement;
    const divider = dock.querySelector('.dock-divider') as HTMLElement;

    divider.dispatchEvent(pointer('pointerdown', { clientX: 400, clientY: 380 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 400, clientY: 340 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 400, clientY: 340 }));
    expect(dock.style.height).toBe('260px');

    divider.dispatchEvent(pointer('pointerdown', { clientX: 400, clientY: 340 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 400, clientY: 380 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 400, clientY: 380 }));
    expect(dock.style.height).toBe('220px');
    manager.destroy();
  });

  it('left divider grows when dragged right', () => {
    const manager = new WindowManager({ bus, host });
    manager.create({ title: 'L', content: panel('l') }).dockTo('left');
    const divider = host.querySelector('.dock.left .dock-divider') as HTMLElement;
    divider.dispatchEvent(pointer('pointerdown', { clientX: 280, clientY: 300 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 300 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 300 }));
    expect((host.querySelector('.dock.left') as HTMLElement).style.width).toBe('300px');
    manager.destroy();
  });

  it('right divider grows when dragged left', () => {
    const manager = new WindowManager({ bus, host });
    manager.create({ title: 'R', content: panel('r') }).dockTo('right');
    const divider = host.querySelector('.dock.right .dock-divider') as HTMLElement;
    divider.dispatchEvent(pointer('pointerdown', { clientX: 520, clientY: 300 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 500, clientY: 300 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 500, clientY: 300 }));
    expect((host.querySelector('.dock.right') as HTMLElement).style.width).toBe('300px');
    manager.destroy();
  });
});

describe('dockable edges', () => {
  it('manager dockableEdges restricts programmatic docking', () => {
    const manager = new WindowManager({ bus, host }, { dockableEdges: ['left'] });
    const handle = manager.create({ title: 'A', content: panel('a') });
    expect(handle.dockTo('right')).toBe(false);
    expect(handle.dock).toBe('float');
    expect(handle.dockTo('bottom')).toBe(false);
    expect(handle.dockTo('left')).toBe(true);
    expect(handle.dock).toBe('left');
    manager.destroy();
  });

  it('dockableEdges false disables docking entirely but keeps undock working', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), dock: 'left', dockableEdges: false });
    expect(handle.dock).toBe('float');
    manager.destroy();

    const other = new WindowManager({ bus, host }, { dockableEdges: false });
    const docked = other.create({ title: 'D', content: panel('d') });
    docked.dockTo('left');
    expect(docked.dock).toBe('float');
    manager.destroy();
    other.destroy();
  });

  it('window dockableEdges intersects manager dockableEdges', () => {
    const manager = new WindowManager({ bus, host }, { dockableEdges: ['left', 'bottom'] });
    const handle = manager.create({ title: 'A', content: panel('a'), dockableEdges: ['right', 'bottom'] });
    expect(handle.dockTo('right')).toBe(false);
    expect(handle.dockTo('left')).toBe(false);
    expect(handle.dockTo('bottom')).toBe(true);
    manager.destroy();
  });

  it('create ignores a dock target that is not allowed', () => {
    const manager = new WindowManager({ bus, host }, { dockableEdges: ['left'] });
    const handle = manager.create({ title: 'A', content: panel('a'), dock: 'right' });
    expect(handle.dock).toBe('float');
    manager.destroy();
  });

  it('drag near a disallowed edge shows no preview and does not dock', () => {
    const manager = new WindowManager({ bus, host }, { dockableEdges: ['left'] });
    const handle = manager.create({ title: 'A', content: panel('a'), x: 300, y: 200 });
    titlebarOf(handle).dispatchEvent(pointer('pointerdown', { clientX: 350, clientY: 215 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 795, clientY: 300 }));
    const preview = host.querySelector('.dock-preview') as HTMLElement;
    expect(preview.classList.contains('active')).toBe(false);
    document.dispatchEvent(pointer('pointerup', { clientX: 795, clientY: 300 }));
    expect(handle.dock).toBe('float');
    manager.destroy();
  });

  it('drag near an allowed edge previews and docks on release', () => {
    const manager = new WindowManager({ bus, host }, { dockableEdges: ['left'] });
    const handle = manager.create({ title: 'A', content: panel('a'), x: 300, y: 200 });
    titlebarOf(handle).dispatchEvent(pointer('pointerdown', { clientX: 350, clientY: 215 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 5, clientY: 300 }));
    const preview = host.querySelector('.dock-preview') as HTMLElement;
    expect(preview.classList.contains('active')).toBe(true);
    expect(preview.classList.contains('left')).toBe(true);
    document.dispatchEvent(pointer('pointerup', { clientX: 5, clientY: 300 }));
    expect(handle.dock).toBe('left');
    manager.destroy();
  });

  it('restore falls back to float when the persisted edge is no longer allowed', () => {
    const manager = new WindowManager({ bus, host }, { dockableEdges: ['left'] });
    manager.register({ id: 'w', title: 'W', factory: () => panel('w') });
    manager.restore([{ id: 'w', definitionId: 'w', x: 10, y: 10, width: 300, height: 200, state: 'normal', dock: 'right' }]);
    expect(manager.get('w')!.dock).toBe('float');
    manager.destroy();
  });

  it('setOptions can disable docking for subsequent gestures', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), x: 300, y: 200 });
    manager.setOptions({ dockableEdges: false });
    dragTitlebar(handle, { x: 350, y: 215 }, { x: 400, y: 590 });
    expect(handle.dock).toBe('float');
    manager.destroy();
  });
});

describe('interactive detach', () => {
  it('dragging a docked titlebar detaches the window under the pointer', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 360, height: 320 });
    handle.dockTo('bottom');
    const events: Array<{ dock: string }> = [];
    dynamicBus(bus).on('window:dock', (payload) => events.push(payload as { dock: string }));

    titlebarOf(handle).dispatchEvent(pointer('pointerdown', { clientX: 400, clientY: 500 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 430, clientY: 520 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 430, clientY: 520 }));

    expect(handle.dock).toBe('float');
    expect(handle.element?.getAttribute('mode')).toBe('float');
    expect(handle.element?.style.left).toBe('250px');
    expect(handle.element?.style.top).toBe('503px');
    expect(events.some((event) => event.dock === 'float')).toBe(true);
    manager.destroy();
  });

  it('a click without movement keeps the window docked', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a') });
    handle.dockTo('left');
    titlebarOf(handle).dispatchEvent(pointer('pointerdown', { clientX: 140, clientY: 100 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 140, clientY: 100 }));
    expect(handle.dock).toBe('left');
    manager.destroy();
  });

  it('a collapsed (docked+minimized) window cannot be dragged out', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a') });
    handle.dockTo('left');
    handle.minimize();
    titlebarOf(handle).dispatchEvent(pointer('pointerdown', { clientX: 140, clientY: 100 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 300 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 300 }));
    expect(handle.dock).toBe('left');
    expect(handle.state).toBe('minimized');
    manager.destroy();
  });

  it('a detached window can be dragged straight to another edge and re-docks', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a') });
    handle.dockTo('left');
    titlebarOf(handle).dispatchEvent(pointer('pointerdown', { clientX: 140, clientY: 100 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 150 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 400, clientY: 590 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 400, clientY: 590 }));
    expect(handle.dock).toBe('bottom');
    manager.destroy();
  });
});

describe('maximize fixes', () => {
  it('maximizable false hides the button and blocks maximize', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), maximizable: false });
    const frame = handle.element as WindowFrameElement;
    expect(frame.shadowRoot!.querySelector('.wbtn.max')).toBeNull();
    const states: string[] = [];
    dynamicBus(bus).on('window:state', () => states.push('state'));
    handle.maximize();
    expect(handle.state).toBe('normal');
    expect(states).toEqual([]);
    manager.destroy();
  });

  it('docked maximize hides siblings and restore brings them back', () => {
    const manager = new WindowManager({ bus, host });
    const a = manager.create({ title: 'A', content: panel('a') });
    const b = manager.create({ title: 'B', content: panel('b') });
    a.dockTo('left');
    b.dockTo('left');
    a.maximize();
    expect(a.state).toBe('maximized');
    expect(b.element?.style.display).toBe('none');
    a.restore();
    expect(a.state).toBe('normal');
    expect(b.element?.style.display).not.toBe('none');
    expect(a.element?.style.flex).toBe('');
    manager.destroy();
  });

  it('docked maximize also hides collapsed siblings and restore re-shows them', () => {
    const manager = new WindowManager({ bus, host });
    const a = manager.create({ title: 'A', content: panel('a') });
    const b = manager.create({ title: 'B', content: panel('b') });
    a.dockTo('left');
    b.dockTo('left');
    b.minimize();
    expect(b.element?.getAttribute('state')).toBe('collapsed');
    a.maximize();
    expect(b.element?.style.display).toBe('none');
    a.restore();
    expect(b.element?.style.display).not.toBe('none');
    expect(b.element?.getAttribute('state')).toBe('collapsed');
    manager.destroy();
  });

  it('undock returns whether the window was actually floated', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a') });
    expect(handle.undock()).toBe(false);
    handle.dockTo('left');
    expect(handle.undock()).toBe(true);
    expect(handle.dock).toBe('float');
    manager.destroy();
  });

  it('undocking a collapsed window restores it to normal floating', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a') });
    handle.dockTo('left');
    handle.minimize();
    expect(handle.state).toBe('minimized');
    expect(handle.undock()).toBe(true);
    expect(handle.dock).toBe('float');
    expect(handle.state).toBe('normal');
    expect(handle.element?.getAttribute('state')).toBe('normal');
    expect(handle.element?.style.display).not.toBe('none');
    manager.destroy();
  });

  it('moveTo reports whether the move was allowed', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a') });
    expect(handle.moveTo(40, 30)).toBe(true);
    expect(handle.element?.style.left).toBe('40px');
    handle.dockTo('left');
    expect(handle.moveTo(0, 0)).toBe(false);
    manager.destroy();
  });
});
