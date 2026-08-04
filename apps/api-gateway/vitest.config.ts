import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/api-gateway/src/**/*.spec.ts'],
  },
});
