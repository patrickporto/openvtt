export { ImageEditorPlugin, imageEditorPlugin } from './plugin';
export type { ImageEditorPluginOptions } from './plugin';
export { ImageEditor } from './editor';
export type { ImageEditorDeps, ImageEditorState } from './editor';
export {
  ImageComposer,
  DEFAULT_SETTINGS,
  HtmlImageSource,
  domCanvasFactory,
} from './composer';
export type {
  Canvas2DFactory,
  ComposeImageSource,
  ImageEditorSettings,
  ImageTransform,
} from './composer';
export {
  imageMasks,
  MaskRegistry,
  polygonMask,
  pathMask,
  hexVerticalVertices,
  hexHorizontalVertices,
} from './masks';
export type { MaskShape } from './masks';
export { OpenVTTImageEditor, IMAGE_EDITOR_TAG, defineImageEditorElements } from './ui/image-editor';
