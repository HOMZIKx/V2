import {
  createSignedCustomId,
  parseSignedCustomId,
  type ComponentAction,
} from './signed-custom-id.js';

export type TimerButtonOperation = 'zbite' | 'odloz';

export type TimerButtonPayload = {
  readonly mapKey: string;
  readonly channel: number;
  readonly timerKey: string;
};

const ACTION_BY_OP: Record<TimerButtonOperation, ComponentAction> = {
  zbite: 'timer_zbite',
  odloz: 'timer_odloz',
};

const OP_BY_ACTION: Partial<Record<ComponentAction, TimerButtonOperation>> = {
  timer_zbite: 'zbite',
  timer_odloz: 'odloz',
};

/** Compact payload without ":" — base64url(map|ch|timerKey). */
export function encodeTimerButtonPayload(payload: TimerButtonPayload): string {
  const mapKey = payload.mapKey.trim();
  const timerKey = payload.timerKey.trim();
  if (!mapKey || !timerKey) {
    throw new Error('mapKey and timerKey are required.');
  }
  if (!Number.isInteger(payload.channel) || payload.channel < 1 || payload.channel > 99) {
    throw new Error('channel must be an integer 1–99.');
  }
  if (mapKey.includes('|') || timerKey.includes('|')) {
    throw new Error('mapKey/timerKey must not contain "|".');
  }
  const raw = `${mapKey}|${payload.channel}|${timerKey}`;
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function decodeTimerButtonPayload(encoded: string): TimerButtonPayload {
  const padded = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const raw = Buffer.from(padded + pad, 'base64').toString('utf8');
  const parts = raw.split('|');
  if (parts.length !== 3) {
    throw new Error('Invalid timer button payload.');
  }
  const [mapKey, channelRaw, timerKey] = parts;
  if (!mapKey || !channelRaw || !timerKey) {
    throw new Error('Invalid timer button payload.');
  }
  const channel = Number(channelRaw);
  if (!Number.isInteger(channel) || channel < 1 || channel > 99) {
    throw new Error('Invalid timer button channel.');
  }
  return { mapKey, channel, timerKey };
}

export function createTimerButtonCustomId(
  operation: TimerButtonOperation,
  payload: TimerButtonPayload,
  secret: string,
): string {
  return createSignedCustomId(ACTION_BY_OP[operation], encodeTimerButtonPayload(payload), secret);
}

export function parseTimerButtonCustomId(
  raw: string,
  secret: string,
): { operation: TimerButtonOperation; payload: TimerButtonPayload } {
  const parsed = parseSignedCustomId(raw, secret);
  const operation = OP_BY_ACTION[parsed.action];
  if (!operation) {
    throw new Error('Not a timer button custom id.');
  }
  return { operation, payload: decodeTimerButtonPayload(parsed.payload) };
}

export function isTimerButtonAction(action: ComponentAction): boolean {
  return action === 'timer_zbite' || action === 'timer_odloz';
}

export function isWarClaimAction(action: ComponentAction): boolean {
  return action === 'war_claim';
}
