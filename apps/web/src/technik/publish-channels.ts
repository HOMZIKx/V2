/**
 * publishChannels — purpose → Discord channel mapping (Technika draft).
 * Centrum hub channel = publishChannels.centrumHub.
 * Website link channel = publishChannels.website (+ appWebsiteUrl).
 */

import { TECHNIK_TEST_GUILD_ID } from './technika-config-api';

export type PublishPurposeId =
  'centrumHub' | 'website' | 'notifications' | 'dungeons' | 'trade' | 'recurring' | 'events';

export type PublishPurpose = {
  readonly id: PublishPurposeId;
  readonly label: string;
  readonly description: string;
};

export const PUBLISH_PURPOSES: readonly PublishPurpose[] = [
  {
    id: 'centrumHub',
    label: 'Centrum',
    description: 'Stały panel Centrum aktywności (hub) — jeden kanał na guildię.',
  },
  {
    id: 'website',
    label: 'Strona WWW / link do aplikacji',
    description:
      'Stały post / pin z adresem aplikacji DESTILED (link do WWW) — jeden kanał na guildię.',
  },
  {
    id: 'notifications',
    label: 'Powiadomienia',
    description: 'Kanał na ogłoszenia guildii (osobno od prywatnej skrzynki gracza).',
  },
  {
    id: 'dungeons',
    label: 'Dungeony',
    description: 'Posty aktywności typu dungeon / instancja.',
  },
  {
    id: 'trade',
    label: 'Handel',
    description: 'Posty handlowe / oferty.',
  },
  {
    id: 'recurring',
    label: 'Cykliczne',
    description: 'Serie i posty cykliczne (harmonogram z zakładki Cykliczne).',
  },
  {
    id: 'events',
    label: 'Wydarzenia',
    description: 'Jednorazowe wydarzenia guildii (gdy osobno od Centrum).',
  },
] as const;

export type PublishChannelsMap = Partial<Record<PublishPurposeId, string>>;

const STORAGE_KEY = 'technik.publishChannels.v1';
const WEBSITE_URL_STORAGE_KEY = 'technik.appWebsiteUrl.v1';
const LEGACY_HUB_PREFIX = 'technik.hubChannelId.';

type Store = Record<string, PublishChannelsMap>;
type WebsiteUrlStore = Record<string, string>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function readWebsiteUrlStore(): WebsiteUrlStore {
  try {
    const raw = localStorage.getItem(WEBSITE_URL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as WebsiteUrlStore;
  } catch {
    return {};
  }
}

function writeWebsiteUrlStore(store: WebsiteUrlStore): void {
  localStorage.setItem(WEBSITE_URL_STORAGE_KEY, JSON.stringify(store));
}

export function loadPublishChannels(guildId: string = TECHNIK_TEST_GUILD_ID): PublishChannelsMap {
  const store = readStore();
  const current = { ...(store[guildId] ?? {}) };
  if (!current.centrumHub) {
    try {
      const legacy = localStorage.getItem(LEGACY_HUB_PREFIX + guildId);
      if (legacy && /^d{17,20}$/.test(legacy)) {
        current.centrumHub = legacy;
        savePublishChannels(guildId, current);
      }
    } catch {
      /* ignore */
    }
  }
  return current;
}

export function savePublishChannels(guildId: string, map: PublishChannelsMap): void {
  const store = readStore();
  store[guildId] = { ...map };
  writeStore(store);
  if (map.centrumHub) {
    try {
      localStorage.setItem(LEGACY_HUB_PREFIX + guildId, map.centrumHub);
    } catch {
      /* ignore */
    }
  } else {
    try {
      localStorage.removeItem(LEGACY_HUB_PREFIX + guildId);
    } catch {
      /* ignore */
    }
  }
}

export function setPublishChannel(
  guildId: string,
  purpose: PublishPurposeId,
  channelId: string,
): PublishChannelsMap {
  const next = { ...loadPublishChannels(guildId) };
  if (!channelId) delete next[purpose];
  else next[purpose] = channelId;
  savePublishChannels(guildId, next);
  return next;
}

/** Per-guild https URL of the DESTILED web app (posted on publishChannels.website). */
export function loadAppWebsiteUrl(guildId: string = TECHNIK_TEST_GUILD_ID): string {
  const store = readWebsiteUrlStore();
  const v = store[guildId];
  return typeof v === 'string' ? v : '';
}

export function saveAppWebsiteUrl(guildId: string, url: string): string {
  const store = readWebsiteUrlStore();
  const trimmed = url.trim();
  if (!trimmed) delete store[guildId];
  else store[guildId] = trimmed;
  writeWebsiteUrlStore(store);
  return trimmed;
}

export function channelLabel(
  channelId: string | undefined,
  channels: readonly { readonly id: string; readonly name: string }[],
): string {
  if (!channelId) return 'nie wybrano';
  const hit = channels.find((c) => c.id === channelId);
  return hit ? '#' + hit.name : 'kanał (niedostępny na liście)';
}
