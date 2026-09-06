import * as v from 'valibot';
import type { WindowDockTarget, WindowStateKind } from '@openvtt/canvas';

export const WINDOW_DOCK_SCHEMA = v.picklist(['float', 'left', 'right', 'bottom']);
export const WINDOW_STATE_SCHEMA = v.picklist(['normal', 'minimized', 'maximized']);

const FINITE_NUMBER = v.pipe(v.number(), v.finite());

export const WINDOW_EVENT_BASE_SCHEMA = v.object({ id: v.string() });

/** Estado persistido de uma janela (`WindowManager.serialize()`/`restore()`). */
export const WINDOW_STATE_ENTRY_SCHEMA = v.object({
  id: v.string(),
  definitionId: v.optional(v.string()),
  x: FINITE_NUMBER,
  y: FINITE_NUMBER,
  width: FINITE_NUMBER,
  height: FINITE_NUMBER,
  state: WINDOW_STATE_SCHEMA,
  dock: WINDOW_DOCK_SCHEMA,
  stackIndex: v.optional(v.number()),
  zIndex: v.optional(v.number()),
  content: v.optional(v.unknown()),
});

export type WindowStateEntry = {
  id: string;
  definitionId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  state: WindowStateKind;
  dock: WindowDockTarget;
  stackIndex?: number;
  zIndex?: number;
  content?: unknown;
};

export const WINDOW_EVENT_SCHEMAS = {
  'window:created': v.object({ id: v.string(), definitionId: v.optional(v.string()) }),
  'window:closed': v.object({ id: v.string(), definitionId: v.optional(v.string()) }),
  'window:state': v.object({ id: v.string(), state: WINDOW_STATE_SCHEMA }),
  'window:dock': v.object({ id: v.string(), dock: WINDOW_DOCK_SCHEMA }),
  'window:focus': WINDOW_EVENT_BASE_SCHEMA,
  'window:blur': WINDOW_EVENT_BASE_SCHEMA,
  'window:resize': v.object({ id: v.string(), width: v.number(), height: v.number() }),
  'window:resize-blocked': WINDOW_EVENT_BASE_SCHEMA,
  'window:popout': WINDOW_EVENT_BASE_SCHEMA,
  'window:popin': WINDOW_EVENT_BASE_SCHEMA,
} as const;

export type WindowCreatedEvent = { id: string; definitionId?: string };
export type WindowClosedEvent = { id: string; definitionId?: string };
export type WindowStateEvent = { id: string; state: WindowStateKind };
export type WindowDockEvent = { id: string; dock: WindowDockTarget };
export type WindowFocusEvent = { id: string };
export type WindowBlurEvent = { id: string };
export type WindowResizeEvent = { id: string; width: number; height: number };
export type WindowResizeBlockedEvent = { id: string };
export type WindowPopoutEvent = { id: string };
export type WindowPopinEvent = { id: string };
