import { FOG_PANEL_TAG, OpenVTTFogPanel } from './fog-panel';
import { LAYER_PANEL_TAG, OpenVTTLayerPanel } from './layer-panel';

export { OpenVTTLayerPanel, LAYER_PANEL_TAG } from './layer-panel';
export { OpenVTTFogPanel, FOG_PANEL_TAG } from './fog-panel';

/**
 * Registra os Web Components do canvas (`<openvtt-layer-panel>`,
 * `<openvtt-fog-panel>`). Idempotente e side-effect free até ser chamado —
 * funciona com qualquer framework (React/Vue/Svelte/Angular/vanilla).
 */
export function defineCanvasElements(): void {
  if (!customElements.get(LAYER_PANEL_TAG)) customElements.define(LAYER_PANEL_TAG, OpenVTTLayerPanel);
  if (!customElements.get(FOG_PANEL_TAG)) customElements.define(FOG_PANEL_TAG, OpenVTTFogPanel);
}
