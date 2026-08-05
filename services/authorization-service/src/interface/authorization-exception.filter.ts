import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { AuthorizationError, type AuthorizationErrorCode } from '../domain/errors.js';

const STATUS_BY_CODE: Record<AuthorizationErrorCode, number> = {
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  AUTH_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  CLIENT_ASSERTION_INVALID: HttpStatus.UNAUTHORIZED,
  CLIENT_ASSERTION_REPLAY: HttpStatus.UNAUTHORIZED,
  CONFIG_INVALID: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Maps stable {@link AuthorizationError} codes to HTTP responses. */
@Catch(AuthorizationError)
export class AuthorizationExceptionFilter implements ExceptionFilter {
  public catch(exception: AuthorizationError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;

    void reply.status(status).send({
      error: { code: exception.code, message: exception.message },
    });
  }
}
