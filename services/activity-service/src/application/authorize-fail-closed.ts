import { ActivityError } from '../domain/errors.js';
import type { AuthorizePort, AuthorizeRequest, AuthorizeResult } from './ports/activity.ports.js';

/** Authorization dependency failures must never become an implicit allow. */
export async function authorizeOrFailClosed(
  authorize: AuthorizePort,
  request: AuthorizeRequest,
): Promise<AuthorizeResult> {
  try {
    return await authorize.authorize(request);
  } catch (error) {
    if (error instanceof ActivityError) {
      throw error;
    }
    throw new ActivityError('CONFIG_INVALID', 'Authorization is unavailable');
  }
}

export async function requireAllowed(
  authorize: AuthorizePort,
  request: AuthorizeRequest,
): Promise<void> {
  const result = await authorizeOrFailClosed(authorize, request);
  if (!result.allowed) {
    throw new ActivityError('FORBIDDEN', `Missing permission ${request.permissionId}`);
  }
}
