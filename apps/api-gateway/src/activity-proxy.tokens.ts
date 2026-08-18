export const ACTIVITY_SERVICE_BASE_URL = Symbol('ACTIVITY_SERVICE_BASE_URL');
export const API_GATEWAY_FORWARD_ACTOR_HEADERS = Symbol('API_GATEWAY_FORWARD_ACTOR_HEADERS');
export const IDENTITY_SERVICE_BASE_URL = Symbol('IDENTITY_SERVICE_BASE_URL');
export const ACTIVITY_ASSERTION_CONFIG = Symbol('ACTIVITY_ASSERTION_CONFIG');

export type ActivityAssertionConfig = {
  readonly clientId: string;
  readonly privateKeyPem: string;
  readonly activeKid: string;
  readonly audience: string;
};
