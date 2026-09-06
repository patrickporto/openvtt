import type { PluginContext, WindowConstraints, WindowDockEdge, WindowDockTarget, WindowStateKind } from '@openvtt/canvas';

export type WindowHandleEvent = 'close' | 'focus' | 'blur' | 'state' | 'dock' | 'resize' | 'popout' | 'popin';

/**
 * Referência pública a uma janela aberta. Todas as operações delegam ao
 * `WindowManager` (fonte única de verdade); `element` é o frame
 * `<openvtt-window-frame>` e `content` o elemento produzido pela factory
 * (ambos null em modo headless).
 */
export class WindowHandle {
  constructor(
    readonly id: string,
    private readonly manager: WindowManagerPort,
  ) {}

  get definitionId(): string | undefined {
    return this.manager.definitionIdOf(this.id);
  }

  get title(): string {
    return this.manager.titleOf(this.id);
  }

  get state(): WindowStateKind {
    return this.manager.stateOf(this.id);
  }

  get dock(): WindowDockTarget {
    return this.manager.dockOf(this.id);
  }

  get poppedOut(): boolean {
    return this.manager.poppedOutOf(this.id);
  }

  get element(): HTMLElement | null {
    return this.manager.elementOf(this.id);
  }

  get content(): HTMLElement | null {
    return this.manager.contentOf(this.id);
  }

  get constraints(): WindowConstraints {
    return this.manager.constraintsOf(this.id);
  }

  setConstraints(constraints: WindowConstraints): void {
    this.manager.setConstraints(this.id, constraints);
  }

  close(): void {
    this.manager.close(this.id);
  }

  focus(): void {
    this.manager.focus(this.id);
  }

  minimize(): void {
    this.manager.minimize(this.id);
  }

  restore(): void {
    this.manager.restoreWindow(this.id);
  }

  maximize(): void {
    this.manager.maximize(this.id);
  }

  moveTo(x: number, y: number): boolean {
    return this.manager.moveTo(this.id, x, y);
  }

  resizeTo(width: number, height: number): boolean {
    return this.manager.resizeTo(this.id, width, height);
  }

  dockTo(edge: WindowDockEdge): boolean {
    return this.manager.dockTo(this.id, edge);
  }

  undock(): boolean {
    return this.manager.undock(this.id);
  }

  popout(): boolean {
    return this.manager.popout(this.id);
  }

  popin(): boolean {
    return this.manager.popin(this.id);
  }

  on(event: WindowHandleEvent, listener: () => void): () => void {
    return this.manager.onHandleEvent(this.id, event, listener);
  }
}

export interface WindowManagerPort {
  definitionIdOf(id: string): string | undefined;
  titleOf(id: string): string;
  stateOf(id: string): WindowStateKind;
  dockOf(id: string): WindowDockTarget;
  poppedOutOf(id: string): boolean;
  elementOf(id: string): HTMLElement | null;
  contentOf(id: string): HTMLElement | null;
  constraintsOf(id: string): WindowConstraints;
  setConstraints(id: string, constraints: WindowConstraints): void;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  restoreWindow(id: string): void;
  maximize(id: string): void;
  moveTo(id: string, x: number, y: number): boolean;
  resizeTo(id: string, width: number, height: number): boolean;
  dockTo(id: string, edge: WindowDockEdge): boolean;
  undock(id: string): boolean;
  popout(id: string): boolean;
  popin(id: string): boolean;
  onHandleEvent(id: string, event: WindowHandleEvent, listener: () => void): () => void;
}

export type { PluginContext };
