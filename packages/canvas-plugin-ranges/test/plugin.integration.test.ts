import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import { dynamicBus } from '@openvtt/canvas';
import { RangesPlugin } from '../src/plugin';
import { rangesControllerFor } from '../src/controller';

let CanvasCtor: typeof Canvas;
let canvas: Canvas;
let plugin: RangesPlugin;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
  canvas = new CanvasCtor({} as HTMLElement);
  plugin = new RangesPlugin();
  await canvas.use(plugin);
  (canvas as unknown as { tools: unknown }).tools = { options: {} as Record<string, unknown> };
});

afterAll(() => {
  canvas?.destroy();
});

describe('RangesPlugin install', () => {
  it('registra eventos ranges:* e a tool no bus', () => {
    expect(canvas.bus.hasEvent('ranges:placed')).toBe(true);
    expect(canvas.bus.hasEvent('ranges:cleared')).toBe(true);
    expect(rangesControllerFor(canvas)).toBeDefined();
  });
});

describe('colocação de ranges', () => {
  it('place emite ranges:placed com id uuid e anéis resolvidos', () => {
    const events: unknown[] = [];
    const port = dynamicBus(canvas.bus);
    const unsub = port.on('ranges:placed', (payload: unknown) => events.push(payload));

    const range = plugin.place({ x: 100, y: 150 });

    unsub();
    expect(range).not.toBeNull();
    expect(range?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(range?.presetId).toBe('dnd5e');
    expect(events).toHaveLength(1);
    const payload = events[0] as { x: number; y: number; preset: string; rings: number; shape: string };
    expect(payload).toMatchObject({ x: 100, y: 150, preset: 'dnd5e', rings: 5, shape: 'circle' });
  });

  it('respeita maxRanges com evicção FIFO', () => {
    plugin.setOptions({ maxRanges: 2 });
    const first = plugin.place({ x: 0, y: 0, preset: 'basic' });
    const second = plugin.place({ x: 50, y: 0, preset: 'basic' });
    const third = plugin.place({ x: 100, y: 0, preset: 'basic' });

    expect(plugin.active().map((range) => range.id)).toEqual([second?.id, third?.id]);
    expect(plugin.active()).not.toContain(first);
    plugin.clear();
    expect(plugin.active()).toHaveLength(0);
    plugin.setOptions({ maxRanges: 1 });
  });

  it('clear emite ranges:cleared apenas quando há ranges', () => {
    const events: unknown[] = [];
    const port = dynamicBus(canvas.bus);
    const unsub = port.on('ranges:cleared', (payload: unknown) => events.push(payload));

    plugin.clear();
    plugin.place({ x: 10, y: 10 });
    plugin.clear();
    plugin.clear();

    unsub();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ count: 1 });
  });

  it('place com presets esvaziados retorna null sem lançar', () => {
    const ids = [...plugin.presets.keys()];
    for (const id of ids) plugin.removePreset(id);
    expect(plugin.place({ x: 0, y: 0 })).toBeNull();
    for (const id of ids) {
      if (id === 'basic') plugin.addPreset({ id: 'basic', rings: [1, 2, 3] });
      if (id === 'dnd5e') plugin.addPreset({ id: 'dnd5e', unit: { perCell: 5, suffix: ' ft' }, rings: [5, 30, 60, 90, 120] });
      if (id === 'metric') plugin.addPreset({ id: 'metric', unit: { perCell: 1.5, suffix: ' m' }, rings: [1.5, 9, 18, 36] });
    }
    expect(plugin.place({ x: 0, y: 0, preset: 'dnd5e' })).not.toBeNull();
    plugin.clear();
  });
});

describe('removePreset do preset ativo', () => {
  it('recorre ao primeiro preset restante', () => {
    plugin.setOptions({ preset: 'dnd5e' });
    expect(plugin.options().preset).toBe('dnd5e');
    plugin.removePreset('dnd5e');
    expect(plugin.options().preset).toBe('basic');
    plugin.addPreset({ id: 'dnd5e', unit: { perCell: 5, suffix: ' ft' }, rings: [5, 30, 60, 90, 120] });
    plugin.setOptions({ preset: 'dnd5e' });
  });
});

describe('follow tokens', () => {
  it('document:moved move ranges vinculados quando follow está ativo', () => {
    plugin.setOptions({ follow: true });
    const range = plugin.place({ x: 75, y: 75, tokenId: 'tok-1' });

    canvas.bus.emit('document:moved', { type: 'token', id: 'tok-1', x: 200, y: 300 });

    expect(plugin.active()[0]).toMatchObject({ id: range?.id, x: 200, y: 300, tokenId: 'tok-1' });

    canvas.bus.emit('document:delete', { type: 'token', id: 'tok-1' });
    expect(plugin.active()).toHaveLength(0);
    plugin.setOptions({ follow: false });
  });

  it('document:moved é ignorado para outros tipos de documento', () => {
    const range = plugin.place({ x: 10, y: 10 });
    canvas.bus.emit('document:moved', { type: 'template', id: 'other', x: 999, y: 999 });
    expect(plugin.active()[0]).toMatchObject({ id: range?.id, x: 10, y: 10 });
    plugin.clear();
  });
});

describe('ciclo de vida', () => {
  it('scene:setup descarta os ranges ativos', () => {
    plugin.place({ x: 10, y: 10 });
    canvas.bus.call('scene:setup', { width: 1000, height: 800 });
    expect(plugin.active()).toHaveLength(0);
  });

  it('uninstall desregistra o controller e desativa a API', async () => {
    const controller = rangesControllerFor(canvas);
    expect(controller).toBeDefined();
    (canvas as unknown as { tools: unknown }).tools = undefined;
    await canvas.plugins.unuse('ranges');
    expect(rangesControllerFor(canvas)).toBeUndefined();
    expect(plugin.place({ x: 0, y: 0 })).toBeNull();
    expect(plugin.active()).toHaveLength(0);
    await canvas.use(plugin);
    (canvas as unknown as { tools: unknown }).tools = { options: {} as Record<string, unknown> };
    expect(plugin.place({ x: 0, y: 0, preset: 'basic' })).not.toBeNull();
  });
});
