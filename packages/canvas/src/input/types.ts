import type { PlaceableObject } from '../placeables/PlaceableObject';

export type PointerDevice = 'mouse' | 'touch' | 'pen';

export interface Point {
  x: number;
  y: number;
}

export type PointerTarget =
  | { type: 'canvas' }
  | { type: 'object'; object: PlaceableObject };

interface BaseInfo {
  /** Posição no espaço do mundo (após pan/zoom). */
  point: Point;
  /** Posição em pixels na tela (relativo ao elemento canvas). */
  screenPoint: Point;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** Cmd no macOS, Ctrl nas demais plataformas. */
  accelKey: boolean;
}

export interface CanvasPointerInfo extends BaseInfo {
  button: number;
  buttons: number;
  pointerId: number;
  device: PointerDevice;
  target: PointerTarget;
}

export type CanvasClickInfo = CanvasPointerInfo;

export interface CanvasWheelInfo extends BaseInfo {
  /** Delta já normalizado para pixels. */
  delta: Point;
  /** true => gesto de zoom (rodinha do mouse ou pinch do trackpad); false => pan (scroll de 2 dedos). */
  zoom: boolean;
}

export interface CanvasPinchInfo extends BaseInfo {
  /** Centro do gesto em tela. */
  screenCenter: Point;
  /** Centro do gesto no mundo. */
  worldCenter: Point;
  /** Fator multiplicativo de escala desde o último evento (ex.: 1.02). */
  scaleDelta: number;
  /** Deslocamento do centro desde o último evento (tela). */
  delta: Point;
}

export interface CanvasKeyInfo {
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  accelKey: boolean;
}

export const DRAG_THRESHOLD = 4;
export const DOUBLE_CLICK_MS = 400;
export const DOUBLE_CLICK_DIST = 8;
export const LONG_PRESS_MS = 500;
