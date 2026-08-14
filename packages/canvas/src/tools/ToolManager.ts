import type { Canvas } from '../canvas';
import type { StateEventName, StateNode, StateNodeConstructor } from '../state/StateNode';
import { RootState } from './RootState';
import type { ToolContribution } from '../plugins/types';
import { SelectTool } from './select';
import { HandTool } from './hand';
import { EraserTool } from './eraser';

/** Opções mutáveis por tool, indexadas pelo id da tool (plugins definem as suas). */
export type ToolOptions = Record<string, Record<string, unknown>>;

const CORE_TOOLS: StateNodeConstructor[] = [SelectTool, HandTool, EraserTool];

const CORE_HOTKEYS: Record<string, string> = {
  v: 'select',
  h: 'hand',
  e: 'eraser',
};

/**
 * Registra e gerencia as tools; expõe a API pública de troca de tool.
 * Tools de plugins são contribuídas via `canvas.registerTool()` (ou
 * `PluginContext.registerTool`) antes do `initialize()`.
 */
export class ToolManager {
  readonly options: ToolOptions = {};
  private readonly root: RootState;

  constructor(canvas: Canvas, contributions: ToolContribution[], options?: ToolOptions) {
    const extra: StateNodeConstructor[] = [];
    const hotkeys: Record<string, string> = { ...CORE_HOTKEYS };
    for (const contribution of contributions) {
      extra.push(contribution.tool);
      if (contribution.hotkey) hotkeys[contribution.hotkey.toLowerCase()] = contribution.tool.id;
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
    RootState.extraHotkeys = hotkeys;
    this.root = new RootState(null, canvas);
    this.root.enter();
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
}
