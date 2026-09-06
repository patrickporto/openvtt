import type { GenericSchema } from 'valibot';
import type { Canvas } from '../canvas';
import type { CanvasBus } from '../bus';
import type { Point } from '../input/types';
import type { ContextMenuContribution } from '../contextmenu/types';
import type { CanvasLayer } from '../layers/CanvasLayer';
import type { PlaceablesLayer } from '../layers/PlaceablesLayer';
import type { PlaceableObject, CanvasLike, PlaceableObjectOptions } from '../placeables/PlaceableObject';
import type { StateNodeConstructor } from '../state/StateNode';
import type { Constructor } from '../types';

/** Snapshot retangular usado pelos gestos de resize da Select tool. */
export interface ResizeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Adapter de transformação (resize/rotate) de um tipo de documento.
 * Sem adapter, o documento é apenas movível (drag) e rotacionável se
 * `rotatable` — o resize por handles fica desabilitado.
 */
export interface TransformAdapter<D = any> {
  /** Quais campos do documento representam a transformação (snapshot p/ undo). */
  snapshotFields(obj: PlaceableObject<D>): Record<string, unknown>;
  /** Converte o retângulo-alvo do gesto de resize em mudanças de documento. */
  applyResize(obj: PlaceableObject<D>, rect: ResizeRect): Partial<D> | null;
  /**
   * Campo do documento que carrega o ângulo do placeable (default
   * 'rotation'). Tipos que giram por outro campo (ex.: 'direction' nos
   * templates) declaram aqui — o gesto de rotação e o respectivo commit
   * passam a ler/escrever nele (deve estar incluído em `snapshotFields`).
   */
  rotationField?: string;
  /**
   * Pivo em coordenadas de mundo em torno do qual o gesto de rotação gira
   * o placeable (ex.: a origem/ponta de um cone). Default: centro do AABB
   * da seleção. Aplicado apenas com um único objeto selecionado; seleções
   * múltiplas giram em torno do centro combinado.
   */
  rotationPivot?(obj: PlaceableObject<D>): Point | null;
}

/**
 * Declaração de um tipo de documento do canvas (token, wall, light, ou
 * qualquer tipo customizado de plugin). O core cria e gerencia a
 * `PlaceablesLayer` correspondente, registra os eventos `<type>:create|
 * update|delete` no bus e integra com histórico, seleção e picking.
 */
export interface DocumentTypeDefinition<D = any, I = D> {
  /** Nome do tipo (ex.: 'token'). Define os eventos `<type>:*`. */
  type: string;
  /** Schema Valibot do documento — valida create() e registra o schema dos eventos. */
  schema?: GenericSchema;
  /** Classe do placeable (visual) instanciado pela layer. */
  placeable: Constructor<PlaceableObject<D>, [D & { id?: string; x?: number; y?: number; rotation?: number }, CanvasLike, (PlaceableObjectOptions | undefined)?]>;
  /** Configuração da layer hospedeira. */
  layer: {
    /** Id da layer (default: `<type>s`). */
    id?: string;
    label: string;
    /** Ordem de empilhamento (menor = mais ao fundo). */
    order?: number;
    visible?: boolean;
  };
  /** Chave legada no payload da cena (ex.: 'tokens' em SceneDataInput). */
  sceneKey?: string;
  /** Se false, não emite eventos `<type>:*` (apenas `document:*`). */
  events?: boolean;
  /** Adapter de resize/rotação para os handles da Select tool. */
  transform?: TransformAdapter<D>;
  /** Comportamento na Select tool (drag, snap, colisão, régua, easing). */
  behavior?: DocumentBehavior;
  /**
   * Campo do documento que carrega a arte (imagem) do placeable
   * (ex.: 'texture'). Plugins de edição de imagem descobrem genericamente
   * os tipos editáveis por este metadado — sem acoplamento entre plugins.
   */
  imageField?: string;
}

/** Opções do movimento suavizado durante o drag (TokenEase-style). */
export interface EasedDragOptions {
  /** Duração característica do easing em ms (default 150). */
  duration?: number;
}

/** Comportamento na Select tool (drag, snap, colisão, régua). */
export interface DocumentBehavior {
  /** Se false, o documento não é movido por drag/setas (ex.: walls). Default true. */
  movable?: boolean;
  /** Snap ao grid durante o drag e movimento por setas (ex.: tokens). */
  snapToGrid?: boolean;
  /** Testa `isMoveBlocked` ao mover (ex.: tokens contra walls). */
  collides?: boolean;
  /** Mostra régua de distância durante o drag (ex.: tokens). */
  rulerOnDrag?: boolean;
  /**
   * Movimento suavizado durante o drag: o objeto persegue o ponteiro com
   * easing exponencial em vez de teleportar (estilo TokenEase). No release
   * assenta exatamente no alvo (posição snapada).
   */
  easedDrag?: boolean | EasedDragOptions;
}

