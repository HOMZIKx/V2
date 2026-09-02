import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { isPlayerWorkspaceError } from '../domain/errors.js';

@Catch()
export class PlayerWorkspaceExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (isPlayerWorkspaceError(exception)) {
      const status = mapStatus(exception.code);
      void reply.status(status).send({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details !== undefined ? { details: exception.details } : {}),
        },
      });
      return;
    }

    const message = exception instanceof Error ? exception.message : 'Internal server error';
    void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
}

function mapStatus(code: string): number {
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'CLIENT_ASSERTION_INVALID':
    case 'CLIENT_ASSERTION_REPLAY':
      return HttpStatus.UNAUTHORIZED;
    case 'FORBIDDEN':
      return HttpStatus.FORBIDDEN;
    case 'NOT_FOUND':
      return HttpStatus.NOT_FOUND;
    case 'VALIDATION_FAILED':
      return HttpStatus.BAD_REQUEST;
    case 'CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
      return HttpStatus.CONFLICT;
    case 'CONFIG_INVALID':
    case 'DEPENDENCY_UNAVAILABLE':
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
