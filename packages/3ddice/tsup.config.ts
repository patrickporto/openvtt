import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['three', 'cannon-es', 'valibot', '@openvtt/events', '@openvtt/physics', '@openvtt/render3d'],
});
