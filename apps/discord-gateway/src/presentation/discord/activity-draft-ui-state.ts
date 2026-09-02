/**
 * Draft form presentation state for Discord UI (modal prefill).
 * Not a source of business truth — activity-service remains owner of drafts.
 */
import { whenKindFromDraftPayload, type WhenKind } from './activity-schedule-form.js';

export type DraftFormUiState = {
  name: string;
  description: string;
  scheduleFromDisplay: string;
  scheduleToDisplay: string;
  whenKind: WhenKind;
  source: 'create' | 'lfg';
};

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
