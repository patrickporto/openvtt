export interface WheelClassifyInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Decide se um evento de wheel é ZOOM (true) ou PAN (false).
 * Heurística à la tldraw:
 *  - ctrl/meta          => pinch de trackpad (ou ctrl+wheel) => zoom
 *  - componente horizontal ou deltas fracionados (modo pixel) => scroll de 2 dedos => pan
 *  - rodinha do mouse (deltaY inteiro, sem deltaX) => zoom
 */
export function classifyWheelZoom(input: WheelClassifyInput): boolean {
  const isPinchZoom = input.ctrlKey || input.metaKey;
  const hasHorizontal = Math.abs(input.deltaX) > 0.5;
  const isFractional = input.deltaY % 1 !== 0 || input.deltaX % 1 !== 0;
  const trackpadPan = !isPinchZoom && input.deltaMode === 0 && (hasHorizontal || isFractional);
  return isPinchZoom || !trackpadPan;
}
