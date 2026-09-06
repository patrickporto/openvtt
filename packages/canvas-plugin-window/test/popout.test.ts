import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { CanvasBus } from '@openvtt/canvas';
import type { WindowFrameElement } from '../src/frame';

GlobalRegistrator.register();

const { createCanvasBus, dynamicBus } = await import('@openvtt/canvas');
const { WindowManager } = await import('../src/manager');

interface FakeWindow {
  document: {
    title: string;
    body: HTMLElement;
    head: HTMLElement;
    createElement: (tag: string) => HTMLElement;
    adoptNode: (node: Node) => Node;
  };
  closed: boolean;
  openCalls: Array<{ url?: string; target?: string; features?: string }>;
  close(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  dispatch(type: string): void;
}

function makeFakeWindow(): FakeWindow {
  const listeners = new Map<string, Array<() => void>>();
  const fake = {
    document: {
      title: '',
      body: document.createElement('div'),
      head: document.createElement('div'),
      createElement: (tag: string) => document.createElement(tag),
      adoptNode: (node: Node) => node,
    },
    closed: false,
    openCalls: [] as Array<{ url?: string; target?: string; features?: string }>,
    close(): void {
      fake.closed = true;
    },
    addEventListener(type: string, listener: () => void): void {
      const set = listeners.get(type) ?? [];
      set.push(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: () => void): void {
      const set = (listeners.get(type) ?? []).filter((fn) => fn !== listener);
      listeners.set(type, set);
    },
    dispatch(type: string): void {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
  } as FakeWindow;
  return fake;
}

let host: HTMLElement;
let bus: CanvasBus;
let openCalls: Array<{ url?: string; target?: string; features?: string }>;
let current: FakeWindow | null;
const originalOpen = (globalThis as { open?: unknown }).open;

function stubOpen(): void {
  openCalls = [];
  current = null;
  (globalThis as { open?: unknown }).open = (url?: string, target?: string, features?: string) => {
    const call = { url, target, features };
    openCalls.push(call);
    current?.openCalls.push(call);
    return current;
  };
}

function restoreOpen(): void {
  (globalThis as { open?: unknown }).open = originalOpen;
}

beforeAll(() => {
  host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(host);
  bus = createCanvasBus();
});

afterAll(() => {
  restoreOpen();
  GlobalRegistrator.unregister();
});

function panel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
}

describe('popout (DOM)', () => {
  it('is disabled by default: no button and popout() refuses', () => {
    stubOpen();
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    const frame = handle.element as WindowFrameElement;
    expect(frame.shadowRoot!.querySelector('.wbtn.popout')).toBeNull();
    expect(handle.popout()).toBe(false);
    expect(handle.poppedOut).toBe(false);
    expect(openCalls.length).toBe(0);
    manager.destroy();
    restoreOpen();
  });

  it('moves the content to the popout window and hides the frame', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, popoutable: true });
    const frame = handle.element as WindowFrameElement;
    expect(frame.shadowRoot!.querySelector('.wbtn.popout')).not.toBeNull();

    const seen: string[] = [];
    handle.on('popout', () => seen.push('popout'));
    dynamicBus(bus).on('window:popout', (payload) => seen.push((payload as { id: string }).id));

    expect(handle.popout()).toBe(true);
    expect(openCalls.length).toBe(1);
    expect(openCalls[0].features).toContain('width=300');
    expect(current!.document.title).toBe('A');
    expect(handle.content!.parentElement).toBe(current!.document.body);
    expect(handle.poppedOut).toBe(true);
    expect(frame.style.display).toBe('none');
    expect(seen).toEqual(['popout', handle.id]);
    manager.destroy();
    restoreOpen();
  });

