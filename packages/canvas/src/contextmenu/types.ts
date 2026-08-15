import * as v from 'valibot';
import type { PlaceableObject } from '../placeables/PlaceableObject';

export const CONTEXT_MENU_TAG = 'openvtt-context-menu';

export type ContextMenuCloseReason = 'action' | 'outside' | 'escape' | 'canvas' | 'replace' | 'destroy';

export type ContextMenuTarget =
  | { type: 'canvas' }
  | { type: 'object'; object: PlaceableObject };

/** Predicado puro de visibilidade — componível via `menuWhen`. */
export type ContextMenuPredicate = (ctx: ContextMenuContext) => boolean;

/**
 * Contexto imutável entregue a `when`, factories de itens, `onClick` e
 * `render` no momento da abertura do menu. Itens e callbacks nunca devem
 * mutar este objeto.
 */
export interface ContextMenuContext {
  /** Ponto no espaço do mundo (após pan/zoom). */
  readonly x: number;
  readonly y: number;
  /** Ponto em pixels relativos ao elemento host do canvas (não à viewport). */
  readonly screenX: number;
  readonly screenY: number;
  readonly target: ContextMenuTarget;
  readonly selection: readonly PlaceableObject[];
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/**
 * Itens são valores imutáveis: construa novos via os builders puros em
 * `menu` (`@openvtt/canvas`) em vez de mutar instâncias existentes. O
 * estado visual de toggles é rastreado pelo próprio menu.
 */
export interface ContextMenuItemBase {
  /** Id único (prefixe com o namespace do plugin, ex.: 'tokens:rename'). */
  readonly id: string;
  /** Ícone como string SVG inline ou URL. */
  readonly icon?: string;
  readonly label?: string;
  /** Dica de atalho exibida à direita (ex.: 'Ctrl+D'). */
  readonly hint?: string;
  readonly disabled?: boolean;
  /** Estilo destrutivo (vermelho). */
  readonly danger?: boolean;
  /** Ordenação dentro do menu (menor primeiro; empates mantêm ordem de registro). */
  readonly order?: number;
  /** Fecha o menu após ativar (default: true para action, false para toggle). */
  readonly closeOnClick?: boolean;
  /** Filtro de visibilidade avaliado ao abrir o menu. */
  readonly when?: ContextMenuPredicate;
}

export interface ContextMenuAction extends ContextMenuItemBase {
  readonly type: 'action';
  readonly label: string;
  readonly onClick?: (ctx: ContextMenuContext) => void;
  /** Submenu aninhado (abre em flyout; níveis arbitrários). */
  readonly submenu?: readonly ContextMenuItem[];
}

export interface ContextMenuToggle extends ContextMenuItemBase {
  readonly type: 'toggle';
  readonly label: string;
  /** Estado inicial; o menu rastreia o estado visual sem mutar o item. */
  readonly checked?: boolean;
  readonly onClick?: (ctx: ContextMenuContext) => void;
}

export interface ContextMenuSeparator extends ContextMenuItemBase {
  readonly type: 'separator';
}

export interface ContextMenuCustom extends ContextMenuItemBase {
  readonly type: 'custom';
  /**
   * Conteúdo arbitrário (sliders, inputs, iframes, ...) renderizado no
   * menu. Use os helpers de `menuControls` para o protocolo de
   * histórico — note que fechar o menu no meio de um preview descarta o
   * commit (o valor previewado fica aplicado sem entrada de histórico).
   */
  readonly render: (ctx: ContextMenuContext) => Node;
  /** Altura mínima sugerida em pixels. */
  readonly height?: number;
}

export type ContextMenuItem =
  | ContextMenuAction
  | ContextMenuToggle
  | ContextMenuSeparator
  | ContextMenuCustom;

/**
 * Contribuição declarativa registrada via `ctx.registerContextMenu()`
 * (equivalente ao `OBR.contextMenu.create` do Owlbear Rodeo, com itens
 * dinâmicos e filtros por contexto de seleção). `items` como factory é
 * reavaliado (puro) a cada abertura do menu.
 */
export interface ContextMenuContribution {
  /** Id único — re-registrar com o mesmo id substitui a contribuição. */
  readonly id: string;
  /** Filtro de visibilidade da contribuição inteira. */
  readonly when?: ContextMenuPredicate;
  /** Itens estáticos ou factory avaliado a cada abertura. */
  readonly items: readonly ContextMenuItem[] | ((ctx: ContextMenuContext) => readonly ContextMenuItem[]);
}

export const SerializedContextMenuTargetSchema = v.union([
  v.object({ type: v.literal('canvas') }),
  v.object({ type: v.literal('object'), objectType: v.string(), id: v.string() }),
]);

export const ContextMenuOpenEventSchema = v.object({
  x: v.number(),
  y: v.number(),
  screenX: v.number(),
  screenY: v.number(),
  target: SerializedContextMenuTargetSchema,
  selectionCount: v.number(),
  itemCount: v.number(),
});

export const ContextMenuCloseEventSchema = v.object({
  reason: v.picklist(['action', 'outside', 'escape', 'canvas', 'replace', 'destroy']),
});

/** Envelope do hook `contextmenu:items` (waterfall): plugins adicionam itens. */
export const ContextMenuItemsHookSchema = v.looseObject({
  x: v.number(),
  y: v.number(),
  screenX: v.number(),
  screenY: v.number(),
  items: v.array(v.any()),
});

/** Envelope do hook `contextmenu:before` (bail): plugins podem vetar o menu. */
export const ContextMenuBeforeHookSchema = v.looseObject({
  x: v.number(),
  y: v.number(),
  handled: v.optional(v.boolean(), false),
});
