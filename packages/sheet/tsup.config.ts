import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@openvtt/dice-core',
    '@openvtt/dice-notation',
    '@openvtt/events',
    '@openvtt/formula',
    'valibot',
    'uuid',
  ],
});
