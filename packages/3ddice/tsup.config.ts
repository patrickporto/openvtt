import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['three', 'cannon-es', 'valibot', '@openvtt/assets', '@openvtt/dice-core', '@openvtt/dice-notation', '@openvtt/events', '@openvtt/physics', '@openvtt/render3d'],
});
