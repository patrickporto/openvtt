import { createGridTypePlugin } from '@openvtt/canvas-plugin-grid';

/** Grid hexagonal pointy-top — registra a layer `grid-hex-vertical`. */
export const gridHexVerticalPlugin = createGridTypePlugin({
  type: 'hex-vertical',
  name: 'Grid · Hex vertical',
  layerLabel: 'Grid · Hex vertical',
});

/** Grid hexagonal flat-top — registra a layer `grid-hex-horizontal`. */
export const gridHexHorizontalPlugin = createGridTypePlugin({
  type: 'hex-horizontal',
  name: 'Grid · Hex horizontal',
  layerLabel: 'Grid · Hex horizontal',
});
