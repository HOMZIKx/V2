export const PLAYER_WORKSPACE_SERVICE_BASE_URL = Symbol('PLAYER_WORKSPACE_SERVICE_BASE_URL');
export const PLAYER_WORKSPACE_ASSERTION_CONFIG = Symbol('PLAYER_WORKSPACE_ASSERTION_CONFIG');

export type PlayerWorkspaceAssertionConfig = {
  readonly clientId: string;
  readonly privateKeyPem: string;
  readonly activeKid: string;
  readonly audience: string;
};
