import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { Canvas } from '@openvtt/canvas';
import { createGridTypePlugin } from '../src/plugin';
import { gridMenuItems } from '../src/context';
import { GridLayer } from '../src/GridLayer';

let CanvasCtor: typeof Canvas;
let canvas: Canvas;
let square: GridLayer;
let hex: GridLayer;

beforeAll(async () => {
  ({ Canvas: CanvasCtor } = await import('@openvtt/canvas'));
  canvas = new CanvasCtor({} as HTMLElement);
  const squarePlugin = createGridTypePlugin({ type: 'square' });
  const hexPlugin = createGridTypePlugin({ type: 'hex-vertical' });
  await canvas.use(squarePlugin);
  await canvas.use(hexPlugin);
  square = canvas.layers.getLayer<GridLayer>('grid-square')!;
  hex = canvas.layers.getLayer<GridLayer>('grid-hex-vertical')!;
});

afterAll(() => {
  canvas?.destroy();
});

describe('createGridTypePlugin', () => {
  it('registers one layer per installed grid type', () => {
    expect(canvas.layers.get('grid-square')).toBeDefined();
    expect(canvas.layers.get('grid-hex-vertical')).toBeDefined();
  });

  it('only the layer matching canvas.grid.type is visible', () => {
    expect(canvas.grid.type).toBe('square');
    expect(square.visible).toBe(true);
    expect(hex.visible).toBe(false);
  });

  it('adopts the scene size on scene:setup', () => {
    canvas.bus.call('scene:setup', { width: 1200, height: 800 });
    expect(square.worldSize).toEqual({ width: 1200, height: 800 });
    expect(hex.worldSize).toEqual({ width: 1200, height: 800 });
  });

  it('switching types toggles layer visibility via grid:change', () => {
    canvas.grid.setType('hex-vertical');
    expect(canvas.grid.type).toBe('hex-vertical');
    expect(square.visible).toBe(false);
    expect(hex.visible).toBe(true);
    canvas.grid.setType('none');
    expect(square.visible).toBe(false);
    expect(hex.visible).toBe(false);
    canvas.grid.setType('square');
    expect(square.visible).toBe(true);
  });

  it('redraws with the current config when the grid changes', () => {
    canvas.grid.setSize(96);
    expect(canvas.grid.size).toBe(96);
  });
});

describe('gridMenuItems', () => {
  it('always offers the type toggle; style controls only when active', () => {
    canvas.grid.setType('square');
    const own = gridMenuItems(canvas, 'grid-square', 'square').map((i) => i.id);
    expect(own).toContain('grid-square:enable');
    expect(own).toContain('grid-square:cell');
    expect(own).toContain('grid-square:line');
    expect(own).toContain('grid-square:opacity');
    expect(own).toContain('grid-square:color');
    expect(own).toContain('grid-square:offset-x');
    const other = gridMenuItems(canvas, 'grid-hex-vertical', 'hex-vertical').map((i) => i.id);
    expect(other).toEqual(['grid-hex-vertical:enable']);
  });

  it('separator only appears with style controls', () => {
    canvas.grid.setType('hex-vertical');
    const active = gridMenuItems(canvas, 'grid-hex-vertical', 'hex-vertical');
    expect(active.some((i) => i.type === 'separator')).toBe(true);
    const inactive = gridMenuItems(canvas, 'grid-square', 'square');
    expect(inactive.some((i) => i.type === 'separator')).toBe(false);
  });

  it('align sliders are offered for every grid type', () => {
    canvas.grid.setType('hex-vertical');
    const hex = gridMenuItems(canvas, 'grid-hex-vertical', 'hex-vertical').map((i) => i.id);
    expect(hex).toContain('grid-hex-vertical:offset-x');
    expect(hex).toContain('grid-hex-vertical:offset-y');
    canvas.grid.setType('isometric');
    const iso = gridMenuItems(canvas, 'grid-isometric', 'isometric').map((i) => i.id);
    expect(iso).toContain('grid-isometric:offset-x');
    expect(iso).toContain('grid-isometric:offset-y');
  });

  it('none contributes a toggle only', () => {
    const none = gridMenuItems(canvas, 'grid-none', 'none');
    expect(none).toHaveLength(1);
    expect(none[0]).toMatchObject({ id: 'grid-none:enable', label: 'No grid' });
    expect((none[0] as { closeOnClick?: boolean }).closeOnClick).toBe(true);
  });
});

describe('gridNonePlugin', () => {
  it('registers the toggle without a layer', async () => {
    const { gridNonePlugin } = await import('../src');
    const bare = new CanvasCtor({} as HTMLElement);
    await bare.use(gridNonePlugin);
    expect(bare.plugins.has('grid-none')).toBe(true);
    expect(bare.layers.get('grid-none')).toBeUndefined();
    bare.grid.setType('none');
    expect(bare.grid.type).toBe('none');
    bare.destroy();
  });
});
