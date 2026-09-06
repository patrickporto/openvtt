import { definePlugin, type PluginContext } from '@openvtt/canvas';
import { RangeOverlayLayer } from './layer/RangeOverlayLayer';
import { bindController, RangesController, unbindController, type ActiveRange, type PlaceRangeInput } from './controller';

export type { ActiveRange, PlaceRangeInput } from './controller';
import { RangeTool } from './tools/RangeTool';
import { registerRangesContextMenu } from './context';
import { RANGE_TOOL_DEFAULTS, type RangeToolOptions } from './options';
import {
  RangeClearedEventSchema,
  RangePlacedEventSchema,
  defineRangePreset,
  defineRangeTheme,
  type RangePreset,
  type RangePresetInput,
  type RangeTheme,
  type RangeThemeInput,
} from './schemas';
import { BUILTIN_PRESETS } from './presets';
import { BUILTIN_THEMES } from './themes';

export class RangesPlugin {
  readonly id = 'ranges';
  readonly name = 'Ranges';
  readonly presets = new Map<string, RangePreset>(BUILTIN_PRESETS.map((preset) => [preset.id, preset as RangePreset]));
  readonly themes = new Map<string, RangeTheme>(BUILTIN_THEMES.map((theme) => [theme.id, theme as RangeTheme]));
  private controller: RangesController | null = null;
  private offToolChanged: (() => void) | null = null;

  install(ctx: PluginContext): void {
    const layer = new RangeOverlayLayer(ctx.canvas);
    ctx.onDispose(() => layer.dispose());
    ctx.registerLayer({ id: 'ranges', label: 'Ranges', layer, order: 460 });

    const controller = new RangesController(ctx.canvas, layer, this.presets, this.themes);
    controller.attach();
    bindController(ctx.canvas, controller);
    this.controller = controller;

    ctx.bus.registerEvent('ranges:placed', RangePlacedEventSchema);
    ctx.bus.registerEvent('ranges:cleared', RangeClearedEventSchema);

    ctx.registerTool({ tool: RangeTool, hotkey: 'r', defaults: { ...RANGE_TOOL_DEFAULTS } });
    registerRangesContextMenu(ctx, controller);

    let lastToolId = 'select';
    this.offToolChanged = ctx.bus.on('tool:changed', ({ id }) => {
      if (lastToolId === 'ranges' && id !== 'ranges' && controller.options().clearOnSwitch) controller.clear();
      lastToolId = id;
    });
  }

  uninstall(ctx: PluginContext): void {
    this.offToolChanged?.();
    this.offToolChanged = null;
    this.controller?.dispose();
    this.controller = null;
    unbindController(ctx.canvas);
  }

  addPreset(preset: RangePresetInput | RangePreset): this {
    const parsed = defineRangePreset(preset);
    this.presets.set(parsed.id, parsed);
    this.controller?.compose();
    return this;
  }

  removePreset(id: string): boolean {
    const removed = this.presets.delete(id);
    if (removed && this.controller && this.controller.options().preset === id) {
      const fallback = [...this.presets.keys()][0];
      if (fallback) this.controller.setOptions({ preset: fallback });
    }
    this.controller?.compose();
    return removed;
  }

  addTheme(theme: RangeThemeInput | RangeTheme): this {
    const parsed = defineRangeTheme(theme);
    this.themes.set(parsed.id, parsed);
    this.controller?.compose();
    return this;
  }

  removeTheme(id: string): boolean {
    const removed = this.themes.delete(id);
    if (removed && this.controller && this.controller.options().theme === id) {
      const fallback = [...this.themes.keys()][0];
      if (fallback) this.controller.setOptions({ theme: fallback });
    }
    this.controller?.compose();
    return removed;
  }

  place(input: PlaceRangeInput): ActiveRange | null {
    return this.controller?.place(input) ?? null;
  }

  options(): RangeToolOptions {
    return this.controller?.options() ?? { ...RANGE_TOOL_DEFAULTS };
  }

  setOptions(partial: Partial<RangeToolOptions>): void {
    this.controller?.setOptions(partial);
  }

  clear(): void {
    this.controller?.clear();
  }

  active(): readonly ActiveRange[] {
    return this.controller?.active() ?? [];
  }
}

export const rangesPlugin = definePlugin(new RangesPlugin());
