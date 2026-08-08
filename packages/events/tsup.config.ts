import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // All runtime deps ship dual ESM/CJS — keep them external for a single
  // shared copy across the monorepo and optimal tree-shaking by consumers.
  external: ['mitt', 'tapable', 'valibot', 'uuid'],
});
