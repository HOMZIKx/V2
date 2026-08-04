import { createV2Config } from '@v2/eslint-config';

export default [{ ignores: ['eslint.config.mjs'] }, ...createV2Config()];
