import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { ActivityError, type ActivityErrorCode } from '../domain/errors.js';

const STATUS_BY_CODE: Record<ActivityErrorCode, number> = {
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  GONE: HttpStatus.GONE,
  PRECONDITION_FAILED: HttpStatus.PRECONDITION_FAILED,
  CAPACITY_EXCEEDED: HttpStatus.CONFLICT,
  CREATE_LIMIT_EXCEEDED: HttpStatus.CONFLICT,
  HORIZON_EXCEEDED: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  CLIENT_ASSERTION_INVALID: HttpStatus.UNAUTHORIZED,
  CLIENT_ASSERTION_REPLAY: HttpStatus.UNAUTHORIZED,
  CONFIG_INVALID: HttpStatus.SERVICE_UNAVAILABLE,
  AUTH_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
};

@Catch(ActivityError)
export class ActivityExceptionFilter implements ExceptionFilter {
  public catch(exception: ActivityError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;
    void reply.status(status).send({
      error: { code: exception.code, message: exception.message },
    });
  }
}
