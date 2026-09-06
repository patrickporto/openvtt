import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { WindowFrameElement, ResizeDir } from '../src/frame';

GlobalRegistrator.register();

const { defineWindowElements, WINDOW_FRAME_TAG } = await import('../src/frame');
const { createCanvasBus } = await import('@openvtt/canvas');
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

beforeAll(() => {
  defineWindowElements();
  host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function createFrame(): WindowFrameElement {
  return document.createElement(WINDOW_FRAME_TAG) as WindowFrameElement;
}

function shadow(frame: WindowFrameElement, selector: string): HTMLElement {
  return frame.shadowRoot!.querySelector(selector) as HTMLElement;
}

function collect(frame: WindowFrameElement): Array<{ name: string; detail: unknown }> {
  const events: Array<{ name: string; detail: unknown }> = [];
  for (const name of ['frame-command', 'frame-drag-start', 'frame-drag', 'frame-drag-end', 'frame-resize-start', 'frame-resize', 'frame-resize-end', 'frame-focus']) {
    frame.addEventListener(name, (event) => events.push({ name, detail: (event as CustomEvent).detail }));
  }
  return events;
}

describe('WindowFrameElement (DOM)', () => {
  it('renders title, buttons per flags and content', () => {
    const frame = createFrame();
    frame.setTitle('Hello');
    frame.setFlags({ closable: true, minimizable: true, maximizable: true, resizable: true });
    host.appendChild(frame);
    expect(shadow(frame, '.title').textContent).toBe('Hello');
    expect(shadow(frame, '.wbtn.close')).not.toBeNull();
    expect(shadow(frame, '.wbtn.min')).not.toBeNull();
    expect(shadow(frame, '.wbtn.max')).not.toBeNull();
    const content = document.createElement('span');
    content.textContent = 'body';
    frame.setContent(content);
    expect(shadow(frame, '.content').contains(content)).toBe(true);
    frame.remove();
  });

  it('hides buttons when flags are off', () => {
    const frame = createFrame();
    frame.setTitle('X');
    frame.setFlags({ closable: false, minimizable: false, maximizable: false, resizable: false });
    host.appendChild(frame);
    expect(shadow(frame, '.wbtn.close')).toBeNull();
    expect(shadow(frame, '.wbtn.min')).toBeNull();
    expect(shadow(frame, '.wbtn.max')).toBeNull();
    expect(frame.getAttribute('resizable')).toBeNull();
    frame.remove();
  });

  it('hides the maximize button when not resizable', () => {
    const frame = createFrame();
    frame.setTitle('X');
    frame.setFlags({ closable: true, minimizable: true, maximizable: true, resizable: false });
    host.appendChild(frame);
    expect(shadow(frame, '.wbtn.max')).toBeNull();
    expect(shadow(frame, '.wbtn.min')).not.toBeNull();
    frame.remove();
  });

  it('emits frame-command from titlebar buttons and double-click', () => {
    const frame = createFrame();
    frame.setTitle('C');
    host.appendChild(frame);
    const events = collect(frame);
    shadow(frame, '.wbtn.close').click();
    shadow(frame, '.wbtn.min').click();
    shadow(frame, '.wbtn.max').click();
    shadow(frame, '.titlebar').dispatchEvent(new Event('dblclick', { bubbles: true }));
    const commands = events.filter((e) => e.name === 'frame-command').map((e) => (e.detail as { command: string }).command);
    expect(commands).toEqual(['close', 'minimize', 'maximize', 'maximize']);
    frame.remove();
  });

  it('maximized state swaps the maximize button to restore', () => {
    const frame = createFrame();
    frame.setTitle('M');
    host.appendChild(frame);
    frame.setAttribute('state', 'maximized');
    const events = collect(frame);
    shadow(frame, '.wbtn.max').click();
    expect(events.filter((e) => e.name === 'frame-command')[0]?.detail).toEqual({ command: 'restore' });
    frame.remove();
  });

  it('titlebar drag emits start/delta/end events', () => {
    const frame = createFrame();
    frame.setTitle('D');
    frame.setAttribute('mode', 'float');
    host.appendChild(frame);
    const events = collect(frame);
    const titlebar = shadow(frame, '.titlebar');
    titlebar.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 50 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 130, clientY: 70 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 140, clientY: 80 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 140, clientY: 80 }));
    const drag = events.find((e) => e.name === 'frame-drag')?.detail as { dx: number; dy: number };
    expect(drag).toEqual({ dx: 30, dy: 20, altKey: false, clientX: 130, clientY: 70 });
    expect(events.some((e) => e.name === 'frame-drag-start')).toBe(true);
    expect(events.some((e) => e.name === 'frame-drag-end')).toBe(true);
    frame.remove();
  });

  it('resize handles emit resize events with direction', () => {
    const frame = createFrame();
    frame.setTitle('R');
    frame.setAttribute('mode', 'float');
    host.appendChild(frame);
    const events = collect(frame);
    const handle = shadow(frame, "[data-dir='se']");
    handle.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 20, clientY: 10 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 20, clientY: 10 }));
    const resize = events.find((e) => e.name === 'frame-resize')?.detail as { dir: ResizeDir; dx: number; dy: number };
    expect(resize?.dir).toBe('se');
    expect(resize?.dx).toBe(20);
    expect(resize?.dy).toBe(10);
    expect(events.some((e) => e.name === 'frame-resize-end')).toBe(true);
    frame.remove();
  });

  it('pointerdown anywhere emits frame-focus', () => {
    const frame = createFrame();
    frame.setTitle('F');
    host.appendChild(frame);
    const events = collect(frame);
    frame.dispatchEvent(pointer('pointerdown', { clientX: 1, clientY: 1 }));
    expect(events.some((e) => e.name === 'frame-focus')).toBe(true);
    frame.remove();
  });

  it('collapsed state is reflected on the host attribute', () => {
    const frame = createFrame();
    frame.setTitle('K');
    host.appendChild(frame);
    frame.setAttribute('state', 'collapsed');
    expect(frame.getAttribute('state')).toBe('collapsed');
    expect(frame.frameState).toBe('collapsed');
    frame.remove();
  });

  it('manager drag applies geometry to the frame', () => {
    const bus = createCanvasBus();
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'G', content: document.createElement('div'), width: 300, height: 200, x: 0, y: 0 });
    const frame = handle.element!;
    const titlebar = frame.shadowRoot!.querySelector('.titlebar') as HTMLElement;
    titlebar.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }));
    document.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 30 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 40, clientY: 30 }));
    expect(frame.style.left).toBe('30px');
    expect(frame.style.top).toBe('20px');
    manager.destroy();
  });
});
