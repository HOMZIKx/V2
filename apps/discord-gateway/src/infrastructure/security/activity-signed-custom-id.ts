import { createHmac, timingSafeEqual } from 'node:crypto';

export const ACTIVITY_CUSTOM_ID_PREFIX = 'activity';
export const ACTIVITY_CUSTOM_ID_VERSION = 'v1';

export type ActivityCustomScope = 'panel' | 'event' | 'draft';

export type ActivityPanelAction = 'create' | 'lfg' | 'mine' | 'inbox';

export type ActivityEventAction =
  | 'rsvp'
  | 'participants'
  | 'contact'
  | 'more'
  | 'report'
  | 'preview'
  | 'publish'
  | 'regs_open'
  | 'regs_close'
  | 'cancel'
  | 'reschedule'
  | 'reconfirm'
  | 'resign'
  | 'edit'
  | 'takeover'
  | 'kick';

export type ActivityDraftAction =
  | 'preview'
  | 'publish'
  | 'discard'
  | 'edit'
  | 'section_basics'
  | 'section_schedule'
  | 'section_place'
  | 'section_limit'
  | 'section_extra';

export type ParsedActivityCustomId =
  | {
      scope: 'panel';
      opaqueId: string;
      action: ActivityPanelAction;
      signature: string;
    }
  | {
      scope: 'event';
      opaqueId: string;
      action: ActivityEventAction;
      statusOpaqueId?: string;
      signature: string;
    }
  | {
      scope: 'draft';
      opaqueId: string;
      action: ActivityDraftAction;
      signature: string;
    };

const PANEL_ACTIONS = new Set<ActivityPanelAction>(['create', 'lfg', 'mine', 'inbox']);
const EVENT_ACTIONS = new Set<ActivityEventAction>([
  'rsvp',
  'participants',
  'contact',
  'more',
  'report',
  'preview',
  'publish',
  'regs_open',
  'regs_close',
  'cancel',
  'reschedule',
  'reconfirm',
  'resign',
  'edit',
  'takeover',
  'kick',
]);
const DRAFT_ACTIONS = new Set<ActivityDraftAction>([
  'preview',
  'publish',
  'edit',
  'discard',
  'section_basics',
  'section_schedule',
  'section_place',
  'section_limit',
  'section_extra',
]);

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
    throw new Error(`Custom ID exceeds Discord limit (${customId.length} > 100).`);
  }
  return customId;
}

export function createPanelCustomId(
  opaquePanelId: string,
  action: ActivityPanelAction,
  secret: string,
): string {
  assertOpaque(opaquePanelId);
  if (!PANEL_ACTIONS.has(action)) {
    throw new Error(`Unknown panel action: ${action}`);
  }
  if (action === ('report' as ActivityPanelAction)) {
    throw new Error('Report is not a hub panel action.');
  }
  const body = `${ACTIVITY_CUSTOM_ID_PREFIX}:${ACTIVITY_CUSTOM_ID_VERSION}:panel:${opaquePanelId}:${action}`;
  return finalize(body, secret);
}

export function createEventCustomId(
  opaqueEventId: string,
  action: ActivityEventAction,
  secret: string,
  statusOpaqueId?: string,
): string {
  assertOpaque(opaqueEventId);
  if (!EVENT_ACTIONS.has(action)) {
    throw new Error(`Unknown event action: ${action}`);
  }
  if (action === 'rsvp') {
    if (statusOpaqueId === undefined) {
      throw new Error('RSVP custom id requires status opaque id.');
    }
    assertOpaque(statusOpaqueId);
    const body = `${ACTIVITY_CUSTOM_ID_PREFIX}:${ACTIVITY_CUSTOM_ID_VERSION}:event:${opaqueEventId}:rsvp:${statusOpaqueId}`;
    return finalize(body, secret);
  }
  const body = `${ACTIVITY_CUSTOM_ID_PREFIX}:${ACTIVITY_CUSTOM_ID_VERSION}:event:${opaqueEventId}:${action}`;
  return finalize(body, secret);
}

export function createDraftCustomId(
  opaqueDraftId: string,
  action: ActivityDraftAction,
  secret: string,
): string {
  assertOpaque(opaqueDraftId);
  if (!DRAFT_ACTIONS.has(action)) {
    throw new Error(`Unknown draft action: ${action}`);
  }
  const body = `${ACTIVITY_CUSTOM_ID_PREFIX}:${ACTIVITY_CUSTOM_ID_VERSION}:draft:${opaqueDraftId}:${action}`;
  return finalize(body, secret);
}

export function parseActivityCustomId(raw: string, secret: string): ParsedActivityCustomId {
  const parts = raw.split(':');
  if (parts.length < 6) {
    throw new Error('Invalid activity custom ID format.');
  }
  const signature = parts[parts.length - 1];
  if (signature === undefined || signature.length === 0) {
    throw new Error('Invalid activity custom ID signature.');
  }
  const body = parts.slice(0, -1).join(':');
  const expected = sign(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('Invalid activity custom ID signature.');
  }

  const [prefix, version, scope, opaqueId, action, maybeStatus] = parts;
  if (
    prefix !== ACTIVITY_CUSTOM_ID_PREFIX ||
    version !== ACTIVITY_CUSTOM_ID_VERSION ||
    opaqueId === undefined ||
    action === undefined
  ) {
    throw new Error('Unsupported activity custom ID version or scope.');
  }
  assertOpaque(opaqueId);

  if (scope === 'panel') {
    if (!PANEL_ACTIONS.has(action as ActivityPanelAction)) {
      throw new Error('Unknown panel action.');
    }
    return {
      scope: 'panel',
      opaqueId,
      action: action as ActivityPanelAction,
      signature,
    };
  }

  if (scope === 'draft') {
    if (!DRAFT_ACTIONS.has(action as ActivityDraftAction)) {
      throw new Error('Unknown draft action.');
    }
    return {
      scope: 'draft',
      opaqueId,
      action: action as ActivityDraftAction,
      signature,
    };
  }

  if (scope === 'event') {
    if (action === 'rsvp') {
      if (maybeStatus === undefined || maybeStatus === signature) {
        throw new Error('RSVP custom id missing status.');
      }
      assertOpaque(maybeStatus);
      return {
        scope: 'event',
        opaqueId,
        action: 'rsvp',
        statusOpaqueId: maybeStatus,
        signature,
      };
    }
    if (!EVENT_ACTIONS.has(action as ActivityEventAction)) {
      throw new Error('Unknown event action.');
    }
    return {
      scope: 'event',
      opaqueId,
      action: action as ActivityEventAction,
      signature,
    };
  }

  throw new Error('Unknown activity custom ID scope.');
}

export function isActivityCustomId(raw: string): boolean {
  return raw.startsWith(`${ACTIVITY_CUSTOM_ID_PREFIX}:${ACTIVITY_CUSTOM_ID_VERSION}:`);
}
