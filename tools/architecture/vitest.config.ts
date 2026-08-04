import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tools/architecture/**/*.test.ts'],
    environment: 'node',
  },
});
