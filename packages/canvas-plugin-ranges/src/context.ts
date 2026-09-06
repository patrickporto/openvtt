import { MENU_ORDER, menu, menuWhen, type ContextMenuItem, type PluginContext } from '@openvtt/canvas';
import type { RangesController } from './controller';

const CHECK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

const RINGS_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="6" opacity=".65"/><circle cx="12" cy="12" r="9.6" opacity=".35"/></svg>';

export function registerRangesContextMenu(ctx: PluginContext, controller: RangesController): void {
  ctx.registerContextMenu({
    id: 'ranges:settings',
    when: menuWhen.canvas(),
    items: (): ContextMenuItem[] => {
      const options = controller.options();
      return [
        menu.submenu('ranges:preset', 'Range Preset', presetItems(controller), {
          icon: RINGS_ICON,
          order: MENU_ORDER.canvas + 60,
        }),
        menu.submenu('ranges:theme', 'Range Theme', themeItems(controller), {
          order: MENU_ORDER.canvas + 70,
        }),
        menu.submenu('ranges:shape', 'Range Shape', shapeItems(controller), {
          order: MENU_ORDER.canvas + 80,
        }),
        menu.toggle('ranges:labels', 'Ring Labels', {
          checked: options.labels,
          order: MENU_ORDER.canvas + 90,
          onClick: () => controller.setOptions({ labels: !controller.options().labels }),
        }),
        menu.toggle('ranges:follow', 'Follow Tokens', {
          checked: options.follow,
          order: MENU_ORDER.canvas + 100,
          onClick: () => controller.setOptions({ follow: !controller.options().follow }),
        }),
      ];
    },
  });
}

function presetItems(controller: RangesController): ContextMenuItem[] {
  const current = controller.options().preset;
  return [...controller.presets.values()].map((preset, index) =>
    menu.action(`ranges:preset:${preset.id}`, preset.label ?? preset.id, {
      icon: preset.id === current ? CHECK_ICON : undefined,
      order: index,
      onClick: () => controller.setOptions({ preset: preset.id }),
    }),
  );
}

function themeItems(controller: RangesController): ContextMenuItem[] {
  const current = controller.options().theme;
  return [...controller.themes.values()].map((theme, index) =>
    menu.action(`ranges:theme:${theme.id}`, theme.label ?? theme.id, {
      icon: theme.id === current ? CHECK_ICON : undefined,
      order: index,
      onClick: () => controller.setOptions({ theme: theme.id }),
    }),
  );
}

function shapeItems(controller: RangesController): ContextMenuItem[] {
  const current = controller.options().shape;
  const shapes = ['circle', 'square'] as const;
  return shapes.map((shape, index) =>
    menu.action(`ranges:shape:${shape}`, shape === 'circle' ? 'Circle' : 'Square', {
      icon: shape === current ? CHECK_ICON : undefined,
      order: index,
      onClick: () => controller.setOptions({ shape }),
    }),
  );
}
