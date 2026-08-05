import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { IdentityError, type IdentityErrorCode } from '../domain/errors.js';

const STATUS_BY_CODE: Record<IdentityErrorCode, number> = {
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  ACCOUNT_NOT_LINKED: HttpStatus.CONFLICT,
  ACCOUNT_ALREADY_LINKED: HttpStatus.CONFLICT,
  CANNOT_UNLINK_LAST: HttpStatus.CONFLICT,
  PROVIDER_SUBJECT_TAKEN: HttpStatus.CONFLICT,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  AUTH_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CLIENT_ASSERTION_INVALID: HttpStatus.UNAUTHORIZED,
  CLIENT_ASSERTION_REPLAY: HttpStatus.UNAUTHORIZED,
  INTERNAL_JWT_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  AUDIENCE_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  LOGIN_NOT_ENTITLED: HttpStatus.FORBIDDEN,
  AUTHORIZATION_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Maps stable {@link IdentityError} codes to HTTP responses without leaking library internals. */
@Catch(IdentityError)
export class IdentityExceptionFilter implements ExceptionFilter {
  public catch(exception: IdentityError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;

    void reply.status(status).send({
      error: { code: exception.code, message: exception.message },
    });
  }
}
