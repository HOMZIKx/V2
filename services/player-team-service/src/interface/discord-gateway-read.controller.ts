import { Controller, Get, Headers, Inject, Param, UseFilters } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { PlayerTeamError } from '../domain/errors.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';

type RequestHeaders = Record<string, string | string[] | undefined>;

const DISCORD_ID_RE = /^\d{17,20}$/;
const GATEWAY_SECRET_HEADER = 'x-discord-gateway-secret';
const DISCORD_USER_HEADER = 'x-discord-user-id';

function firstHeader(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function secretsMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(provided, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Read-only Discord gateway access to a member-authorized workspace snapshot.
 * This path exists for background jobs that cannot and must not impersonate a
 * browser session. The service secret proves the caller is the Discord gateway;
 * getWorkspaceSnapshot still verifies that the supplied Discord user belongs to
 * the requested workspace before any state is returned.
 */
@Controller('player-team/v1/internal/discord')
@UseFilters(PlayerTeamExceptionFilter)
export class DiscordGatewayPlayerTeamReadController {
  public constructor(
    @Inject(PLAYER_TEAM_STATE_USE_CASES) private readonly useCases: PlayerTeamStateUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private authorize(headers: RequestHeaders): string {
    const expected = this.env.PLAYER_TEAM_DISCORD_GATEWAY_SHARED_SECRET?.trim();
    const provided = firstHeader(headers, GATEWAY_SECRET_HEADER)?.trim();
    if (!expected || !provided || !secretsMatch(expected, provided)) {
      throw new PlayerTeamError('UNAUTHORIZED', 'invalid Discord gateway credentials');
    }

    const discordUserId = firstHeader(headers, DISCORD_USER_HEADER)?.trim();
    if (!discordUserId || !DISCORD_ID_RE.test(discordUserId)) {
      throw new PlayerTeamError('UNAUTHORIZED', 'invalid Discord gateway user identity');
    }
    return discordUserId;
  }

  @Get('workspaces/:workspaceId/state')
  public async getWorkspaceState(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
  ): Promise<{
    state: Record<string, unknown>;
    viewerAppId: string | null;
    revision: number;
    updatedAtIso: string;
  }> {
    const discordUserId = this.authorize(headers);
    const workspace = await this.useCases.getWorkspaceSnapshot(discordUserId, workspaceId);
    const viewerSnapshot = await this.useCases.getViewerSnapshot(discordUserId);
    const viewer = asRecord(viewerSnapshot?.state.viewer);
    const viewerAppId = typeof viewer?.id === 'string' && viewer.id.trim() ? viewer.id.trim() : null;

    return {
      state: workspace.state,
      viewerAppId,
      revision: workspace.revision,
      updatedAtIso: workspace.updatedAtIso,
    };
  }
}
