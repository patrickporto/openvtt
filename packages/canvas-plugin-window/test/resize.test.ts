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

function startResize(handle: { element: HTMLElement | null }, dir: string, x: number, y: number): void {
  const frame = handle.element as WindowFrameElement;
  const grip = frame.shadowRoot!.querySelector(`[data-dir='${dir}']`) as HTMLElement;
  grip.dispatchEvent(pointer('pointerdown', { clientX: x, clientY: y }));
}

describe('resize feedback (DOM)', () => {
  it('marks the frame resize-blocked and emits window:resize-blocked once when constraints clamp', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, x: 100, y: 100, constraints: { maxWidth: 350 } });
    const blocked: string[] = [];
    const unblocked = dynamicBus(bus).on('window:resize-blocked', () => blocked.push('blocked'));

    startResize(handle, 'se', 400, 300);
    document.dispatchEvent(pointer('pointermove', { clientX: 460, clientY: 330 }));
    expect(handle.element?.getAttribute('resize-blocked')).toBe('');
    document.dispatchEvent(pointer('pointermove', { clientX: 500, clientY: 360 }));
    expect(blocked).toEqual(['blocked']);
    document.dispatchEvent(pointer('pointerup', { clientX: 500, clientY: 360 }));
    expect(handle.element?.getAttribute('resize-blocked')).toBeNull();
    unblocked();
    manager.destroy();
  });

  it('emits window:resize with the final geometry when the gesture ends', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, x: 100, y: 100, constraints: { maxWidth: 350 } });
    const sizes: Array<{ width: number; height: number }> = [];
    const unsub = dynamicBus(bus).on('window:resize', (payload) => sizes.push(payload as { width: number; height: number }));

    startResize(handle, 'se', 400, 300);
    document.dispatchEvent(pointer('pointermove', { clientX: 500, clientY: 400 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 500, clientY: 400 }));

    expect(sizes).toEqual([{ id: expect.any(String), width: 350, height: 300 }]);
    expect(handle.element?.style.width).toBe('350px');
    unsub();
    manager.destroy();
  });

  it('caps a south-east resize at the overlay bounds', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 150, height: 120, x: 600, y: 450 });
    startResize(handle, 'se', 750, 570);
    document.dispatchEvent(pointer('pointermove', { clientX: 850, clientY: 670 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 850, clientY: 670 }));
    expect(handle.element?.style.width).toBe('200px');
    expect(handle.element?.style.height).toBe('150px');
    manager.destroy();
  });

  it('keeps the east edge pinned when a west resize clamps at minWidth', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, x: 100, y: 100, constraints: { minWidth: 250 } });
    startResize(handle, 'w', 100, 150);
    document.dispatchEvent(pointer('pointermove', { clientX: 180, clientY: 150 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 180, clientY: 150 }));
    expect(handle.element?.style.width).toBe('250px');
    expect(handle.element?.style.left).toBe('150px');
    manager.destroy();
  });

  it('docked inner resize gives blocked feedback at the minimum and emits resize on end', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a') });
    handle.dockTo('left');
    const blocked: string[] = [];
    const resized: Array<Record<string, number>> = [];
    const unsubB = dynamicBus(bus).on('window:resize-blocked', () => blocked.push('blocked'));
    const unsubR = dynamicBus(bus).on('window:resize', (payload) => resized.push(payload as Record<string, number>));

    startResize(handle, 's', 140, 400);
    document.dispatchEvent(pointer('pointermove', { clientX: 140, clientY: 100 }));
    expect(handle.element?.getAttribute('resize-blocked')).toBe('');
    expect(handle.element?.style.flex).toBe('0 0 120px');
    document.dispatchEvent(pointer('pointerup', { clientX: 140, clientY: 100 }));
    expect(handle.element?.getAttribute('resize-blocked')).toBeNull();
    expect(blocked).toEqual(['blocked']);
    expect(resized.length).toBe(1);
    expect(resized[0].height).toBe(120);
    unsubB();
    unsubR();
    manager.destroy();
  });

  it('resizeTo reports whether the requested size was applied exactly', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, x: 100, y: 100, constraints: { minWidth: 250 } });
    const sizes: Array<Record<string, number>> = [];
    const unsub = dynamicBus(bus).on('window:resize', (payload) => sizes.push(payload as Record<string, number>));

    expect(handle.resizeTo(400, 300)).toBe(true);
    expect(handle.resizeTo(100, 100)).toBe(false);
    expect(handle.element?.style.width).toBe('250px');
    expect(sizes.map((entry) => entry.width)).toEqual([400, 250]);

    const docked = manager.create({ title: 'D', content: panel('d') });
    docked.dockTo('left');
    expect(docked.resizeTo(400, 300)).toBe(false);
    unsub();
    manager.destroy();
  });

  it('resizable false windows reject gesture resize', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, x: 100, y: 100, resizable: false });
    startResize(handle, 'se', 400, 300);
    document.dispatchEvent(pointer('pointermove', { clientX: 500, clientY: 400 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 500, clientY: 400 }));
    expect(handle.element?.style.width).toBe('300px');
    manager.destroy();
  });

  it('handle.on resize fires for programmatic and gesture resizes', () => {
    const manager = new WindowManager({ bus, host });
    const handle = manager.create({ title: 'A', content: panel('a'), width: 300, height: 200, x: 100, y: 100 });
    const events: string[] = [];
    handle.on('resize', () => events.push('resize'));

    handle.resizeTo(320, 220);
    startResize(handle, 'se', 420, 320);
    document.dispatchEvent(pointer('pointermove', { clientX: 450, clientY: 340 }));
    document.dispatchEvent(pointer('pointerup', { clientX: 450, clientY: 340 }));

    expect(events).toEqual(['resize', 'resize']);
    manager.destroy();
  });
});
