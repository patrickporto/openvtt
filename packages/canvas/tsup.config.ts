import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['pixi.js', 'pixi-viewport', 'pixi-filters', 'pixi-filters/outline', 'pixi-filters/glow', 'valibot', 'uuid', 'rbush', '@openvtt/events'],
});
