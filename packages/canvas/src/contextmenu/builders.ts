import { newId } from '../utils';
import type {
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuCustom,
  ContextMenuItem,
  ContextMenuPredicate,
  ContextMenuSeparator,
  ContextMenuToggle,
} from './types';

type ActionOptions = Omit<ContextMenuAction, 'type' | 'id' | 'label'>;
type ToggleOptions = Omit<ContextMenuToggle, 'type' | 'id' | 'label'>;
type SubmenuOptions = Omit<ContextMenuAction, 'type' | 'id' | 'label' | 'submenu'>;
type SeparatorOptions = Omit<ContextMenuSeparator, 'type' | 'id'>;
type CustomOptions = Omit<ContextMenuCustom, 'type' | 'id' | 'render'>;

/**
 * Faixas de ordenação do menu para plugins escalarem sem colisões:
 * 0–99 reservado, 100–800 plugins (por semântica abaixo), 900+ core.
 */
export const MENU_ORDER = Object.freeze({
  /** Ações de cena/canvas (fog, walls utilitários). */
  canvas: 100,
  /** Transformações (rotação, flip, ordem-z). */
  transform: 200,
  /** Edição de documento (rename, cor, arte, geometria). */
  edit: 300,
  /** Toggles de estado (hidden, locked, porta). */
  state: 400,
  /** Utilidades de navegação (center, ping, fit). */
  utility: 500,
  /** Fim da faixa de plugins. */
  tail: 800,
  duplicate: 900,
  delete: 990,
});

/** Builders puros de itens — retornam valores congelados. */
export const menu = Object.freeze({
  action(id: string, label: string, options: ActionOptions = {}): ContextMenuAction {
    return Object.freeze({ type: 'action', id, label, ...options });
  },
  submenu(
    id: string,
    label: string,
    children: readonly ContextMenuItem[],
    options: SubmenuOptions = {},
  ): ContextMenuAction {
    return Object.freeze({ type: 'action', id, label, submenu: Object.freeze([...children]), ...options });
  },
  toggle(id: string, label: string, options: ToggleOptions = {}): ContextMenuToggle {
    return Object.freeze({ type: 'toggle', id, label, ...options });
  },
  separator(id: string = `separator:${newId()}`, options: SeparatorOptions = {}): ContextMenuSeparator {
    return Object.freeze({ type: 'separator', id, ...options });
  },
  custom(
    id: string,
    render: (ctx: ContextMenuContext) => Node,
    options: CustomOptions = {},
  ): ContextMenuCustom {
    return Object.freeze({ type: 'custom', id, render, ...options });
  },
});

/** Fábricas de predicados puros e componíveis para `when`. */
export const menuWhen = Object.freeze({
  /** Alvo é o canvas e nada está selecionado. */
  canvas(): ContextMenuPredicate {
    return (ctx) => ctx.target.type === 'canvas' && ctx.selection.length === 0;
  },
  /** Alvo é um objeto (opcionalmente de um dos tipos dados). */
  target(...types: readonly string[]): ContextMenuPredicate {
    return (ctx) =>
      ctx.target.type === 'object' && (types.length === 0 || types.includes(ctx.target.object.objectType));
  },
  /** Há seleção (opcionalmente contendo um dos tipos dados). */
  selection(...types: readonly string[]): ContextMenuPredicate {
    return (ctx) =>
      ctx.selection.length > 0 &&
      (types.length === 0 || ctx.selection.some((obj) => types.includes(obj.objectType)));
  },
  all(...predicates: readonly ContextMenuPredicate[]): ContextMenuPredicate {
    return (ctx) => predicates.every((predicate) => predicate(ctx));
  },
  any(...predicates: readonly ContextMenuPredicate[]): ContextMenuPredicate {
    return (ctx) => predicates.some((predicate) => predicate(ctx));
  },
  not(predicate: ContextMenuPredicate): ContextMenuPredicate {
    return (ctx) => !predicate(ctx);
  },
});
