import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@crab-science/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@crab-science/llm-layer': resolve(__dirname, 'packages/llm-layer/src/index.ts'),
      '@crab-science/agent-core': resolve(__dirname, 'packages/agent-core/src/index.ts'),
      '@crab-science/storage': resolve(__dirname, 'packages/storage/src/index.ts'),
      '@crab-science/evolution-engine': resolve(__dirname, 'packages/evolution-engine/src/index.ts'),
    },
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  test: {
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'apps/**/__tests__/**/*.test.ts',
    ],
    globals: true,
  },
});
