import { dynamicBus, type CanvasBus } from '@openvtt/canvas';
import type {
  WindowBlurEvent,
  WindowCreatedEvent,
  WindowClosedEvent,
  WindowDockEvent,
  WindowFocusEvent,
  WindowPopinEvent,
  WindowPopoutEvent,
  WindowResizeBlockedEvent,
  WindowResizeEvent,
  WindowStateEvent,
} from './state';

/** Porta tipada dos eventos do plugin windows (`window:*`). */
export interface WindowsBusPort {
  onWindowCreated(listener: (payload: WindowCreatedEvent) => void): () => void;
  onWindowClosed(listener: (payload: WindowClosedEvent) => void): () => void;
  onWindowState(listener: (payload: WindowStateEvent) => void): () => void;
  onWindowDock(listener: (payload: WindowDockEvent) => void): () => void;
  onWindowFocus(listener: (payload: WindowFocusEvent) => void): () => void;
  onWindowBlur(listener: (payload: WindowBlurEvent) => void): () => void;
  onWindowResize(listener: (payload: WindowResizeEvent) => void): () => void;
  onWindowResizeBlocked(listener: (payload: WindowResizeBlockedEvent) => void): () => void;
  onWindowPopout(listener: (payload: WindowPopoutEvent) => void): () => void;
  onWindowPopin(listener: (payload: WindowPopinEvent) => void): () => void;
}

export function windowsBus(bus: CanvasBus): WindowsBusPort {
  const dyn = dynamicBus(bus);
  return {
    onWindowCreated: (listener) => dyn.on('window:created', listener),
    onWindowClosed: (listener) => dyn.on('window:closed', listener),
    onWindowState: (listener) => dyn.on('window:state', listener),
    onWindowDock: (listener) => dyn.on('window:dock', listener),
    onWindowFocus: (listener) => dyn.on('window:focus', listener),
    onWindowBlur: (listener) => dyn.on('window:blur', listener),
    onWindowResize: (listener) => dyn.on('window:resize', listener),
    onWindowResizeBlocked: (listener) => dyn.on('window:resize-blocked', listener),
    onWindowPopout: (listener) => dyn.on('window:popout', listener),
    onWindowPopin: (listener) => dyn.on('window:popin', listener),
  };
}
