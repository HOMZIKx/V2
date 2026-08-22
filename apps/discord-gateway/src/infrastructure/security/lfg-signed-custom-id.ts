import { createHmac, timingSafeEqual } from 'node:crypto';

export const LFG_CUSTOM_ID_PREFIX = 'lfg';
export const LFG_CUSTOM_ID_VERSION = 'v1';

export type LfgAction =
  | 'dungeon'
  | 'character'
  | 'role'
  | 'time'
  | 'search'
  | 'show_more'
  | 'join'
  | 'view'
  | 'watch'
  | 'suppress'
  | 'create'
  | 'confirm_create'
  | 'my_searches'
  | 'watch_pause'
  | 'watch_resume'
  | 'watch_cancel'
  | 'back'
  | 'quick_add';

const LFG_ACTIONS = new Set<LfgAction>([
  'dungeon',
  'character',
  'role',
  'time',
  'search',
  'show_more',
  'join',
  'view',
  'watch',
  'suppress',
  'create',
  'confirm_create',
  'my_searches',
  'watch_pause',
  'watch_resume',
  'watch_cancel',
  'back',
  'quick_add',
]);

export type ParsedLfgCustomId = {
  readonly scope: 'lfg';
  readonly opaquePanelId: string;
  readonly action: LfgAction;
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
    throw new Error(`LFG custom ID exceeds Discord limit (${customId.length} > 100).`);
  }
  return customId;
}

export function createLfgCustomId(
  opaquePanelId: string,
  action: LfgAction,
  secret: string,
  param?: string,
): string {
  assertOpaque(opaquePanelId);
  if (!LFG_ACTIONS.has(action)) {
    throw new Error(`Unknown LFG action: ${action}`);
  }
  const body =
    param !== undefined && param.length > 0
      ? `${LFG_CUSTOM_ID_PREFIX}:${LFG_CUSTOM_ID_VERSION}:${opaquePanelId}:${action}:${param}`
      : `${LFG_CUSTOM_ID_PREFIX}:${LFG_CUSTOM_ID_VERSION}:${opaquePanelId}:${action}`;
  return finalize(body, secret);
}

export function parseLfgCustomId(raw: string, secret: string): ParsedLfgCustomId {
  const parts = raw.split(':');
  if (parts.length < 5) {
    throw new Error('Invalid LFG custom ID format.');
  }
  const signature = parts[parts.length - 1];
  if (signature === undefined || signature.length === 0) {
    throw new Error('Invalid LFG custom ID signature.');
  }
  const body = parts.slice(0, -1).join(':');
  const expected = sign(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('Invalid LFG custom ID signature.');
  }

  const [prefix, version, opaquePanelId, action, param] = parts;
  if (
    prefix !== LFG_CUSTOM_ID_PREFIX ||
    version !== LFG_CUSTOM_ID_VERSION ||
    opaquePanelId === undefined ||
    action === undefined
  ) {
    throw new Error('Unsupported LFG custom ID version.');
  }
  assertOpaque(opaquePanelId);
  if (!LFG_ACTIONS.has(action as LfgAction)) {
    throw new Error('Unknown LFG action.');
  }

  return {
    scope: 'lfg',
    opaquePanelId,
    action: action as LfgAction,
    ...(param !== undefined && param !== signature ? { param } : {}),
    signature,
  };
}

export function isLfgCustomId(raw: string): boolean {
  return raw.startsWith(`${LFG_CUSTOM_ID_PREFIX}:${LFG_CUSTOM_ID_VERSION}:`);
}
