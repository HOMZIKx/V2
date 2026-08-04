import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['services/authorization-service/src/**/*.spec.ts'],
  },
});
