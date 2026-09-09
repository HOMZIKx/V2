import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { PlayerTeamError } from '../../domain/errors.js';
import { PLAYER_TEAM_ENV } from '../../interface/player-team.tokens.js';
import { type PlayerTeamEnv } from '../config/player-team-env.js';

export type AiObservationType = 'equipment' | 'economy';
export type AiFeedbackStatus = 'accepted' | 'corrected' | 'rejected';

export type AiObservationInput = {
  readonly analysisType: AiObservationType;
  readonly workspaceId?: string | null;
  readonly characterId?: string | null;
  readonly model: string;
  readonly promptVersion: string;
  readonly parserVersion: string;
  readonly confidence?: number | null;
  readonly image: {
    readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    readonly sizeBytes: number;
    readonly sha256: string;
  };
  readonly aiOutput: unknown;
};

export type AiObservationFeedbackInput = {
  readonly status: AiFeedbackStatus;
  readonly finalOutput?: unknown;
  readonly changedFields?: readonly string[];
};

function actorHash(discordId: string): string {
  return createHash('sha256').update(`destiled-ai-observation:v1:${discordId}`, 'utf8').digest('hex');
}

@Injectable()
export class AiObservationRepository implements OnModuleInit {
  private pool: Pool | null = null;

  public constructor(@Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv) {}

  public onModuleInit(): void {
    this.pool = new Pool({ connectionString: this.env.PLAYER_TEAM_DATABASE_URL, max: 4 });
  }

  private get db(): Pool {
    if (this.pool === null) throw new Error('AI observation pool not initialized');
    return this.pool;
  }

  public async create(
    viewerDiscordId: string,
    input: AiObservationInput,
  ): Promise<{ readonly id: string; readonly createdAtIso: string }> {
    const id = randomUUID();
    const result = await this.db.query<{ id: string; created_at: Date | string }>(
      `INSERT INTO player_team_ai_observations
         (id, analysis_type, actor_hash, workspace_id, character_id, model, prompt_version,
          parser_version, confidence, image_mime_type, image_byte_size, image_sha256, ai_output)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       RETURNING id, created_at`,
      [
        id,
        input.analysisType,
        actorHash(viewerDiscordId),
        input.workspaceId ?? null,
        input.characterId ?? null,
        input.model,
        input.promptVersion,
        input.parserVersion,
        input.confidence ?? null,
        input.image.mimeType,
        input.image.sizeBytes,
        input.image.sha256,
        JSON.stringify(input.aiOutput),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('AI observation insert returned no row');
    return { id: row.id, createdAtIso: new Date(row.created_at).toISOString() };
  }

  public async addFeedback(
    viewerDiscordId: string,
    observationId: string,
    input: AiObservationFeedbackInput,
  ): Promise<{ readonly id: string; readonly status: AiFeedbackStatus; readonly feedbackAtIso: string }> {
    const result = await this.db.query<{ id: string; feedback_status: AiFeedbackStatus; feedback_at: Date | string }>(
      `UPDATE player_team_ai_observations
       SET feedback_status = $3,
           final_output = $4::jsonb,
           changed_fields = $5::jsonb,
           feedback_at = NOW()
       WHERE id = $1 AND actor_hash = $2
       RETURNING id, feedback_status, feedback_at`,
      [
        observationId,
        actorHash(viewerDiscordId),
        input.status,
        input.finalOutput === undefined ? null : JSON.stringify(input.finalOutput),
        JSON.stringify(input.changedFields ?? []),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new PlayerTeamError('NOT_FOUND', 'AI observation not found');
    return { id: row.id, status: row.feedback_status, feedbackAtIso: new Date(row.feedback_at).toISOString() };
  }
}
