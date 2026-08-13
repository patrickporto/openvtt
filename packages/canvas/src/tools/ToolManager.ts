import type { Canvas } from '../canvas';
import type { StateEventName, StateNode } from '../state/StateNode';
import { RootState } from './RootState';
import { defaultToolOptions, type ToolOptions } from './Tool';

/** Registra e gerencia as tools; expõe a API pública de troca de tool. */
export class ToolManager {
  readonly options: ToolOptions;
  private readonly root: RootState;

  constructor(canvas: Canvas, options?: Partial<ToolOptions>) {
    const base = defaultToolOptions();
    this.options = {
      token: { ...base.token, ...options?.token },
      wall: { ...base.wall, ...options?.wall },
      tile: { ...base.tile, ...options?.tile },
      draw: { ...base.draw, ...options?.draw },
      shape: { ...base.shape, ...options?.shape },
      fog: { ...base.fog, ...options?.fog },
      light: { ...base.light, ...options?.light },
      template: { ...base.template, ...options?.template },
    };
    this.root = new RootState(null, canvas);
    this.root.enter();
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
