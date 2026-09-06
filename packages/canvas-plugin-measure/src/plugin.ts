import * as v from 'valibot';
import { definePlugin, type Canvas, type PluginContext } from '@openvtt/canvas';
import { MeasureTool } from './tools/MeasureTool';
import { MEASURE_TOOL_DEFAULTS } from './options';
import { resolveMeasureOptions } from './resolve';
import { MEASURE_METRIC_PRESETS } from './presets';
import {
  MeasureEventSchema,
  MeasureToolOptionsSchema,
  defineMeasureMetrics,
  type MeasureEventData,
  type MeasureMetric,
  type MeasureMetricInput,
  type MeasureToolOptions,
} from './schemas';

export { MeasureEventSchema };
export type { MeasureEventData };

export type MeasureMetricsSource = string | readonly (MeasureMetricInput | MeasureMetric)[];

export class MeasurePlugin {
  readonly id = 'measure';
  readonly name = 'Measure';
  private host: Canvas | null = null;

  install(ctx: PluginContext): void {
    this.host = ctx.canvas;
    ctx.registerTool({
      tool: MeasureTool,
      hotkey: 'm',
      defaults: { metrics: [...MEASURE_TOOL_DEFAULTS.metrics], separator: MEASURE_TOOL_DEFAULTS.separator },
    });
    ctx.bus.registerEvent('measure', MeasureEventSchema);
  }

  uninstall(): void {
    this.host = null;
  }

  options(): MeasureToolOptions {
    if (!this.host?.tools) return { metrics: [...MEASURE_TOOL_DEFAULTS.metrics], separator: MEASURE_TOOL_DEFAULTS.separator };
    return resolveMeasureOptions(this.host.tools.options['measure']);
  }

  metrics(): readonly MeasureMetric[] {
    return this.options().metrics;
  }

  setOptions(partial: Partial<MeasureToolOptions>): void {
    this.write(partial);
  }

  setMetrics(source: MeasureMetricsSource): this {
    const metrics = typeof source === 'string' ? presetMetrics(source) : defineMeasureMetrics(source);
    this.write({ metrics: [...metrics] });
    return this;
  }

  setSeparator(separator: string): this {
    this.write({ separator });
    return this;
  }

  private write(partial: Partial<MeasureToolOptions>): void {
    if (!this.host?.tools) return;
    const current = this.options();
    const merged = v.parse(MeasureToolOptionsSchema, {
      metrics: [...current.metrics],
      separator: current.separator,
      ...partial,
    });
    this.host.tools.options['measure'] = merged;
  }
}

function presetMetrics(id: string): readonly MeasureMetric[] {
  const preset = MEASURE_METRIC_PRESETS[id];
  if (!preset) throw new Error(`Unknown measure metric preset '${id}'`);
  return preset.metrics;
}

export const measurePlugin = definePlugin(new MeasurePlugin());
