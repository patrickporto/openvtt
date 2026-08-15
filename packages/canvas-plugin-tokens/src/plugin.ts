import * as v from 'valibot';
import {
  dynamicBus,
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
