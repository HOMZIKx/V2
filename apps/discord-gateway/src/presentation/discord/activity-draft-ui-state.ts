/**
 * Signed draft form snapshot for Discord UI state (edit prefill).
 * Verified with the component signing secret; fail-closed on any mismatch.
 * Not a source of business truth — activity-service remains owner of drafts.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { whenKindFromDraftPayload, type WhenKind } from './activity-schedule-form.js';

export const DRAFT_UI_STATE_PREFIX = 'v2dui.v1.';

export type DraftFormUiState = {
  name: string;
  description: string;
  scheduleFromDisplay: string;
  scheduleToDisplay: string;
  whenKind: WhenKind;
  source: 'create' | 'lfg';
};

const WHEN_KINDS = new Set<WhenKind>([
  'exact',
  'range',
  'today',
  'tomorrow',
  'this_week',
  'weekend',
  'flexible',
]);

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function sign(body: string, secret: string): string {
  return base64Url(createHmac('sha256', secret).update(body).digest().subarray(0, 16));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function draftPayloadToFormUiState(payload: Record<string, unknown>): DraftFormUiState {
  const source = payload.source === 'lfg' || payload.lfg === true ? 'lfg' : 'create';
  return {
    name: asString(payload.name),
    description: asString(payload.description),
    scheduleFromDisplay: asString(payload.scheduleFromDisplay),
    scheduleToDisplay: asString(payload.scheduleToDisplay),
    whenKind: whenKindFromDraftPayload(payload),
    source,
  };
}

export function formUiStateToModalPayload(state: DraftFormUiState): Record<string, unknown> {
  return {
    name: state.name,
    description: state.description,
    scheduleFromDisplay: state.scheduleFromDisplay,
    scheduleToDisplay: state.scheduleToDisplay,
    whenKind: state.whenKind,
    source: state.source,
    lfg: state.source === 'lfg',
  };
}

export function signDraftFormUiState(state: DraftFormUiState, secret: string): string {
  const payload = base64Url(
    Buffer.from(
      JSON.stringify({
        name: state.name,
        description: state.description,
        scheduleFromDisplay: state.scheduleFromDisplay,
        scheduleToDisplay: state.scheduleToDisplay,
        whenKind: state.whenKind,
        source: state.source,
      }),
      'utf8',
    ),
  );
  return `${DRAFT_UI_STATE_PREFIX}${sign(payload, secret)}.${payload}`;
}

export function parseDraftFormUiState(token: string, secret: string): DraftFormUiState | null {
  if (!token.startsWith(DRAFT_UI_STATE_PREFIX)) {
    return null;
  }
  const rest = token.slice(DRAFT_UI_STATE_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot <= 0) {
    return null;
  }
  const signature = rest.slice(0, dot);
  const payload = rest.slice(dot + 1);
  if (signature.length === 0 || payload.length === 0 || !/^[A-Za-z0-9_-]+$/.test(payload)) {
    return null;
  }
  const expected = sign(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const whenKind = record.whenKind;
  const source = record.source;
  if (typeof whenKind !== 'string' || !WHEN_KINDS.has(whenKind as WhenKind)) {
    return null;
  }
  if (source !== 'create' && source !== 'lfg') {
    return null;
  }
  return {
    name: asString(record.name).slice(0, 100),
    description: asString(record.description).slice(0, 1000),
    scheduleFromDisplay: asString(record.scheduleFromDisplay).slice(0, 32),
    scheduleToDisplay: asString(record.scheduleToDisplay).slice(0, 32),
    whenKind: whenKind as WhenKind,
    source,
  };
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null;
}

function pushString(value: unknown, out: string[]): void {
  if (typeof value === 'string' && value.length > 0) {
    out.push(value);
  }
}

/**
 * Walk Discord.js builders, received message components, and JSON payloads
 * without calling toJSON() on uninitialized builders.
 */
export function collectComponentStrings(
  node: unknown,
  out: string[] = [],
  seen?: Set<unknown>,
): string[] {
  const visited = seen ?? new Set<unknown>();
  if (node === null || node === undefined) {
    return out;
  }
  if (typeof node === 'string') {
    pushString(node, out);
    return out;
  }
  if (typeof node !== 'object') {
    return out;
  }
  if (visited.has(node)) {
    return out;
  }
  visited.add(node);
  if (Array.isArray(node)) {
    for (const child of node) {
      collectComponentStrings(child, out, visited);
    }
    return out;
  }
  if (!isRecord(node)) {
    return out;
  }

  pushString(node.content, out);
  pushString(node.customId, out);
  pushString(node.custom_id, out);

  const data = node.data;
  if (isRecord(data)) {
    pushString(data.content, out);
    pushString(data.custom_id, out);
    pushString(data.customId, out);
    collectComponentStrings(data.components, out, visited);
  }

  collectComponentStrings(node.components, out, visited);
  collectComponentStrings(node.accessory, out, visited);

  return out;
}

const TOKEN_PATTERN = /v2dui\.v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

export function extractDraftFormUiState(
  source: { components?: unknown } | null | undefined,
  secret: string,
): DraftFormUiState | null {
  if (source === null || source === undefined) {
    return null;
  }
  const strings = collectComponentStrings(source.components);
  for (const text of strings) {
    const match = TOKEN_PATTERN.exec(text);
    if (match === null) {
      continue;
    }
    const parsed = parseDraftFormUiState(match[0], secret);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}
