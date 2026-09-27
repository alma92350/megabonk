import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@megabonk/sim': resolve(__dirname, 'packages/sim/src/index.ts'),
      '@megabonk/content': resolve(__dirname, 'packages/content/src/index.ts'),
      '@megabonk/mcp': resolve(__dirname, 'packages/mcp/src/index.ts'),
      '@megabonk/meta': resolve(__dirname, 'packages/meta/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/sim/src/**', 'packages/content/src/**', 'packages/meta/src/**'],
      thresholds: { lines: 85, branches: 80, functions: 85, statements: 85 },
    },
  },
});
