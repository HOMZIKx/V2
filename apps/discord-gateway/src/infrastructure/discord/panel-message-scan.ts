import {
  ACTIVITY_CUSTOM_ID_PREFIX,
  ACTIVITY_CUSTOM_ID_VERSION,
} from '../security/activity-signed-custom-id.js';

/** Bounded scan window for panel adopt/reconcile (P4-D6). */
export const PANEL_MESSAGE_SCAN_DEFAULT_LIMIT = 100;

export type ScannedChannelMessage = {
  readonly messageId: string;
  readonly channelId: string;
  readonly authorId: string;
  readonly components: unknown;
};

/**
 * True when a signed activity custom_id belongs to the given hub panel opaque id.
 */
export function customIdContainsPanelOpaqueId(customId: string, opaquePanelId: string): boolean {
  const marker = `${ACTIVITY_CUSTOM_ID_PREFIX}:${ACTIVITY_CUSTOM_ID_VERSION}:panel:${opaquePanelId}:`;
  return customId.includes(marker);
}

/**
 * Recursively collect custom_id values from Discord message components (V1 rows or V2 containers).
 */
export function collectCustomIdsFromComponents(components: unknown): string[] {
  const ids: string[] = [];
  walkComponents(components, ids);
  return ids;
}

function walkComponents(node: unknown, ids: string[]): void {
  if (node === null || node === undefined) {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      walkComponents(entry, ids);
    }
    return;
  }
  if (typeof node !== 'object') {
    return;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.custom_id === 'string') {
    ids.push(record.custom_id);
  }
  if (typeof record.customId === 'string') {
    ids.push(record.customId);
  }

  for (const key of ['components', 'data', 'accessory', 'children', 'items', 'sections', 'rows']) {
    if (key in record) {
      walkComponents(record[key], ids);
    }
  }
}

export function messageMatchesPanelOpaqueId(
  message: Pick<ScannedChannelMessage, 'components'>,
  opaquePanelId: string,
): boolean {
  return collectCustomIdsFromComponents(message.components).some((customId) =>
    customIdContainsPanelOpaqueId(customId, opaquePanelId),
  );
}

/** Discord snowflakes sort chronologically; highest id = newest message. */
export function pickCanonicalPanelMessageId(messageIds: readonly string[]): string {
  if (messageIds.length === 0) {
    throw new Error('Cannot pick canonical message from empty list.');
  }
  return [...messageIds].sort((left, right) => {
    const l = BigInt(left);
    const r = BigInt(right);
    if (l === r) {
      return 0;
    }
    return l > r ? -1 : 1;
  })[0] as string;
}

export function filterBotPanelMatches(
  messages: readonly ScannedChannelMessage[],
  opaquePanelId: string,
  botUserId: string,
): ScannedChannelMessage[] {
  return messages.filter(
    (message) =>
      message.authorId === botUserId && messageMatchesPanelOpaqueId(message, opaquePanelId),
  );
}
