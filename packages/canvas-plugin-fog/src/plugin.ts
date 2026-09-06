import * as v from 'valibot';
import { MENU_ORDER, definePlugin, menu, menuControls, menuWhen, type PluginContext } from '@openvtt/canvas';
import { FogOfWarLayer } from './FogOfWarLayer';
import { createFogTools, type FogToolOptions } from './tools/fog';
import { defineFogElements, FOG_PANEL_TAG, type OpenVTTFogPanel } from './ui/fog-panel';

const DEFAULT_TOOL_OPTIONS: FogToolOptions = { brushSize: 100 };

const ICONS = {
  fog: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 18.5a4.5 4.5 0 0 0 .4-8.97 6 6 0 0 0-11.7 1.48 4 4 0 0 0 .3 7.99Z"/><path d="M8 21.5h8" opacity=".55"/></svg>',
  eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  reveal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2m0 15v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  reset: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/></svg>',
};

export const fogPlugin = definePlugin({
  id: 'fog',
  name: 'Fog of War',
  install(ctx: PluginContext) {
    const fogLayer = new FogOfWarLayer(ctx.canvas);

    ctx.registerLayer({ id: 'fog', label: 'Fog of War', layer: fogLayer, order: 800, visible: false });

    ctx.bus.registerEvent(
      'fog:change',
      v.object({ enabled: v.boolean(), darkness: v.number(), playerView: v.boolean() }),
    );

    ctx.bus.tap('scene:setup', 'fog', ({ width, height }) => fogLayer.setup(width, height));
    ctx.bus.tap('scene:teardown', 'fog', () => void fogLayer.tearDown());
    ctx.bus.tap('scene:refresh', 'fog', () => fogLayer.compose());

    ctx.bus.on('document:create', () => fogLayer.refresh());
    ctx.bus.on('document:update', () => fogLayer.refresh());
    ctx.bus.on('document:delete', () => fogLayer.refresh());
    ctx.bus.on('document:moved', () => fogLayer.refresh());
    ctx.bus.on('selection:change', () => fogLayer.compose());

    const { FogRevealTool, FogPaintTool } = createFogTools(fogLayer);
    ctx.registerTool({ tool: FogRevealTool, hotkey: 'f', defaults: { ...DEFAULT_TOOL_OPTIONS } });
    ctx.registerTool({ tool: FogPaintTool, hotkey: 'g', defaults: { ...DEFAULT_TOOL_OPTIONS } });

    if (ctx.canvas.plugins.has('windows')) {
      ctx.registerWindow({
        id: 'fog',
        title: 'Fog of War',
        width: 260,
        height: 420,
        dock: 'right',
        factory: () => {
          defineFogElements();
          const panel = document.createElement(FOG_PANEL_TAG) as OpenVTTFogPanel;
          panel.canvas = ctx.canvas;
          return panel;
        },
      });
    }

    ctx.registerContextMenu({
      id: 'fog:context',
      when: menuWhen.any(menuWhen.canvas(), menuWhen.selection()),
      items: () => [
        menu.toggle('fog:enabled', 'Fog of war', {
          icon: ICONS.fog,
          order: MENU_ORDER.canvas,
          checked: fogLayer.enabled,
          closeOnClick: true,
          onClick: () => fogLayer.setEnabled(!fogLayer.enabled),
        }),
        menu.toggle('fog:player-view', 'Player view', {
          icon: ICONS.eye,
          order: MENU_ORDER.state,
          checked: fogLayer.playerView,
          when: () => fogLayer.enabled,
          onClick: () => fogLayer.setPlayerView(!fogLayer.playerView),
        }),
        menu.custom(
          'fog:darkness',
          () =>
            menuControls.slider({
              label: 'Darkness',
              value: Math.round(fogLayer.darkness * 100),
              min: 0,
              max: 100,
              format: (v) => `${v}%`,
              live: (v) => fogLayer.setDarkness(v / 100),
            }),
          { height: 30, order: MENU_ORDER.state, when: () => fogLayer.enabled },
        ),
        menu.action('fog:reveal-here', 'Reveal here', {
          icon: ICONS.reveal,
          order: MENU_ORDER.state,
          when: () => fogLayer.enabled,
          onClick: (c) => fogLayer.revealFog(c.x, c.y, 120),
        }),
        menu.separator('fog:reset-sep', { order: MENU_ORDER.state }),
        menu.action('fog:reset', 'Reset fog', {
          icon: ICONS.reset,
          order: MENU_ORDER.state,
          danger: true,
          when: () => fogLayer.enabled,
          onClick: () => fogLayer.reset(),
        }),
      ],
    });

    ctx.onDispose(() => void fogLayer.tearDown());
  },
});
