import { createHmac, timingSafeEqual } from 'node:crypto';

export const LFG_DM_CUSTOM_ID_PREFIX = 'lfgdm';
export const LFG_DM_CUSTOM_ID_VERSION = 'v1';

export type LfgDmAction = 'join' | 'view' | 'suppress' | 'mute';

const LFG_DM_ACTIONS = new Set<LfgDmAction>(['join', 'view', 'suppress', 'mute']);

export type ParsedLfgDmCustomId = {
  readonly scope: 'lfgdm';
  readonly activityOpaqueId: string;
  readonly action: LfgDmAction;
  readonly param?: string;
  readonly signature: string;
};

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function sign(body: string, secret: string): string {
  return base64Url(createHmac('sha256', secret).update(body).digest().subarray(0, 16));
}

function assertOpaque(opaqueId: string): void {
  if (!/^[a-f0-9]{12}$/.test(opaqueId)) {
    throw new Error('Opaque id must be 12 lowercase hex characters.');
  }
}

function finalize(body: string, secret: string): string {
  const customId = `${body}:${sign(body, secret)}`;
  if (customId.length > 100) {
    throw new Error(`LFG DM custom ID exceeds Discord limit (${customId.length} > 100).`);
  }
  return customId;
}

export function createLfgDmCustomId(
  activityOpaqueId: string,
  action: LfgDmAction,
  secret: string,
  param?: string,
): string {
  assertOpaque(activityOpaqueId);
  if (!LFG_DM_ACTIONS.has(action)) {
    throw new Error(`Unknown LFG DM action: ${action}`);
  }
  const body =
    param !== undefined && param.length > 0
      ? `${LFG_DM_CUSTOM_ID_PREFIX}:${LFG_DM_CUSTOM_ID_VERSION}:${activityOpaqueId}:${action}:${param}`
      : `${LFG_DM_CUSTOM_ID_PREFIX}:${LFG_DM_CUSTOM_ID_VERSION}:${activityOpaqueId}:${action}`;
  return finalize(body, secret);
}

export function parseLfgDmCustomId(raw: string, secret: string): ParsedLfgDmCustomId {
  const parts = raw.split(':');
  if (parts.length < 5) {
    throw new Error('Invalid LFG DM custom ID format.');
  }
  const signature = parts[parts.length - 1];
  if (signature === undefined || signature.length === 0) {
    throw new Error('Invalid LFG DM custom ID signature.');
  }
  const body = parts.slice(0, -1).join(':');
  const expected = sign(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('Invalid LFG DM custom ID signature.');
  }

  const prefix = parts[0];
  const version = parts[1];
  const activityOpaqueId = parts[2];
  const action = parts[3];
  const param = parts.length > 5 ? parts.slice(4, -1).join(':') : undefined;

  if (
    prefix !== LFG_DM_CUSTOM_ID_PREFIX ||
    version !== LFG_DM_CUSTOM_ID_VERSION ||
    activityOpaqueId === undefined ||
    action === undefined
  ) {
    throw new Error('Unsupported LFG DM custom ID version.');
  }
  assertOpaque(activityOpaqueId);
  if (!LFG_DM_ACTIONS.has(action as LfgDmAction)) {
    throw new Error('Unknown LFG DM action.');
  }

  return {
    scope: 'lfgdm',
    activityOpaqueId,
    action: action as LfgDmAction,
    ...(param !== undefined && param.length > 0 ? { param } : {}),
    signature,
  };
}

export function isLfgDmCustomId(raw: string): boolean {
  return raw.startsWith(`${LFG_DM_CUSTOM_ID_PREFIX}:${LFG_DM_CUSTOM_ID_VERSION}:`);
}
