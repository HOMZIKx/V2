import {
  createSignedCustomId,
  parseSignedCustomId,
  type ComponentAction,
} from './signed-custom-id.js';

export type CharacterTimerButtonOperation = 'gotowe' | 'przypomnij';

export type CharacterTimerButtonPayload = {
  readonly timerId: string;
  /** Optional workspace hint — omitted from customId when too long; looked up from state. */
  readonly workspaceId?: string;
};

const ACTION_BY_OP: Record<CharacterTimerButtonOperation, ComponentAction> = {
  gotowe: 'ct_gotowe',
  przypomnij: 'ct_later',
};

const OP_BY_ACTION: Partial<Record<ComponentAction, CharacterTimerButtonOperation>> = {
  ct_gotowe: 'gotowe',
  ct_later: 'przypomnij',
};

/** Compact payload: timerId only (unique in player-store). */
export function encodeCharacterTimerButtonPayload(payload: CharacterTimerButtonPayload): string {
  const timerId = payload.timerId.trim();
  if (!timerId || timerId.includes('|') || timerId.includes(':')) {
    throw new Error('timerId is required and must not contain "|" or ":".');
  }
  return Buffer.from(timerId, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function decodeCharacterTimerButtonPayload(encoded: string): CharacterTimerButtonPayload {
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const timerId = Buffer.from(padded + pad, 'base64').toString('utf8').trim();
  if (!timerId) {
    throw new Error('Invalid character timer button payload.');
  }
  return { timerId };
}

export function createCharacterTimerButtonCustomId(
  operation: CharacterTimerButtonOperation,
  payload: CharacterTimerButtonPayload,
  secret: string,
): string {
  return createSignedCustomId(
    ACTION_BY_OP[operation],
    encodeCharacterTimerButtonPayload(payload),
    secret,
  );
}

export function parseCharacterTimerButtonCustomId(
  raw: string,
  secret: string,
): { operation: CharacterTimerButtonOperation; payload: CharacterTimerButtonPayload } {
  const parsed = parseSignedCustomId(raw, secret);
  const operation = OP_BY_ACTION[parsed.action];
  if (!operation) {
    throw new Error('Not a character timer button custom id.');
  }
  return { operation, payload: decodeCharacterTimerButtonPayload(parsed.payload) };
}

export function isCharacterTimerButtonAction(action: ComponentAction): boolean {
  return action === 'ct_gotowe' || action === 'ct_later';
}
