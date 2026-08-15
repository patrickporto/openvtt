import { CONTEXT_MENU_TAG, OpenVTTContextMenu } from './context-menu';
import { LAYER_PANEL_TAG, OpenVTTLayerPanel } from './layer-panel';

export { OpenVTTContextMenu, CONTEXT_MENU_TAG } from './context-menu';
export { OpenVTTLayerPanel, LAYER_PANEL_TAG } from './layer-panel';

/**
 * Registra os Web Components do core do canvas (`<openvtt-layer-panel>`,
 * `<openvtt-context-menu>`). Plugins podem expor os seus próprios
 * componentes (ex.: fog panel do @openvtt/canvas-plugin-fog).
 * Idempotente e side-effect free até ser chamada.
 */
export function defineCanvasElements(): void {
  if (!customElements.get(LAYER_PANEL_TAG)) customElements.define(LAYER_PANEL_TAG, OpenVTTLayerPanel);
  if (!customElements.get(CONTEXT_MENU_TAG)) customElements.define(CONTEXT_MENU_TAG, OpenVTTContextMenu);
}
