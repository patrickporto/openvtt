export { WindowsPlugin, windowsPlugin } from './plugin';
export { WindowManager } from './manager';
export type { WindowCreateOptions, WindowOpenOverrides, WindowManagerOptions } from './manager';
export { WindowHandle } from './handle';
export type { WindowHandleEvent } from './handle';
export { WindowFrameElement, WINDOW_FRAME_TAG, defineWindowElements } from './frame';
export { windowsBus } from './bus';
export type { WindowsBusPort } from './bus';
export { WINDOW_STATE_ENTRY_SCHEMA, WINDOW_EVENT_SCHEMAS } from './state';
export type {
  WindowStateEntry,
  WindowCreatedEvent,
  WindowClosedEvent,
  WindowStateEvent,
  WindowDockEvent,
  WindowFocusEvent,
  WindowBlurEvent,
  WindowResizeEvent,
  WindowResizeBlockedEvent,
  WindowPopoutEvent,
  WindowPopinEvent,
} from './state';
export { computeSnap, detectDockZone, clampToBounds } from './snap';
export type { Rect, Bounds, SnapResult } from './snap';
