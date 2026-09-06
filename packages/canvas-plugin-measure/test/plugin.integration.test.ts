import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { Canvas, PluginContext, ToolContribution } from '@openvtt/canvas';
import { dynamicBus } from '@openvtt/canvas';
import { MeasurePlugin } from '../src/plugin';
import { MEASURE_TOOL_DEFAULTS } from '../src/options';
import { DND5E_METRIC_PRESET } from '../src/presets';
import { resolveMeasureOptions } from '../src/resolve';

let CanvasCtor: typeof Canvas;
let canvas: Canvas;
let plugin: MeasurePlugin;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
  canvas = new CanvasCtor({} as HTMLElement);
  plugin = new MeasurePlugin();
  await canvas.use(plugin);
  (canvas as unknown as { tools: unknown }).tools = { options: {} as Record<string, unknown>, destroy: () => {} };
  });


afterAll(() => {
  canvas?.destroy();
});

beforeEach(() => {
  plugin.setMetrics('cells');
  plugin.setSeparator(' · ');
});

describe('MeasurePlugin install', () => {
  it('registra o evento measure no bus', () => {
    expect(canvas.bus.hasEvent('measure')).toBe(true);
  });

  it('expõe as métricas padrão (células)', () => {
    expect(plugin.metrics()).toEqual([{ perCell: 1, suffix: ' u', precision: 1 }]);
    expect(plugin.options().separator).toBe(' · ');
  });

  it('registra defaults de tool válidos que sobrevivem ao merge do ToolManager', () => {
    let contribution: ToolContribution | undefined;
    const capture = new MeasurePlugin();
    capture.install({
      canvas: {} as Canvas,
      bus: { registerEvent: () => {} },
      registerTool: (c: ToolContribution) => {
        contribution = c;
      },
    } as unknown as PluginContext);
    expect(contribution?.tool).toBeDefined();
    expect(resolveMeasureOptions(contribution?.defaults)).toEqual(MEASURE_TOOL_DEFAULTS);
    const merged = resolveMeasureOptions({
      ...contribution?.defaults,
      metrics: DND5E_METRIC_PRESET.metrics.map((metric) => ({ ...metric })),
    });
    expect(merged.metrics).toHaveLength(2);
    expect(merged.separator).toBe(' · ');
  });
});

describe('setMetrics', () => {
  it('aplica um preset embutido pelo id', () => {
    plugin.setMetrics('dnd5e-metric');
    expect(plugin.metrics()).toHaveLength(2);
    expect(plugin.metrics().map((metric) => metric.suffix)).toEqual([' ft', ' m']);
    expect((canvas.tools.options['measure'] as { metrics: unknown[] }).metrics).toHaveLength(2);
  });

  it('valida métricas customizadas com valibot', () => {
    plugin.setMetrics([{ perCell: 2, suffix: ' sq' }]);
    expect(plugin.metrics()).toEqual([{ perCell: 2, suffix: ' sq', precision: 1 }]);
    expect(() => plugin.setMetrics([])).toThrow();
    expect(() => plugin.setMetrics([{ perCell: 0 }])).toThrow();
  });

  it('rejeita ids de preset desconhecidos', () => {
    expect(() => plugin.setMetrics('lightyears')).toThrow(/Unknown measure metric preset/);
  });

  it('mantém o separador ao trocar métricas', () => {
    plugin.setSeparator(' / ');
    plugin.setMetrics('cells');
    expect(plugin.options()).toEqual({ metrics: [{ perCell: 1, suffix: ' u', precision: 1 }], separator: ' / ' });
  });

  it('rejeita separadores inválidos no write', () => {
    expect(() => plugin.setSeparator(42 as unknown as string)).toThrow();
    expect(plugin.options().separator).toBe(' · ');
  });
});

describe('evento measure', () => {
  it('valida payload com métricas e label prontos', () => {
    plugin.setMetrics('dnd5e-metric');
    const events: unknown[] = [];
    const port = dynamicBus(canvas.bus);
    const unsub = port.on('measure', (payload: unknown) => events.push(payload));
    expect(() =>
      port.emit('measure', {
        pixels: 300,
        units: 6,
        x1: 0,
        y1: 0,
        x2: 300,
        y2: 0,
        segments: 1,
        metrics: [
          { perCell: 5, suffix: ' ft', precision: 1, value: 30 },
          { perCell: 1.5, suffix: ' m', precision: 1, value: 9 },
        ],
        label: '30 ft · 9 m',
      }),
    ).not.toThrow();
    unsub();
    expect(events).toHaveLength(1);
  });
});

describe('ciclo de vida', () => {
  it('uninstall desativa a API de opções', async () => {
    plugin.setMetrics('dnd5e');
    (canvas as unknown as { tools: unknown }).tools = undefined;
    await canvas.plugins.unuse('measure');
    expect(plugin.metrics()).toEqual([{ perCell: 1, suffix: ' u', precision: 1 }]);
    plugin.setMetrics('metric');
    expect(plugin.metrics()).toEqual([{ perCell: 1, suffix: ' u', precision: 1 }]);
    await canvas.use(plugin);
    (canvas as unknown as { tools: unknown }).tools = { options: {} as Record<string, unknown>, destroy: () => {} };
    plugin.setMetrics('cells');
    expect(plugin.metrics()[0].perCell).toBe(1);
  });
});
