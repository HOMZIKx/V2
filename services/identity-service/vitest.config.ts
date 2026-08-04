import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['services/identity-service/src/**/*.spec.ts'],
  },
});
