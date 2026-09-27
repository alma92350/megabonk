import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
  root: resolve(root, 'packages/client'),
  resolve: {
    alias: {
      '@megabonk/sim': resolve(root, 'packages/sim/src/index.ts'),
      '@megabonk/content': resolve(root, 'packages/content/src/index.ts'),
      '@megabonk/meta': resolve(root, 'packages/meta/src/index.ts'),
    },
  },
  server: { port: 5173, host: '127.0.0.1', open: false },
  build: { outDir: resolve(root, 'dist'), emptyOutDir: true },
});
