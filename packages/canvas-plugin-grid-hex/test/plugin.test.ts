import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import { gridHexVerticalPlugin, gridHexHorizontalPlugin } from '../src';

let CanvasCtor: typeof Canvas;
let canvas: Canvas;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
  canvas = new CanvasCtor({} as HTMLElement);
  await canvas.use(gridHexVerticalPlugin);
  await canvas.use(gridHexHorizontalPlugin);
});

afterAll(() => {
  canvas?.destroy();
});

describe('hex grid plugins', () => {
  it('registers one plugin per hex orientation', () => {
    expect(canvas.plugins.has('grid-hex-vertical')).toBe(true);
    expect(canvas.plugins.has('grid-hex-horizontal')).toBe(true);
  });

  it('only the active orientation is visible', () => {
    canvas.grid.setType('hex-horizontal');
    expect(canvas.layers.getLayer('grid-hex-vertical')!.visible).toBe(false);
    expect(canvas.layers.getLayer('grid-hex-horizontal')!.visible).toBe(true);
    canvas.grid.setType('hex-vertical');
    expect(canvas.layers.getLayer('grid-hex-vertical')!.visible).toBe(true);
    expect(canvas.layers.getLayer('grid-hex-horizontal')!.visible).toBe(false);
  });
});
