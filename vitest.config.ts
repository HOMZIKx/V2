import { defineConfig } from 'vitest/config';

import { sharedTestConfig } from './tools/vitest.shared.js';

export default defineConfig({
  test: sharedTestConfig,
});
