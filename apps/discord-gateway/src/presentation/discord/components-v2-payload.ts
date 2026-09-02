import { MessageFlags } from 'discord.js';

import type { ComponentsV2MessagePayload } from '../../application/ports/gateway.ports.js';

/**
 * Normalize Discord.js message payloads into a strict Components V2 shape
 * compatible with exactOptionalPropertyTypes.
 */
export function toComponentsV2Payload(payload: {
  readonly components?: readonly unknown[] | undefined;
  readonly files?: readonly unknown[] | undefined;
  readonly content?: string | null | undefined;
  readonly embeds?: readonly unknown[] | undefined;
  readonly flags?: unknown;
}): ComponentsV2MessagePayload {
  const result: {
    components?: readonly unknown[];
    files?: readonly unknown[];
    content?: string | null;
    embeds?: readonly unknown[];
    flags: number | bigint;
  } = {
    flags: MessageFlags.IsComponentsV2,
  };

  if (payload.components !== undefined) {
    result.components = [...payload.components];
  }
  if (payload.files !== undefined) {
    result.files = [...payload.files];
  }
  if (payload.content !== undefined) {
    result.content = payload.content;
  }
  if (payload.embeds !== undefined) {
    result.embeds = [...payload.embeds];
  }

  return result;
}
