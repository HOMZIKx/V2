import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';

import { type PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import {
  TeamEconomyManagementRepository,
  type EconomyLeftoverStatus,
} from '../infrastructure/db/team-economy-management.repository.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';

type RequestHeaders = Record<string, string | string[] | undefined>;

const leftoverStatus = z.enum(['stored', 'sold', 'distributed', 'consumed', 'moved']);
const updateLeftoverSchema = z.object({ status: leftoverStatus });
const mergeItemsSchema = z.object({
  targetItemId: z.string().min(1),
  duplicateItemId: z.string().min(1),
});
const itemImageSchema = z.object({
  imageDataUrl: z
    .string()
    .min(20)
    .max(80_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
});

function roleFor(state: Record<string, unknown>, viewerId: string): 'owner' | 'member' | null {
  const members = Array.isArray(state.members) ? state.members : [];
  for (const raw of members) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const member = raw as Record<string, unknown>;
    if (member.discordAccountId !== viewerId) continue;
    return member.role === 'owner' ? 'owner' : member.role === 'member' ? 'member' : null;
  }
  return null;
}

@Controller('player-team/v1/economy/workspaces/:workspaceId/management')
@UseFilters(PlayerTeamExceptionFilter)
export class TeamEconomyManagementController {
  public constructor(
    private readonly management: TeamEconomyManagementRepository,
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

  private async assertMember(headers: RequestHeaders, workspaceId: string): Promise<string> {
    const viewerId = await this.viewerId(headers);
    await this.state.getWorkspaceSnapshot(viewerId, workspaceId);
    return viewerId;
  }

  private async assertOwner(headers: RequestHeaders, workspaceId: string): Promise<string> {
    const viewerId = await this.viewerId(headers);
    const workspace = await this.state.getWorkspaceSnapshot(viewerId, workspaceId);
    if (roleFor(workspace.state, viewerId) !== 'owner') {
      throw new ForbiddenException('only workspace owner can manage shared economy catalogue');
    }
    return viewerId;
  }

  @Get('prices')
  public async prices(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Query('itemId') itemId?: string,
    @Query('limit') rawLimit?: string,
  ) {
    await this.assertMember(headers, workspaceId);
    const parsed = Number(rawLimit ?? 100);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(300, Math.floor(parsed))) : 100;
    return this.management.listPrices({ workspaceId, itemId: itemId?.trim() || undefined, limit });
  }

  @Get('leftovers')
  public async leftovers(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Query('status') rawStatus?: string,
  ) {
    await this.assertMember(headers, workspaceId);
    let status: EconomyLeftoverStatus | undefined;
    if (rawStatus) {
      const parsed = leftoverStatus.safeParse(rawStatus);
      if (!parsed.success) throw new BadRequestException('invalid leftover status');
      status = parsed.data;
    }
    return this.management.listLeftovers({ workspaceId, status });
  }

  @Patch('leftovers/:dropItemId')
  public async updateLeftover(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Param('dropItemId') dropItemId: string,
    @Body() body: unknown,
  ) {
    const viewerId = await this.assertOwner(headers, workspaceId);
    const parsed = updateLeftoverSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid leftover status');
    return this.management.updateLeftover({
      workspaceId,
      dropItemId,
      status: parsed.data.status,
      updatedBy: viewerId,
    });
  }

  @Patch('items/:itemId/image')
  public async updateItemImage(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    await this.assertOwner(headers, workspaceId);
    const parsed = itemImageSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid or too large item image');
    return this.management.updateItemImage({ itemId, imageDataUrl: parsed.data.imageDataUrl });
  }

  @Post('merge-items')
  public async mergeItems(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ) {
    const viewerId = await this.assertOwner(headers, workspaceId);
    const parsed = mergeItemsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid merge request');
    return this.management.mergeItems({ ...parsed.data, updatedBy: viewerId });
  }
}
