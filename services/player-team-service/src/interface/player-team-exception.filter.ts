import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { PlayerTeamError, type PlayerTeamErrorCode } from '../domain/errors.js';

const STATUS_BY_CODE: Record<PlayerTeamErrorCode, number> = {
  DEMO_ACCESS_DENIED: HttpStatus.FORBIDDEN,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  REVISION_CONFLICT: HttpStatus.CONFLICT,
};

@Catch(PlayerTeamError)
export class PlayerTeamExceptionFilter implements ExceptionFilter {
  public catch(exception: PlayerTeamError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;

    const payload: {
      error: {
        code: PlayerTeamErrorCode;
        message: string;
        actualRevision?: number | null;
      };
    } = {
      error: {
        code: exception.code,
        message: exception.message,
      },
    };

    if (exception.code === 'REVISION_CONFLICT') {
      payload.error.actualRevision = exception.actualRevision ?? null;
    }

    void reply.status(status).send(payload);
  }
}
