import { HttpException, HttpStatus } from '@nestjs/common';

export type ProjectionChannelValidation = {
  ok: boolean;
  code:
    | 'CHANNEL_MISSING'
    | 'CHANNEL_WRONG_GUILD'
    | 'CHANNEL_UNSUPPORTED'
    | 'BOT_PERMISSION_MISSING'
    | 'CHANNEL_OK';
  detail?: string;
};

export type ProjectionChannelGateway = {
  validateActivityPublishChannel(
    guildId: string,
    channelId: string,
  ): Promise<ProjectionChannelValidation>;
};

const SAFE_DETAILS: Record<ProjectionChannelValidation['code'], string> = {
  CHANNEL_OK: 'Channel is allowed.',
  CHANNEL_MISSING: 'Channel was not found.',
  CHANNEL_WRONG_GUILD: 'Channel is outside the allowed guild.',
  CHANNEL_UNSUPPORTED: 'Channel type is not allowed.',
  BOT_PERMISSION_MISSING: 'Bot is missing required channel permissions.',
};

export function resolveAllowedProjectionGuild(options: {
  readonly configuredGuildId: string;
  readonly payloadGuildId?: string;
}): string {
  if (
    options.payloadGuildId !== undefined &&
    options.payloadGuildId !== options.configuredGuildId
  ) {
    throw new HttpException(
      { status: 'rejected', detail: 'Guild is outside the allowed P4 scope.' },
      HttpStatus.FORBIDDEN,
    );
  }
  return options.configuredGuildId;
}

export async function assertProjectionChannelAllowed(options: {
  readonly gateway: ProjectionChannelGateway;
  readonly allowedGuildId: string;
  readonly channelId: string;
}): Promise<void> {
  const validated = await options.gateway.validateActivityPublishChannel(
    options.allowedGuildId,
    options.channelId,
  );
  if (validated.ok) {
    return;
  }
  const status =
    validated.code === 'BOT_PERMISSION_MISSING' || validated.code === 'CHANNEL_WRONG_GUILD'
      ? HttpStatus.FORBIDDEN
      : HttpStatus.BAD_REQUEST;
  throw new HttpException({ status: 'rejected', detail: SAFE_DETAILS[validated.code] }, status);
}
