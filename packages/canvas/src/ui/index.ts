import { LAYER_PANEL_TAG, OpenVTTLayerPanel } from './layer-panel';

export { OpenVTTLayerPanel, LAYER_PANEL_TAG } from './layer-panel';

/**
 * Registra os Web Components do core do canvas (`<openvtt-layer-panel>`).
 * Plugins podem expor os seus próprios componentes (ex.: fog panel do
 * @openvtt/canvas-plugin-fog). Idempotente e side-effect free até ser chamada.
 */
export function defineCanvasElements(): void {
  if (!customElements.get(LAYER_PANEL_TAG)) customElements.define(LAYER_PANEL_TAG, OpenVTTLayerPanel);
}