/** Contribuição de tool de um plugin. */
export interface ToolContribution {
  tool: StateNodeConstructor;
  /** Tecla de atalho (ex.: 't'). Conflitos: o último registro vence. */
  hotkey?: string;
  /** Defaults mesclados em `canvas.tools.options[tool.id]`. */
  defaults?: Record<string, unknown>;
}

/** Contribuição de layer não-documental (fog, lighting, overlays). */
export interface LayerContribution {
  id: string;
  label: string;
  layer: CanvasLayer;
  order?: number;
  visible?: boolean;
  opacity?: number;
  locked?: boolean;
}

/* ------------------------------- windows -------------------------------- */

/** Borda de docking de janelas. */
export type WindowDockEdge = 'left' | 'right' | 'bottom';

/** Posicionamento de uma janela: flutuante ou docada numa borda. */
export type WindowDockTarget = 'float' | WindowDockEdge;

/** Limites de geometria aplicados a resize, maximize e restore. */
export interface WindowConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;
}

/** Estado lógico de uma janela. */
export type WindowStateKind = 'normal' | 'minimized' | 'maximized';

/**
 * Declaração de janela registrável. O conteúdo é lazy: a factory só roda na
 * primeira abertura. Implementado pelo plugin `windows`
 * (`@openvtt/canvas-plugin-window`); registrar sem ele instalado lança erro.
 */
export interface WindowContribution {
  /** Id estável da definição (usado para reabrir e restaurar). */
  id: string;
  title: string;
  /**
   * 'single' (default): `open` reusa/foca a instância existente;
   * 'multi': cada `open` cria uma nova instância.
   */
  instances?: 'single' | 'multi';
  /** Cria o conteúdo da janela na primeira abertura. */
  factory: (owner: PluginContext) => HTMLElement | Promise<HTMLElement>;
  width?: number;
  height?: number;
  /** Posição inicial (px, relativa ao host do canvas). Default: centrada. */
  x?: number;
  y?: number;
  /** Janela modal com backdrop bloqueando o canvas. */
  modal?: boolean;
  /** Modal persistente: Esc e clique no backdrop não fecham. */
  persistent?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  resizable?: boolean;
  /** Habilita o botão de popout (exige `popout: true` no manager do plugin windows). */
  popoutable?: boolean;
  dock?: WindowDockTarget;
  /** Bordas onde esta janela pode docar (default: todas as habilitadas pelo manager; false nunca doca). */
  dockableEdges?: WindowDockEdge[] | false;
  constraints?: WindowConstraints;
  /** Serializa o conteúdo da janela para `manager.serialize()`. */
  serializeContent?: (content: HTMLElement) => unknown;
  /** Restaura em `manager.restore()` o conteúdo serializado por `serializeContent`. */
  restoreContent?: (content: HTMLElement, data: unknown) => void;
}

/** Capacidade implementada pelo plugin `windows` para receber registros. */
export interface WindowRegistrar {
  registerWindow(contribution: WindowContribution, owner: PluginContext): void;
  /** Remove a definição e fecha as janelas dela (usado no uninstall). */
  unregisterWindow?(definitionId: string): void;
}

/**
 * API disponível ao plugin durante install/uninstall. Todas as
 * contribuições registradas aqui são desfeitas automaticamente no
 * uninstall (quando suportado) ou no destroy do canvas.
 */
export interface PluginContext {
  readonly canvas: Canvas;
  readonly bus: CanvasBus;
  registerDocumentType<D, I = D>(def: DocumentTypeDefinition<D, I>): PlaceablesLayer<D, PlaceableObject<D>, I>;
  registerLayer(contribution: LayerContribution): void;
  registerTool(contribution: ToolContribution): void;
  /**
   * Contribui itens ao context menu do canvas (right-click / long-press).
   * A contribuição é desfeita automaticamente no uninstall.
   */
  registerContextMenu(contribution: ContextMenuContribution): void;
  /**
   * Declara uma janela gerenciada pelo plugin `windows`. Requer
   * `@openvtt/canvas-plugin-window` instalado (declare a dependência).
   */
  registerWindow(contribution: WindowContribution): void;
  /** Registra cleanup executado no uninstall do plugin e no destroy do canvas. */
  onDispose(fn: () => void): void;
}

/** Contrato de um plugin do canvas. */
export interface CanvasPlugin {
  readonly id: string;
  readonly name?: string;
  /** Ids de plugins que devem ser instalados antes deste. */
  readonly dependencies?: readonly string[];
  install(ctx: PluginContext): void | Promise<void>;
  uninstall?(ctx: PluginContext): void | Promise<void>;
}

/** Helper para declarar plugins com inferência de tipos. */
export function definePlugin(plugin: CanvasPlugin): CanvasPlugin {
  return plugin;
}
