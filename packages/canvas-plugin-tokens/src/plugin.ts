import * as v from 'valibot';
import {
  dynamicBus,
  menuControls,
  MENU_ORDER,
  menu,
  menuWhen,
  type DocumentBehavior,
  type EasedDragOptions,
  type PlaceablesLayer,
  type PluginContext,
} from '@openvtt/canvas';
import { Token } from './placeables/Token';
import type { TokenMoveOptions } from './placeables/Token';
import { TokenTool } from './tools/TokenTool';
import { TokenDataSchema, type TokenData, type TokenDataInput } from './schemas';

export interface TokenToolOptions {
  size: number;
  texture?: string;
  label?: string;
  tint?: number | string;
}

export type TokensLayer = PlaceablesLayer<TokenData, Token, TokenDataInput>;

const DEFAULTS: TokenToolOptions = { size: 1 };
const DEFAULT_EASE: Required<EasedDragOptions> = { duration: 150 };

const ICONS = {
  token: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="9.5" r="2.6"/><path d="M6.5 17.5c1.4-2.6 3.4-3.8 5.5-3.8s4.1 1.2 5.5 3.8"/></svg>`,
  size: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16" opacity=".55"/></svg>`,
  light: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3Z"/></svg>`,
  ping: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M19.4 4.6a10 10 0 0 1 0 14.8M4.6 19.4a10 10 0 0 1 0-14.8" opacity=".45"/></svg>`,
  center: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5V7M12 17v4.5M2.5 12H7M17 12h4.5"/></svg>`,
  selectAll: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="m8 12 2.5 2.5L16 9"/></svg>`,
};

/** API pública do plugin — `canvas.plugins.get<TokensPlugin>('tokens')`. */
export class TokensPlugin {
  readonly id = 'tokens';
  readonly name = 'Tokens';

  layer!: TokensLayer;
  private ctx!: PluginContext;
  private readonly dragBehavior: DocumentBehavior = {
    snapToGrid: true,
    collides: true,
    rulerOnDrag: true,
    easedDrag: { ...DEFAULT_EASE },
  };

  install(ctx: PluginContext): void {
    this.ctx = ctx;
    this.layer = ctx.registerDocumentType<TokenData, TokenDataInput>({
      type: 'token',
      schema: TokenDataSchema,
      placeable: Token,
      layer: { label: 'Tokens', order: 500 },
      sceneKey: 'tokens',
      transform: {
        snapshotFields(obj) {
          const doc = obj.document;
          return { x: obj.x, y: obj.y, size: doc.size ?? 1, rotation: doc.rotation ?? 0 };
        },
        applyResize(obj, rect) {
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          const diameter = (rect.width + rect.height) / 2;
          return { x: cx, y: cy, size: diameter / ctx.canvas.grid.size };
        },
      },
      behavior: this.dragBehavior,
    }) as TokensLayer;

    ctx.bus.registerEvent('token:moved', v.object({ id: v.string(), x: v.number(), y: v.number() }));
    ctx.bus.registerEvent('token:selected', v.object({ ids: v.array(v.string()) }));

    ctx.registerTool({ tool: TokenTool, hotkey: 't', defaults: { ...DEFAULTS } });

    const grid = () => ctx.canvas.grid.size;

    ctx.bus.tap('vision:sources', 'tokens', (payload) => {
      for (const obj of this.layer.placeables) {
        const radius = obj.document.visionRadius ?? 0;
        if (radius > 0) payload.sources.push({ x: obj.x, y: obj.y, radius: radius * grid() });
      }
      return payload;
    });

    ctx.bus.tap('light:sources', 'tokens', (payload) => {
      for (const obj of this.layer.placeables) {
        const dim = obj.document.lightDim ?? 0;
        const bright = obj.document.lightBright ?? 0;
        if (dim > 0) payload.sources.push({ x: obj.x, y: obj.y, dim: dim * grid(), bright: bright * grid() });
      }
      return payload;
    });

    ctx.bus.on('selection:change', ({ ids }) => {
      const tokenIds = ids.filter((id) => this.layer.get(id) !== undefined);
      if (tokenIds.length > 0) {
        dynamicBus(ctx.bus).emit('token:selected', { ids: tokenIds });
      }
    });

    this.registerContextMenuItems(ctx);
  }

  /** Itens de context menu do plugin (submenu do token, sliders e utilidades). */
  private registerContextMenuItems(ctx: PluginContext): void {
    ctx.registerContextMenu({
      id: 'tokens:context',
      when: menuWhen.selection('token'),
      items: (menuCtx) => {
        const tokens = menuCtx.selection
          .filter((obj) => obj.objectType === 'token')
          .map((obj) => this.layer.get(obj.id))
          .filter((token): token is Token => token !== undefined);
        if (tokens.length === 0) return [];
        const single = tokens.length === 1 ? tokens[0] : undefined;
        const doc = tokens[0].document;
        const refresh = (): void => {
          ctx.bus.call('scene:refresh', {});
        };
        const updateOne = (token: Token, changes: Partial<TokenData>, before?: Partial<TokenData>): void => {
          ctx.canvas.documents.update('token', token.id, changes, before ? { before } : undefined);
        };
        const updateAll = (changesFor: (token: Token) => Partial<TokenData>): void => {
          ctx.canvas.history.beginBatch();
          try {
            for (const token of tokens) ctx.canvas.documents.update('token', token.id, changesFor(token));
          } finally {
            ctx.canvas.history.endBatch();
          }
        };

        return [
          ...(single
            ? [
                menu.custom(
                  'tokens:rotate',
                  () => {
                    const initialRotation = single.document.rotation ?? 0;
                    return menuControls.slider({
                      label: 'Rotate',
                      min: 0,
                      max: 360,
                      step: 1,
                      value: Math.round((initialRotation * 180) / Math.PI),
                      format: (deg) => `${deg}°`,
                      live: (deg) => single.update({ rotation: (deg * Math.PI) / 180 }),
                      commit: (deg) =>
                        updateOne(single, { rotation: (deg * Math.PI) / 180 }, { rotation: initialRotation }),
                    });
                  },
                  { order: MENU_ORDER.transform, height: 30 },
                ),
              ]
            : []),
          menu.submenu(
            'tokens:token',
            tokens.length > 1 ? `${tokens.length} tokens` : (doc.label ?? 'Token'),
            [
              ...(single
                ? [
                    menu.custom(
                      'tokens:rename',
                      () => {
                        const initialLabel = single.document.label;
                        return menuControls.text({
                          value: initialLabel ?? '',
                          placeholder: 'Name',
                          commit: (label) => updateOne(single, { label }, { label: initialLabel }),
                        });
                      },
                      { height: 30 },
                    ),
                  ]
                : []),
              menu.submenu(
                'tokens:size',
                'Size',
                [1, 2, 3, 4].map((n) =>
                  menu.action(`tokens:size:${n}`, `${n}×${n}`, {
                    onClick: () => updateAll(() => ({ size: n })),
                  }),
                ),
                { icon: ICONS.size },
              ),
              menu.toggle('tokens:hidden', 'Hidden', {
                checked: doc.hidden ?? false,
                onClick: () => updateAll(() => ({ hidden: !(doc.hidden ?? false) })),
              }),
            ],
            { order: MENU_ORDER.edit, icon: ICONS.token },
          ),
          ...(single
            ? [
                menu.custom(
                  'tokens:vision',
                  () => {
                    const initialVision = single.document.visionRadius ?? 0;
                    return menuControls.slider({
                      label: 'Vision',
                      min: 0,
                      max: 12,
                      step: 0.5,
                      value: initialVision,
                      live: (radius) => {
                        single.update({ visionRadius: radius });
                        refresh();
                      },
                      commit: (radius) => updateOne(single, { visionRadius: radius }, { visionRadius: initialVision }),
                    });
                  },
                  { order: MENU_ORDER.edit, height: 30 },
                ),
                menu.submenu(
                  'tokens:light',
                  'Light',
                  [
                    menu.custom(
                      'tokens:light:bright',
                      () => {
                        const initial = single.document.lightBright ?? 0;
                        return menuControls.slider({
                          label: 'Bright',
                          min: 0,
                          max: 10,
                          step: 0.5,
                          value: initial,
                          live: (radius) => {
                            single.update({ lightBright: radius });
                            refresh();
                          },
                          commit: (radius) => updateOne(single, { lightBright: radius }, { lightBright: initial }),
                        });
                      },
                      { height: 30 },
                    ),
                    menu.custom(
                      'tokens:light:dim',
                      () => {
                        const initial = single.document.lightDim ?? 0;
                        return menuControls.slider({
                          label: 'Dim',
                          min: 0,
                          max: 20,
                          step: 0.5,
                          value: initial,
                          live: (radius) => {
                            single.update({ lightDim: radius });
                            refresh();
                          },
                          commit: (radius) => updateOne(single, { lightDim: radius }, { lightDim: initial }),
                        });
                      },
                      { height: 30 },
                    ),
                  ],
                  { order: MENU_ORDER.edit, icon: ICONS.light },
                ),
              ]
            : []),
          menu.action('tokens:center', 'Center on token', {
            icon: ICONS.center,
            order: MENU_ORDER.utility,
            onClick: () => ctx.canvas.centerOn(doc.x, doc.y),
          }),
          menu.action('tokens:ping', 'Ping token', {
            icon: ICONS.ping,
            order: MENU_ORDER.utility + 10,
            onClick: () => ctx.canvas.ping(doc.x, doc.y),
          }),
        ];
      },
    });

    ctx.registerContextMenu({
      id: 'tokens:scene',
      when: menuWhen.canvas(),
      items: () => [
        menu.action('tokens:selectAll', 'Select all tokens', {
          icon: ICONS.selectAll,
          order: MENU_ORDER.canvas,
          disabled: this.layer.placeables.length === 0,
          onClick: () => {
            for (const placeable of this.layer.placeables) ctx.canvas.select(placeable, true);
          },
        }),
      ],
    });
  }

  /* --------------------------- ease (TokenEase) --------------------------- */

  /** Duração característica do drag suavizado (ms). */
  get easeDuration(): number {
    const eased = this.dragBehavior.easedDrag as EasedDragOptions;
    return eased.duration ?? DEFAULT_EASE.duration;
  }

  /** Ajusta em tempo real o easing do drag (aplica-se ao próximo pointermove). */
  configureEase(options: EasedDragOptions): void {
    this.dragBehavior.easedDrag = { duration: options.duration ?? this.easeDuration };
  }

  /* ------------------------------ acesso ------------------------------- */

  get(tokenId: string): Token | undefined {
    return this.layer.get(tokenId);
  }

  /** Movimento programático animado (grava no documento + histórico ao concluir). */
  moveToken(tokenId: string, x: number, y: number, options: TokenMoveOptions & { commit?: boolean } = {}): Token | undefined {
    const token = this.layer.get(tokenId);
    if (!token) return undefined;
    const { commit = true, ...move } = options;
    const duration = move.duration ?? (move.animated === false ? 0 : Math.min(750, Math.max(150, Math.hypot(x - token.x, y - token.y))));
    token.moveTo(x, y, {
      ...move,
      duration,
      onComplete: () => {
        if (commit && this.layer.get(tokenId) === token) {
          this.ctx.canvas.documents.update('token', tokenId, { x, y });
        }
      },
    });
    return token;
  }
}

export const tokensPlugin = new TokensPlugin();
