import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CUSTOM_ID_VERSION = 'v1';
export const PANEL_VERSION = '1';

export type ComponentAction =
  'select' | 'refresh' | 'delete_ask' | 'delete_confirm' | 'delete_cancel' | 'modal';

export type SignedCustomId = {
  version: string;
  action: ComponentAction;
  payload: string;
  signature: string;
};

const ACTION_SET = new Set<ComponentAction>([
  'select',
  'refresh',
  'delete_ask',
  'delete_confirm',
  'delete_cancel',
  'modal',
]);

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function sign(body: string, secret: string): string {
  return base64Url(createHmac('sha256', secret).update(body).digest().subarray(0, 16));
}

export function generateSigningSecret(bytes = 32): string {
  return base64Url(randomBytes(bytes));
}

export function createSignedCustomId(
  action: ComponentAction,
  payload: string,
  secret: string,
): string {
  if (payload.includes(':')) {
    throw new Error('Custom ID payload must not contain ":" separators.');
  }

  const body = `${CUSTOM_ID_VERSION}:${action}:${payload}`;
  const customId = `${body}:${sign(body, secret)}`;
  if (customId.length > 100) {
    throw new Error(`Custom ID exceeds Discord limit (${customId.length} > 100).`);
  }
  return customId;
}

export function parseSignedCustomId(raw: string, secret: string): SignedCustomId {
  const parts = raw.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid custom ID format.');
  }

  const version = parts[0];
  const actionRaw = parts[1];
  const payload = parts[2];
  const signature = parts[3];
  if (
    version === undefined ||
    actionRaw === undefined ||
    payload === undefined ||
    signature === undefined
  ) {
    throw new Error('Invalid custom ID format.');
  }
  if (version !== CUSTOM_ID_VERSION) {
    throw new Error('Unsupported custom ID version.');
  }
  if (!ACTION_SET.has(actionRaw as ComponentAction)) {
    throw new Error('Unknown custom ID action.');
  }

  const body = `${version}:${actionRaw}:${payload}`;
  const expected = sign(body, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error('Invalid custom ID signature.');
  }

  return {
    version,
    action: actionRaw as ComponentAction,
    payload,
    signature,
  };
}

export function panelPayload(): string {
  return `p${PANEL_VERSION}`;
}
