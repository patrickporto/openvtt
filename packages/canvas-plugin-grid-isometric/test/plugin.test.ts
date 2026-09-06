import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import { gridIsometricPlugin } from '../src';

let CanvasCtor: typeof Canvas;
let canvas: Canvas;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
  canvas = new CanvasCtor({} as HTMLElement);
  await canvas.use(gridIsometricPlugin);
});

afterAll(() => {
  canvas?.destroy();
});

describe('gridIsometricPlugin', () => {
  it('stays hidden while the scene uses another grid type', () => {
    expect(canvas.plugins.has('grid-isometric')).toBe(true);
    expect(canvas.layers.getLayer('grid-isometric')!.visible).toBe(false);
    canvas.grid.setType('isometric');
    expect(canvas.layers.getLayer('grid-isometric')!.visible).toBe(true);
  });
});
