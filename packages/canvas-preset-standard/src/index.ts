import { Canvas, type CanvasOptions, type CanvasPlugin } from '@openvtt/canvas';
import { gridNonePlugin } from '@openvtt/canvas-plugin-grid';
import { gridSquarePlugin } from '@openvtt/canvas-plugin-grid-square';
import { gridHexVerticalPlugin, gridHexHorizontalPlugin } from '@openvtt/canvas-plugin-grid-hex';
import { gridIsometricPlugin } from '@openvtt/canvas-plugin-grid-isometric';
import { mapsPlugin } from '@openvtt/canvas-plugin-maps';
import { tilesPlugin } from '@openvtt/canvas-plugin-tiles';
import { drawingsPlugin } from '@openvtt/canvas-plugin-drawings';
import { wallsPlugin } from '@openvtt/canvas-plugin-walls';
import { templatesPlugin } from '@openvtt/canvas-plugin-templates';
import { tokensPlugin } from '@openvtt/canvas-plugin-tokens';
import { ringsPlugin } from '@openvtt/canvas-plugin-rings';
import { lightsPlugin } from '@openvtt/canvas-plugin-lights';
import { measurePlugin } from '@openvtt/canvas-plugin-measure';
import { rangesPlugin } from '@openvtt/canvas-plugin-ranges';
import { lightingPlugin } from '@openvtt/canvas-plugin-lighting';
import { fogPlugin } from '@openvtt/canvas-plugin-fog';
import { windowsPlugin } from '@openvtt/canvas-plugin-window';
import { imageEditorPlugin } from '@openvtt/canvas-plugin-image-editor';

export { gridNonePlugin, createGridTypePlugin, GridLayer } from '@openvtt/canvas-plugin-grid';
export { gridSquarePlugin } from '@openvtt/canvas-plugin-grid-square';
export { gridHexVerticalPlugin, gridHexHorizontalPlugin } from '@openvtt/canvas-plugin-grid-hex';
export { gridIsometricPlugin } from '@openvtt/canvas-plugin-grid-isometric';
export { mapsPlugin, MapsPlugin, MapPlaceable } from '@openvtt/canvas-plugin-maps';
export { tilesPlugin } from '@openvtt/canvas-plugin-tiles';
export { drawingsPlugin } from '@openvtt/canvas-plugin-drawings';
export { wallsPlugin, WallsPlugin } from '@openvtt/canvas-plugin-walls';
export { templatesPlugin } from '@openvtt/canvas-plugin-templates';
export { tokensPlugin } from '@openvtt/canvas-plugin-tokens';
export { ringsPlugin, RingsPlugin } from '@openvtt/canvas-plugin-rings';
export { lightsPlugin } from '@openvtt/canvas-plugin-lights';
export { measurePlugin } from '@openvtt/canvas-plugin-measure';
export { rangesPlugin, RangesPlugin } from '@openvtt/canvas-plugin-ranges';
export { lightingPlugin } from '@openvtt/canvas-plugin-lighting';
export { fogPlugin, defineFogElements } from '@openvtt/canvas-plugin-fog';
export { windowsPlugin, WindowsPlugin } from '@openvtt/canvas-plugin-window';
export { imageEditorPlugin, ImageEditorPlugin, ImageEditor, defineImageEditorElements } from '@openvtt/canvas-plugin-image-editor';

/** Plugins do preset padrão, na ordem de instalação recomendada. */
export const standardPlugins: CanvasPlugin[] = [
  gridSquarePlugin,
  gridHexVerticalPlugin,
  gridHexHorizontalPlugin,
  gridIsometricPlugin,
  gridNonePlugin,
  mapsPlugin,
  tilesPlugin,
  drawingsPlugin,
  wallsPlugin,
  templatesPlugin,
  tokensPlugin,
  ringsPlugin,
  lightsPlugin,
  measurePlugin,
  rangesPlugin,
  lightingPlugin,
  windowsPlugin,
  fogPlugin,
  imageEditorPlugin,
];

/**
 * Cria um canvas com o preset padrão completo (tiles, drawings, walls,
 * templates, tokens, rings, lights, measure, lighting, fog). Para um canvas
 * enxuto, use `new Canvas()` + `canvas.use(plugin)` seletivamente.
 */
export function createStandardCanvas(container: HTMLElement, options: Omit<CanvasOptions, 'plugins'> = {}): Canvas {
  return new Canvas(container, { ...options, plugins: standardPlugins });
}
