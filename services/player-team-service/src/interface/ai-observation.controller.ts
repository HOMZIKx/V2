import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';

import { type PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import {
  AiObservationRepository,
  type AiObservationFeedbackInput,
  type AiObservationInput,
} from '../infrastructure/db/ai-observation.repository.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';

type RequestHeaders = Record<string, string | string[] | undefined>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const jsonPayloadSchema = z.unknown().refine((value) => value !== undefined, 'JSON payload is required');

const createObservationSchema = z.object({
  analysisType: z.enum(['equipment', 'economy']),
  workspaceId: z.string().trim().min(1).max(160).nullable().optional(),
  characterId: z.string().trim().min(1).max(160).nullable().optional(),
  model: z.string().trim().min(1).max(160),
  promptVersion: z.string().trim().min(1).max(120),
  parserVersion: z.string().trim().min(1).max(120),
  confidence: z.number().min(0).max(1).nullable().optional(),
  image: z.object({
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
    sha256: sha256Schema,
  }),
  aiOutput: jsonPayloadSchema,
});

const feedbackSchema = z.object({
  status: z.enum(['accepted', 'corrected', 'rejected']),
  finalOutput: z.unknown().optional(),
  changedFields: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
});

function assertJsonBudget(value: unknown, label: string): void {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new BadRequestException(`${label} must be JSON serializable`);
  }
  if (encoded.length > 128_000) {
    throw new BadRequestException(`${label} is too large`);
  }
}

@Controller('player-team/v1/ai-observations')
@UseFilters(PlayerTeamExceptionFilter)
export class AiObservationController {
  public constructor(
    @Inject(AiObservationRepository) private readonly observations: AiObservationRepository,
    @Inject(PLAYER_TEAM_STATE_USE_CASES) private readonly state: PlayerTeamStateUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private viewerId(headers: RequestHeaders): Promise<string> {
    return resolvePlayerTeamRequestDiscordId({
      headers,
      env: this.env,
      assertDemoAccess: (value) => this.state.assertDemoAccess(value),
    });
  }

  @Post()
  @HttpCode(201)
  public async create(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    const parsed = createObservationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(`invalid AI observation: ${parsed.error.message}`);
    }
    assertJsonBudget(parsed.data.aiOutput, 'aiOutput');
    return this.observations.create(
      await this.viewerId(headers),
      parsed.data as AiObservationInput,
    );
  }

  @Patch(':observationId/feedback')
  public async feedback(
    @Headers() headers: RequestHeaders,
    @Param('observationId') observationId: string,
    @Body() body: unknown,
  ) {
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(observationId)) {
      throw new BadRequestException(
        parsed.success ? 'invalid AI observation id' : `invalid AI feedback: ${parsed.error.message}`,
      );
    }
    if (parsed.data.finalOutput !== undefined) {
      assertJsonBudget(parsed.data.finalOutput, 'finalOutput');
    }
    return this.observations.addFeedback(
      await this.viewerId(headers),
      observationId,
      parsed.data as AiObservationFeedbackInput,
    );
  }
}
