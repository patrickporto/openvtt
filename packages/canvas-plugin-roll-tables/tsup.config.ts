import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['pixi.js', 'valibot', 'uuid', '@openvtt/events', '@openvtt/canvas', '@openvtt/roll-tables'],
});
