import type { IdentityEnv } from '../config/identity-env.js';
import type { AssertionJtiStore } from './assertion-jti-store.js';
import { loadInternalJwtKeyring, type InternalJwtKeyring } from './internal-jwt-keyring.js';
import {
  loadServiceClientRegistry,
  type ServiceClientRegistry,
} from './service-client-registry.js';

export interface InternalJwtRuntime {
  readonly keyring: InternalJwtKeyring;
  readonly serviceClients: ServiceClientRegistry;
  readonly assertionJtiStore: AssertionJtiStore;
  close(): Promise<void>;
}

export async function createInternalJwtRuntime(
  config: IdentityEnv,
  assertionJtiStore: AssertionJtiStore,
): Promise<InternalJwtRuntime> {
  const keyring = await loadInternalJwtKeyring(
    config.IDENTITY_INTERNAL_JWT_KEYRING_JSON ?? '',
    config.IDENTITY_INTERNAL_JWT_ACTIVE_KID ?? '',
  );
  const serviceClients = await loadServiceClientRegistry(
    config.IDENTITY_SERVICE_CLIENTS_JSON ?? '',
  );

  return {
    keyring,
    serviceClients,
    assertionJtiStore,
    async close(): Promise<void> {
      await assertionJtiStore.close();
    },
  };
}
