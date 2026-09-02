import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createLogger, operationalCategoryFromCode } from '@v2/observability';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ActivityError, type ActivityErrorCode } from '../domain/errors.js';

const logger = createLogger('activity-service');

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
  CONFIGURATION_INVALID: HttpStatus.SERVICE_UNAVAILABLE,
  AUTH_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
  DEPENDENCY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  AUTHORIZATION_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  DISCORD_GATEWAY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  DISCORD_METADATA_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

function correlationFrom(host: ArgumentsHost): string | undefined {
  const request = host.switchToHttp().getRequest<FastifyRequest>();
  const value = request.headers['x-correlation-id'];
  return typeof value === 'string' ? value : undefined;
}

@Catch(ActivityError)
export class ActivityExceptionFilter implements ExceptionFilter {
  public catch(exception: ActivityError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;
    const category = operationalCategoryFromCode(exception.code);
    logger.warn('Activity request failed.', {
      event: 'request_failed',
      category,
      code: exception.code,
      correlationId: correlationFrom(host),
    });
    void reply.status(status).send({
      error: { code: exception.code, message: exception.message, category },
    });
  }
}

@Catch()
export class UnhandledActivityExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof ActivityError) {
      new ActivityExceptionFilter().catch(exception, host);
      return;
    }
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      void reply
        .status(status)
        .send(
          typeof response === 'object' && response !== null
            ? response
            : { error: { code: 'INTERNAL_ERROR', message: String(response) } },
        );
      return;
    }
    logger.error('Unhandled activity error.', {
      event: 'unhandled_error',
      category: 'INTERNAL',
      error: exception instanceof Error ? exception.message : String(exception),
      correlationId: correlationFrom(host),
    });
    void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
        category: 'INTERNAL',
      },
    });
  }
}
