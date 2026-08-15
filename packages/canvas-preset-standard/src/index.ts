import { Canvas, type CanvasOptions, type CanvasPlugin } from '@openvtt/canvas';
import { tilesPlugin } from '@openvtt/canvas-plugin-tiles';
import { drawingsPlugin } from '@openvtt/canvas-plugin-drawings';
import { wallsPlugin } from '@openvtt/canvas-plugin-walls';
import { templatesPlugin } from '@openvtt/canvas-plugin-templates';
import { tokensPlugin } from '@openvtt/canvas-plugin-tokens';
import { lightsPlugin } from '@openvtt/canvas-plugin-lights';
import { measurePlugin } from '@openvtt/canvas-plugin-measure';
import { lightingPlugin } from '@openvtt/canvas-plugin-lighting';
import { fogPlugin } from '@openvtt/canvas-plugin-fog';
import { imageEditorPlugin } from '@openvtt/canvas-plugin-image-editor';

export { tilesPlugin } from '@openvtt/canvas-plugin-tiles';
export { drawingsPlugin } from '@openvtt/canvas-plugin-drawings';
export { wallsPlugin, WallsPlugin } from '@openvtt/canvas-plugin-walls';
export { templatesPlugin } from '@openvtt/canvas-plugin-templates';
export { tokensPlugin } from '@openvtt/canvas-plugin-tokens';
export { lightsPlugin } from '@openvtt/canvas-plugin-lights';
export { measurePlugin } from '@openvtt/canvas-plugin-measure';
export { lightingPlugin } from '@openvtt/canvas-plugin-lighting';
export { fogPlugin, defineFogElements } from '@openvtt/canvas-plugin-fog';
export { imageEditorPlugin, ImageEditorPlugin, ImageEditor, defineImageEditorElements } from '@openvtt/canvas-plugin-image-editor';

/** Plugins do preset padrão, na ordem de instalação recomendada. */
export const standardPlugins: CanvasPlugin[] = [
  tilesPlugin,
  drawingsPlugin,
  wallsPlugin,
  templatesPlugin,
  tokensPlugin,
  lightsPlugin,
  measurePlugin,
  lightingPlugin,
  fogPlugin,
  imageEditorPlugin,
];

/**
 * Cria um canvas com o preset padrão completo (tiles, drawings, walls,
 * templates, tokens, lights, measure, lighting, fog). Para um canvas
 * enxuto, use `new Canvas()` + `canvas.use(plugin)` seletivamente.
 */
export function createStandardCanvas(container: HTMLElement, options: Omit<CanvasOptions, 'plugins'> = {}): Canvas {
  return new Canvas(container, { ...options, plugins: standardPlugins });
}
