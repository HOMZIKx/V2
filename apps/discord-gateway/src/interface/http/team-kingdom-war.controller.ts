import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { replaceTeamKingdomWarRecipients } from '../../application/notify/kingdom-war-team-recipients.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { DISCORD_CONFIG_TOKEN } from '../discord/discord.tokens.js';

const HEADER_NAME = 'x-notify-secret';

function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided || expected.length === 0) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

function parseBody(body: unknown): { workspaceId: string; recipients: string[] } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.workspaceId !== 'string' || !Array.isArray(record.recipients)) return null;
  return {
    workspaceId: record.workspaceId,
    recipients: record.recipients
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 40),
  };
}

@Controller('notify/team-war-recipients')
export class TeamKingdomWarController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
  ) {}

  @Post()
  public replace(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
    @Body() body: unknown,
  ):
    | { readonly ok: true; readonly count: number }
    | { readonly ok: false; readonly error: string } {
    if (!secretsMatch(notifySecret, this.config.DISCORD_NOTIFY_SHARED_SECRET)) {
      throw new UnauthorizedException({ ok: false, error: 'invalid_notify_secret' });
    }

    const parsed = parseBody(body);
    if (!parsed) {
      throw new BadRequestException({ ok: false, error: 'invalid_team_war_recipient_payload' });
    }

    const result = replaceTeamKingdomWarRecipients(parsed.workspaceId, parsed.recipients);
    if (!result.ok) {
      throw new BadRequestException({ ok: false, error: result.reason });
    }
    return { ok: true, count: result.count };
  }
}
