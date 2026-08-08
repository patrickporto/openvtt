/**
 * Creates a 2D canvas for texture rendering
 * Web-only implementation (no React Native)
 */
export function createCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  return { canvas, context };
}
