import type { Canvas } from '../canvas';
import type { StateEventName, StateNode, StateNodeConstructor } from '../state/StateNode';
import { RootState } from './RootState';
import type { ToolContribution } from '../plugins/types';
import type { HotkeyHandler } from '@openvtt/hotkeys';
import { SelectTool } from './select';
import { HandTool } from './hand';
import { EraserTool } from './eraser';

/** Opções mutáveis por tool, indexadas pelo id da tool (plugins definem as suas). */
export type ToolOptions = Record<string, Record<string, unknown>>;

const CORE_TOOLS: StateNodeConstructor[] = [SelectTool, HandTool, EraserTool];

const CORE_BINDS: Record<string, string> = {
  select: 'V',
  hand: 'H',
  eraser: 'E',
};

const HOTKEY_NAMESPACE = 'canvas';

/**
 * Registra e gerencia as tools; expõe a API pública de troca de tool.
 * Tools de plugins são contribuídas via `canvas.registerTool()` (ou
 * `PluginContext.registerTool`) antes do `initialize()`. Os atalhos de
 * troca de tool, undo/redo, ping e pan por espaço são registrados como
 * ações do `@openvtt/hotkeys` em `canvas.hotkeys` (rebindáveis).
 */
export class ToolManager {
  readonly options: ToolOptions = {};
  private readonly root: RootState;
  private readonly canvas: Canvas;
  private readonly registeredActions: string[] = [];
  private tempReturnTo: string | null = null;
  private tempMiddle = false;

  constructor(canvas: Canvas, contributions: ToolContribution[], options?: ToolOptions) {
    this.canvas = canvas;
    const extra: StateNodeConstructor[] = [];
    for (const contribution of contributions) {
      extra.push(contribution.tool);
      if (contribution.defaults) {
        this.options[contribution.tool.id] = { ...contribution.defaults };
      }
    }
    if (options) {
      for (const [key, value] of Object.entries(options)) {
        this.options[key] = { ...(this.options[key] ?? {}), ...value };
      }
    }
    RootState.extraTools = extra;
    this.root = new RootState(null, canvas);
    this.root.enter();
    this.registerHotkeyActions(contributions);
  }

  /** Ids de todas as tools registradas (core + plugins). */
  toolIds(): string[] {
    return [...CORE_TOOLS.map((t) => t.id), ...RootState.extraTools.map((t) => t.id)];
  }

  setCurrentTool(id: string): void {
    if (this.getCurrentToolId() === id) return;
    this.root.transition(id);
  }

  getCurrentToolId(): string {
    return this.root.current?.id ?? 'select';
  }

  getCurrentTool(): StateNode | null {
    return this.root.current;
  }

  get path(): string {
    return this.root.path;
  }

  handleEvent(name: StateEventName, info?: unknown): void {
    this.root.handleEvent(name, info);
  }

  /** Pan temporário (espaço ou botão do meio): guarda a tool anterior e vai para hand. */
  beginTempPan(source: 'space' | 'middle'): void {
    if (this.tempReturnTo) return;
    this.tempReturnTo = this.getCurrentToolId();
    if (source === 'middle') this.tempMiddle = true;
    this.setCurrentTool('hand');
  }

  /** Encerra o pan temporário, restaurando a tool anterior. */
  endTempPan(source: 'space' | 'middle'): void {
    if (!this.tempReturnTo) return;
    if (source === 'space' && this.tempMiddle) return;
    const back = this.tempReturnTo;
    this.tempReturnTo = null;
    this.tempMiddle = false;
    this.setCurrentTool(back);
  }

  destroy(): void {
    for (const action of this.registeredActions) {
      this.canvas.hotkeys.unregister(HOTKEY_NAMESPACE, action);
    }
    this.registeredActions.length = 0;
  }

  private registerHotkeyActions(contributions: ToolContribution[]): void {
    const hotkeys = this.canvas.hotkeys;
    const whenEnabled = (fn: () => boolean | void): HotkeyHandler => () => {
      if (this.canvas.interactionDisabled) return false;
      return fn();
    };

    const toolBinds = new Map<string, string | undefined>(
      CORE_TOOLS.map((tool) => [tool.id, CORE_BINDS[tool.id] ?? undefined]),
    );
    for (const contribution of contributions) {
      toolBinds.set(contribution.tool.id, contribution.hotkey);
    }
    for (const [id, bind] of toolBinds) {
      this.register(`tool:${id}`, `${id} tool`, {
        binds: bind ? [bind] : [],
        onDown: whenEnabled(() => {
          this.setCurrentTool(id);
          return true;
        }),
      });
    }

    this.register('undo', 'Undo', {
      binds: ['Ctrl+Z', 'Meta+Z'],
      onDown: whenEnabled(() => {
        this.canvas.undo();
        return true;
      }),
    });
    this.register('redo', 'Redo', {
      binds: ['Ctrl+Shift+Z', 'Meta+Shift+Z', 'Ctrl+Y', 'Meta+Y'],
      onDown: whenEnabled(() => {
        this.canvas.redo();
        return true;
      }),
    });
    this.register('ping', 'Ping', {
      binds: ['Q'],
      onDown: whenEnabled(() => {
        const point = this.canvas.inputs.getCurrentWorldPoint();
        this.canvas.ping(point.x, point.y);
        return true;
      }),
    });
    this.register('toggleLock', 'Toggle lock', {
      binds: ['Ctrl+L', 'Meta+L'],
      onDown: whenEnabled(() => {
        this.canvas.toggleLock();
        return true;
      }),
    });
    this.register('pan', 'Temporary pan', {
      binds: ['Space'],
      onDown: whenEnabled(() => {
        this.beginTempPan('space');
        return true;
      }),
      onUp: () => {
        this.endTempPan('space');
        return true;
      },
    });
  }

  private register(action: string, name: string, def: { binds?: string[]; onDown?: HotkeyHandler; onUp?: HotkeyHandler }): void {
    this.canvas.hotkeys.register(HOTKEY_NAMESPACE, action, { name, ...def });
    this.registeredActions.push(action);
  }
}
