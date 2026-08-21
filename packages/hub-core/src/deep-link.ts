import { z } from 'zod';

import { HUB_MODULE_KEYS, type HubModuleKey } from './module-registry.js';

/**
 * Durable V2 deep link — Discord message URLs are projections, not identity.
 * Format: v2://{module}/{objectId}[?action=...]
 */

export const DeepLinkSchema = z.object({
  module: z.enum(HUB_MODULE_KEYS),
  objectId: z.string().min(1).max(128),
  action: z.string().min(1).max(64).optional(),
  context: z.record(z.string(), z.string()).optional(),
});

export type DeepLink = z.infer<typeof DeepLinkSchema>;

export function parseDeepLink(raw: string): DeepLink {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('v2://')) {
    throw new Error('Deep link must start with v2://');
  }
  const withoutScheme = trimmed.slice('v2://'.length);
  const [pathPart, queryPart] = withoutScheme.split('?', 2);
  if (pathPart === undefined || pathPart.length === 0) {
    throw new Error('Deep link path is empty');
  }
  const segments = pathPart.split('/').filter((part) => part.length > 0);
  if (segments.length < 2) {
    throw new Error('Deep link requires module and objectId');
  }
  const moduleKey = segments[0];
  const objectId = segments[1];
  if (moduleKey === undefined || objectId === undefined) {
    throw new Error('Deep link requires module and objectId');
  }
  if (!(HUB_MODULE_KEYS as readonly string[]).includes(moduleKey)) {
    throw new Error(`Unknown deep-link module: ${moduleKey}`);
  }

  const context: Record<string, string> = {};
  let action: string | undefined;
  if (queryPart !== undefined && queryPart.length > 0) {
    for (const pair of queryPart.split('&')) {
      const [key, value] = pair.split('=', 2);
      if (key === undefined || value === undefined) {
        continue;
      }
      const decodedKey = decodeURIComponent(key);
      const decodedValue = decodeURIComponent(value);
      if (decodedKey === 'action') {
        action = decodedValue;
      } else {
        context[decodedKey] = decodedValue;
      }
    }
  }

  return DeepLinkSchema.parse({
    module: moduleKey as HubModuleKey,
    objectId: decodeURIComponent(objectId),
    ...(action !== undefined ? { action } : {}),
    ...(Object.keys(context).length > 0 ? { context } : {}),
  });
}

export function formatDeepLink(link: DeepLink): string {
  const parsed = DeepLinkSchema.parse(link);
  const base = `v2://${parsed.module}/${encodeURIComponent(parsed.objectId)}`;
  const params = new URLSearchParams();
  if (parsed.action !== undefined) {
    params.set('action', parsed.action);
  }
  if (parsed.context !== undefined) {
    for (const [key, value] of Object.entries(parsed.context)) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query.length > 0 ? `${base}?${query}` : base;
}

/** WWW path helper — Discord projection may change; this stays stable. */
export function wwwPathForDeepLink(link: DeepLink): string {
  const parsed = DeepLinkSchema.parse(link);
  switch (parsed.module) {
    case 'activities':
      return `/aktywnosci/${encodeURIComponent(parsed.objectId)}`;
    case 'profile':
      return '/profil';
    case 'for_me':
      return '/dla-mnie';
    case 'mine':
      return '/moje';
    case 'notifications':
      return '/powiadomienia';
    case 'reservations':
      return `/rezerwacje/${encodeURIComponent(parsed.objectId)}`;
    case 'marketplace':
      return `/handel/${encodeURIComponent(parsed.objectId)}`;
    case 'support':
      return `/wsparcie/${encodeURIComponent(parsed.objectId)}`;
    case 'community':
      return `/spolecznosc/${encodeURIComponent(parsed.objectId)}`;
  }
}
