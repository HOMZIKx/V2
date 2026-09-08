import { createSignedCustomId, parseSignedCustomId } from './signed-custom-id.js';

const PREFIX = 'ctp';

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(value: string): string {
  const raw = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = raw + (raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4)));
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function createCharacterTimerPanelSelectCustomId(workspaceId: string, secret: string): string {
  const id = workspaceId.trim();
  if (!id) throw new Error('workspaceId is required');
  return createSignedCustomId('select', `${PREFIX}${base64Url(id)}`, secret);
}

export function parseCharacterTimerPanelSelectCustomId(
  raw: string,
  secret: string,
): { readonly workspaceId: string } {
  const parsed = parseSignedCustomId(raw, secret);
  if (parsed.action !== 'select' || !parsed.payload.startsWith(PREFIX)) {
    throw new Error('Not a character timer panel selector.');
  }
  const workspaceId = fromBase64Url(parsed.payload.slice(PREFIX.length)).trim();
  if (!workspaceId) throw new Error('Invalid character timer panel selector.');
  return { workspaceId };
}

export function isCharacterTimerPanelSelectPayload(payload: string): boolean {
  return payload.startsWith(PREFIX);
}