  it('popin brings the content back and closes the popout window', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    handle.popout();

    const seen: string[] = [];
    handle.on('popin', () => seen.push('popin'));
    dynamicBus(bus).on('window:popin', (payload) => seen.push((payload as { id: string }).id));

    expect(handle.popin()).toBe(true);
    const frame = handle.element as WindowFrameElement;
    const contentHost = frame.shadowRoot!.querySelector('.content') as HTMLElement;
    expect(contentHost.contains(handle.content)).toBe(true);
    expect(handle.poppedOut).toBe(false);
    expect(frame.style.display).not.toBe('none');
    expect(current!.closed).toBe(true);
    expect(seen).toEqual(['popin', handle.id]);
    expect(handle.popin()).toBe(false);
    manager.destroy();
    restoreOpen();
  });

  it('closing the popout window pops the content back in', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    handle.popout();
    current!.dispatch('beforeunload');
    expect(handle.poppedOut).toBe(false);
    const frame = handle.element as WindowFrameElement;
    expect((frame.shadowRoot!.querySelector('.content') as HTMLElement).contains(handle.content)).toBe(true);
    manager.destroy();
    restoreOpen();
  });

  it('returns false when the browser blocks the popup', () => {
    stubOpen();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    expect(handle.popout()).toBe(false);
    expect(handle.poppedOut).toBe(false);
    expect(handle.element?.style.display).not.toBe('none');
    manager.destroy();
    restoreOpen();
  });

  it('refuses popout of non-popoutable or minimized windows', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const plain = manager.create({ title: 'P', content: panel('p') });
    expect(plain.popout()).toBe(false);

    const minimized = manager.create({ title: 'M', content: panel('m'), popoutable: true });
    minimized.minimize();
    expect(minimized.popout()).toBe(false);
    manager.destroy();
    restoreOpen();
  });

  it('shows popped-out windows in the taskbar and clicking pops them in', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const a = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    const b = manager.create({ title: 'B', content: panel('b'), popoutable: true });
    a.popout();
    b.popout();
    const taskbar = host.querySelector('.ovtt-windows .taskbar') as HTMLElement;
    expect(taskbar.classList.contains('active')).toBe(true);
    const buttons = [...taskbar.querySelectorAll('button')];
    expect(buttons.length).toBe(2);
    (buttons[0] as HTMLElement).click();
    expect(a.poppedOut).toBe(false);
    expect(b.poppedOut).toBe(true);
    manager.destroy();
    restoreOpen();
  });

  it('setOptions can enable popout for existing windows', () => {
    stubOpen();
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    const frame = handle.element as WindowFrameElement;
    expect(frame.shadowRoot!.querySelector('.wbtn.popout')).toBeNull();
    manager.setOptions({ popout: true });
    expect(frame.shadowRoot!.querySelector('.wbtn.popout')).not.toBeNull();
    manager.destroy();
    restoreOpen();
  });

  it('the titlebar popout button triggers popout via frame-command', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    const frame = handle.element as WindowFrameElement;
    (frame.shadowRoot!.querySelector('.wbtn.popout') as HTMLElement).click();
    expect(handle.poppedOut).toBe(true);
    manager.destroy();
    restoreOpen();
  });

  it('closing a popped-out window detaches the unload listener', () => {
    stubOpen();
    const fake = makeFakeWindow();
    current = fake;
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    handle.popout();
    handle.close();
    expect(manager.list().length).toBe(0);
    fake.dispatch('beforeunload');
    expect(manager.list().length).toBe(0);
    manager.destroy();
    restoreOpen();
  });

  it('destroy with popped-out windows does not throw', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    manager.create({ title: 'A', content: panel('a'), popoutable: true }).popout();
    expect(() => manager.destroy()).not.toThrow();
    restoreOpen();
  });

  it('popped-out state is not persisted as popped-out on restore', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    manager.register({ id: 'w', title: 'W', factory: () => panel('w'), popoutable: true });
    manager.open('w')!.popout();
    const snapshot = manager.serialize();
    manager.closeAll();
    manager.restore(snapshot);
    expect(manager.get('w')!.poppedOut).toBe(false);
    manager.destroy();
    restoreOpen();
  });

  it('docking, undock, maximize and minimize are refused while popped out', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    handle.dockTo('left');
    handle.popout();
    expect(handle.dockTo('right')).toBe(false);
    expect(handle.undock()).toBe(false);
    expect(handle.dock).toBe('left');
    handle.maximize();
    expect(handle.state).toBe('normal');
    handle.minimize();
    expect(handle.state).toBe('normal');
    const taskbar = host.querySelector('.ovtt-windows .taskbar') as HTMLElement;
    expect(taskbar.querySelectorAll('button').length).toBe(1);
    manager.destroy();
    restoreOpen();
  });

  it('an empty dock panel deactivates while its only window is popped out', () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    const handle = manager.create({ title: 'A', content: panel('a'), popoutable: true });
    handle.dockTo('left');
    const dock = host.querySelector('.dock.left') as HTMLElement;
    expect(dock.classList.contains('active')).toBe(true);
    handle.popout();
    expect(dock.classList.contains('active')).toBe(false);
    handle.popin();
    expect(dock.classList.contains('active')).toBe(true);
    manager.destroy();
    restoreOpen();
  });

  it('a factory resolving during popout delivers content to the popup', async () => {
    stubOpen();
    current = makeFakeWindow();
    const manager = new WindowManager({ bus, host }, { popout: true });
    let deliver: ((el: HTMLElement) => void) | null = null;
    manager.register({
      id: 'slow',
      title: 'Slow',
      popoutable: true,
      factory: () => new Promise<HTMLElement>((resolve) => {
        deliver = (el: HTMLElement) => resolve(el);
      }),
    });
    const handle = manager.open('slow')!;
    handle.popout();
    const late = panel('late');
    deliver!(late);
    await Promise.resolve();
    expect(handle.content).toBe(late);
    expect(late.parentElement).toBe(current!.document.body);
    handle.popin();
    const frame = handle.element as WindowFrameElement;
    expect((frame.shadowRoot!.querySelector('.content') as HTMLElement).contains(late)).toBe(true);
    manager.destroy();
    restoreOpen();
  });

  it('restore skips entries with invalid geometry', () => {
    stubOpen();
    const manager = new WindowManager({ bus, host }, { popout: true });
    manager.register({ id: 'w', title: 'W', factory: () => panel('w') });
    manager.restore([
      { id: 'a', definitionId: 'w', x: Number.NaN, y: 0, width: 100, height: 100, state: 'normal', dock: 'float' },
      { id: 'b', definitionId: 'w', x: '10', y: 0, width: 100, height: 100, state: 'normal', dock: 'float' },
      { id: 'c', definitionId: 'w', x: 5, y: 5, width: 100, height: 100, state: 'normal', dock: 'float' },
    ]);
    expect(manager.list().length).toBe(1);
    expect(manager.list()[0]!.element?.style.left).toBe('5px');
    manager.destroy();
    restoreOpen();
  });
});
