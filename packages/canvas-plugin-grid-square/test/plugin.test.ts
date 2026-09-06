import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import { gridSquarePlugin } from '../src';

let CanvasCtor: typeof Canvas;
let canvas: Canvas;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
  canvas = new CanvasCtor({} as HTMLElement);
  await canvas.use(gridSquarePlugin);
});

afterAll(() => {
  canvas?.destroy();
});

describe('gridSquarePlugin', () => {
  it('installs the grid-square layer visible for the default grid type', () => {
    expect(canvas.plugins.has('grid-square')).toBe(true);
    const layer = canvas.layers.getLayer('grid-square');
    expect(layer).toBeDefined();
    expect(layer!.visible).toBe(true);
  });

  it('hides the layer when another grid type is active', () => {
    canvas.grid.setType('hex-vertical');
    expect(canvas.layers.getLayer('grid-square')!.visible).toBe(false);
    canvas.grid.setType('square');
    expect(canvas.layers.getLayer('grid-square')!.visible).toBe(true);
  });
});
