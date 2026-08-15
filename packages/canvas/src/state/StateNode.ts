import type { Canvas } from '../canvas';
import type {
  CanvasClickInfo,
  CanvasKeyInfo,
  CanvasPinchInfo,
  CanvasPointerInfo,
  CanvasWheelInfo,
} from '../input/types';

export type StateNodeConstructor = (new (parent: StateNode | null, canvas: Canvas) => StateNode) & {
  id: string;
  initial?: string;
  children(): StateNodeConstructor[];
};

/** Eventos que a máquina de estados despacha para os handlers tipados. */
export type StateEventName =
  | 'pointerdown'
  | 'pointermove'
  | 'pointerup'
  | 'doubleclick'
  | 'longpress'
  | 'contextmenu'
  | 'keydown'
  | 'keyup'
  | 'wheel'
  | 'pinchstart'
  | 'pinch'
  | 'pinchend'
  | 'tick';

const HANDLER_BY_EVENT: Record<StateEventName, string> = {
  pointerdown: 'onPointerDown',
  pointermove: 'onPointerMove',
  pointerup: 'onPointerUp',
  doubleclick: 'onDoubleClick',
  longpress: 'onLongPress',
  contextmenu: 'onContextMenu',
  keydown: 'onKeyDown',
  keyup: 'onKeyUp',
  wheel: 'onWheel',
  pinchstart: 'onPinchStart',
  pinch: 'onPinch',
  pinchend: 'onPinchEnd',
  tick: 'onTick',
};

export abstract class StateNode {
  static id = '';
  static initial: string | undefined;
  static children(): StateNodeConstructor[] {
    return [];
  }

  readonly canvas: Canvas;
  readonly parent: StateNode | null;
  private _current: StateNode | null = null;
  private readonly childMap = new Map<string, StateNode>();

  constructor(parent: StateNode | null, canvas: Canvas) {
    this.parent = parent;
    this.canvas = canvas;
    const ctor = this.constructor as typeof StateNode;
    for (const Child of ctor.children()) {
      const child = new Child(this, canvas);
      this.childMap.set(Child.id, child);
    }
  }

  get id(): string {
    return (this.constructor as typeof StateNode).id;
  }

  get current(): StateNode | null {
    return this._current;
  }

  get path(): string {
    const here = this.id;
    return this._current ? `${here}.${this._current.path}` : here;
  }

  get isActiveLeaf(): boolean {
    return this._current === null;
  }

  /** Entra neste estado e desce até o child inicial (se houver). */
  enter(info?: unknown): void {
    this.onEnter(info);
    const initial = (this.constructor as typeof StateNode).initial;
    if (initial) {
      this._current = this.childMap.get(initial) ?? null;
      this._current?.enter(info);
    }
  }

  exit(info?: unknown): void {
    this._current?.exit(info);
    this._current = null;
    this.onExit(info);
  }

  /** Transiciona para um child direto ('idle') ou descendente ('a.b'). */
  transition(id: string, info?: unknown): void {
    const [head, ...rest] = id.split('.');
    const next = this.childMap.get(head);
    if (!next) return;
    this._current?.exit(info);
    this._current = next;
    next.enter(info);
    if (rest.length) next.transition(rest.join('.'), info);
  }

  /** Despacha um evento do root até a folha ativa. */
  handleEvent(name: StateEventName, info?: unknown): void {
    const method = HANDLER_BY_EVENT[name];
    const handler = (this as unknown as Record<string, unknown>)[method];
    const child = this._current;
    if (typeof handler === 'function') {
      (handler as (i?: unknown) => void).call(this, info);
    }
    if (this._current === child) child?.handleEvent(name, info);
  }

  /* Lifecycle */
  onEnter(_info?: unknown): void {}
  onExit(_info?: unknown): void {}

  /* Handlers (override conforme necessário) */
  onPointerDown(_info: CanvasPointerInfo): void {}
  onPointerMove(_info: CanvasPointerInfo): void {}
  onPointerUp(_info: CanvasPointerInfo): void {}
  onDoubleClick(_info: CanvasClickInfo): void {}
  onLongPress(_info: CanvasPointerInfo): void {}
  onContextMenu(_info: CanvasPointerInfo): void {}
  onKeyDown(_info: CanvasKeyInfo): void {}
  onKeyUp(_info: CanvasKeyInfo): void {}
  onWheel(_info: CanvasWheelInfo): void {}
  onPinchStart(_info: CanvasPinchInfo): void {}
  onPinch(_info: CanvasPinchInfo): void {}
  onPinchEnd(_info: CanvasPinchInfo): void {}
  onTick(): void {}
}
