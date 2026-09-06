import {
  MENU_ORDER,
  menu,
  menuControls,
  menuWhen,
  type ContextMenuItem,
  type PluginContext,
} from '@openvtt/canvas';
import type { RingPreset } from './presets';
import type { RingsPlugin } from './plugin';

const RINGS_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/></svg>`;

const SWATCH_PER_ROW = 8;
const SWATCH_ROW_HEIGHT = 26;
const INACTIVE_SHADOW = 'inset 0 0 0 2px rgba(0,0,0,.25)';
const ACTIVE_SHADOW = `0 0 0 2px var(--ovtt-accent,#f0c168),${INACTIVE_SHADOW}`;

function swatchHeight(count: number): number {
  return Math.ceil(count / SWATCH_PER_ROW) * SWATCH_ROW_HEIGHT + 10;
}

function swatchTitle(preset: RingPreset): string {
  const hints: string[] = [];
  if (preset.style.pulse) hints.push('pulsing');
  if (preset.style.glow) hints.push('glowing');
  return hints.length > 0 ? `${preset.label} \u00b7 ${hints.join(', ')}` : preset.label;
}

function swatchGrid(
  ctx: PluginContext,
  plugin: RingsPlugin,
  presets: readonly RingPreset[],
  tokenIds: readonly string[],
): HTMLDivElement {
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:2px 4px;width:100%';
  for (const preset of presets) {
    const active = tokenIds.some((id) => plugin.hasRing(id, preset.id));
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.title = swatchTitle(preset);
    swatch.style.cssText = [
      'width:22px',
      'height:22px',
      'border-radius:50%',
      `background:${preset.style.color}`,
      'border:1px solid rgba(255,255,255,.2)',
      'cursor:pointer',
      `box-shadow:${active ? ACTIVE_SHADOW : INACTIVE_SHADOW}`,
      `opacity:${active ? 1 : 0.85}`,
    ].join(';');
    swatch.addEventListener('click', () => void applyPreset(ctx, plugin, tokenIds, preset));
    grid.appendChild(swatch);
  }
  return grid;
}

async function applyPreset(
  ctx: PluginContext,
  plugin: RingsPlugin,
  tokenIds: readonly string[],
  preset: RingPreset,
): Promise<void> {
  const remove = tokenIds.some((id) => plugin.hasRing(id, preset.id));
  ctx.canvas.history.beginBatch();
  try {
    for (const tokenId of tokenIds) {
      if (remove) {
        for (const ring of plugin.ringsOf(tokenId)) {
          if (ring.document.preset === preset.id) plugin.removeRing(ring.id);
        }
      } else {
        await plugin.addRing(tokenId, preset.id);
      }
    }
  } finally {
    ctx.canvas.history.endBatch();
  }
}

async function applyCustomColor(
  ctx: PluginContext,
  plugin: RingsPlugin,
  tokenIds: readonly string[],
  color: string,
): Promise<void> {
  ctx.canvas.history.beginBatch();
  try {
    for (const tokenId of tokenIds) await plugin.toggleRing(tokenId, { color });
  } finally {
    ctx.canvas.history.endBatch();
  }
}

export function registerRingsContextMenu(ctx: PluginContext, plugin: RingsPlugin): void {
  ctx.registerContextMenu({
    id: 'rings:context',
    when: menuWhen.selection('token'),
    items: (menuCtx) => {
      const tokens = menuCtx.selection.filter((obj) => obj.objectType === 'token');
      if (tokens.length === 0) return [];
      const tokenIds = tokens.map((obj) => obj.id);
      const presets = plugin.presets.list();
      const items: ContextMenuItem[] = [];
      if (presets.length > 0) {
        items.push(
          menu.custom('rings:presets', () => swatchGrid(ctx, plugin, presets, tokenIds), {
            order: MENU_ORDER.edit,
            height: swatchHeight(presets.length),
          }),
        );
      }
      items.push(
        menu.custom(
          'rings:custom',
          () =>
            menuControls.color({
              label: 'Custom',
              value: '#ffffff',
              commit: (color) => void applyCustomColor(ctx, plugin, tokenIds, color),
            }),
          { order: MENU_ORDER.edit + 5, height: 26 },
        ),
        menu.action('rings:clear', 'Clear rings', {
          icon: RINGS_ICON,
          order: MENU_ORDER.edit + 10,
          disabled: tokenIds.every((id) => plugin.ringsOf(id).length === 0),
          onClick: () => {
            ctx.canvas.history.beginBatch();
            try {
              for (const tokenId of tokenIds) plugin.clearRings(tokenId);
            } finally {
              ctx.canvas.history.endBatch();
            }
          },
        }),
      );
      return items;
    },
  });
}
