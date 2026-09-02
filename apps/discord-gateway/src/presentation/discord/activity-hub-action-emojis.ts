import { z } from 'zod';

import { OWNER_ASSET_UPLOAD_REQUIRED } from './activity-hub-assets.js';

export { OWNER_ASSET_UPLOAD_REQUIRED } from './activity-hub-assets.js';

export type HubActionKey = 'create' | 'lfg' | 'mine' | 'inbox';

export type HubActionEmojiRef = {
  readonly id: string;
  readonly name: string;
};

export type HubActionEmojiMap = Partial<Record<HubActionKey, HubActionEmojiRef>>;

const snowflakeSchema = z.string().regex(/^\d{17,20}$/);

const emojiRefSchema = z.object({
  id: snowflakeSchema,
  name: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/),
});

const emojiMapSchema = z
  .object({
    create: emojiRefSchema.optional(),
    lfg: emojiRefSchema.optional(),
    mine: emojiRefSchema.optional(),
    inbox: emojiRefSchema.optional(),
    /** Alias accepted for inbox (asset key notifications). */
    notifications: emojiRefSchema.optional(),
  })
  .strict();

/**
 * Parse owner-configured application/guild custom emoji IDs for hub actions.
 * Env: DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON
 * Example:
 * {"create":{"id":"...","name":"v2_create"},"lfg":{"id":"...","name":"v2_lfg"},
 *  "mine":{"id":"...","name":"v2_mine"},"inbox":{"id":"...","name":"v2_inbox"}}
 *
 * Missing / invalid → empty map (text-only titles). Status: OWNER_ASSET_UPLOAD_REQUIRED.
 */
export function parseHubActionEmojiConfig(raw: string | undefined): HubActionEmojiMap {
  if (raw === undefined || raw.trim().length === 0) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
  const result = emojiMapSchema.safeParse(parsed);
  if (!result.success) {
    return {};
  }
  const map: HubActionEmojiMap = {};
  if (result.data.create !== undefined) {
    map.create = result.data.create;
  }
  if (result.data.lfg !== undefined) {
    map.lfg = result.data.lfg;
  }
  if (result.data.mine !== undefined) {
    map.mine = result.data.mine;
  }
  const inbox = result.data.inbox ?? result.data.notifications;
  if (inbox !== undefined) {
    map.inbox = inbox;
  }
  return map;
}

export function resolveHubActionEmojisFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HubActionEmojiMap {
  return parseHubActionEmojiConfig(env.DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON);
}

export function formatHubActionEmojiMarkdown(emoji: HubActionEmojiRef): string {
  return `<:${emoji.name}:${emoji.id}>`;
}

export function hubActionIconPrefix(
  action: HubActionKey,
  emojis: HubActionEmojiMap | undefined,
): string {
  const emoji = emojis?.[action];
  if (emoji === undefined) {
    return '';
  }
  return `${formatHubActionEmojiMarkdown(emoji)} `;
}

export function hubActionEmojiOwnerStatus(emojis: HubActionEmojiMap): string | null {
  const required: HubActionKey[] = ['create', 'lfg', 'mine', 'inbox'];
  const missing = required.filter((key) => emojis[key] === undefined);
  return missing.length > 0 ? OWNER_ASSET_UPLOAD_REQUIRED : null;
}
