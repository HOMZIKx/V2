export { ConfigValidationError, createConfig } from './create-config.js';
export {
  RuntimeEnvironmentSchema,
  assertNoAccidentalProductionConnections,
  assertProductionRequirements,
  extractConnectionHosts,
  isLocalInfrastructureHost,
  isProduction,
} from './guards.js';
export type { RuntimeEnvironment } from './guards.js';

export { createConfig as loadEnv } from './create-config.js';
