import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['cannon-es'],
  },
  {
    entry: { 'physics.worker': 'src/physics.worker.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    noExternal: ['cannon-es'],
  },
]);
