import { AttachmentBuilder } from 'discord.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Central Activity Hub visual asset registry.
 *
 * OWNER_ASSET_REQUIRED — wide banner path when file is absent:
 *   apps/discord-gateway/assets/v2-activity-banner.webp
 *   Spec: ~4:1–5:1, amber → graphite → warm green, no text, no LAB logo.
 *   Present in repo: optional MediaGallery attaches automatically.
 *
 * OWNER_ASSET_UPLOAD_REQUIRED — small function icons as Discord custom emoji
 *   (upload from utworz/szukam/moje/powiadomienia webp, ~emoji scale).
 *   Configure via DISCORD_ACTIVITY_HUB_ACTION_EMOJIS_JSON (see action-emojis helper).
 *   Do not hardcode emoji snowflakes in source.
 */
export const OWNER_ASSET_REQUIRED = 'OWNER_ASSET_REQUIRED' as const;
export const OWNER_ASSET_UPLOAD_REQUIRED = 'OWNER_ASSET_UPLOAD_REQUIRED' as const;

export const ACTIVITY_HUB_BANNER_FILENAME = 'v2-activity-banner.webp';

export type ActivityHubAssetKey =
  'activityHub' | 'activityBanner' | 'create' | 'lfg' | 'mine' | 'notifications';

export type ActivityHubAssetDefinition = {
  readonly key: ActivityHubAssetKey;
  readonly filename: string;
  readonly attachmentUrl: string;
  readonly alt: string;
  /** When true, missing file must not crash hub publish — omit from message. */
  readonly optional: boolean;
  readonly ownerStatus: typeof OWNER_ASSET_REQUIRED | null;
};

const ASSET_DEFINITIONS: Readonly<
  Record<ActivityHubAssetKey, Omit<ActivityHubAssetDefinition, 'key'>>
> = {
  activityHub: {
    filename: 'centrum-aktywnosci-icon.webp',
    attachmentUrl: 'attachment://centrum-aktywnosci-icon.webp',
    alt: 'V2 Centrum',
    optional: false,
    ownerStatus: null,
  },
  activityBanner: {
    filename: ACTIVITY_HUB_BANNER_FILENAME,
    attachmentUrl: `attachment://${ACTIVITY_HUB_BANNER_FILENAME}`,
    alt: 'V2 Activity banner',
    optional: true,
    ownerStatus: OWNER_ASSET_REQUIRED,
  },
  create: {
    filename: 'utworz-wydarzenie-icon.webp',
    attachmentUrl: 'attachment://utworz-wydarzenie-icon.webp',
    alt: 'Utwórz aktywność',
    optional: false,
    ownerStatus: null,
  },
  lfg: {
    filename: 'szukam-ekipy-icon.webp',
    attachmentUrl: 'attachment://szukam-ekipy-icon.webp',
    alt: 'Szukam ekipy',
    optional: false,
    ownerStatus: null,
  },
  mine: {
    filename: 'moje-aktywnosci-icon.webp',
    attachmentUrl: 'attachment://moje-aktywnosci-icon.webp',
    alt: 'Moje aktywności',
    optional: false,
    ownerStatus: null,
  },
  notifications: {
    filename: 'powiadomienia-icon.webp',
    attachmentUrl: 'attachment://powiadomienia-icon.webp',
    alt: 'Powiadomienia',
    optional: false,
    ownerStatus: null,
  },
};

/** Keys that always have file bytes in repo (icons). Banner is separate. */
export const ACTIVITY_HUB_ICON_ASSET_KEYS = [
  'activityHub',
  'create',
  'lfg',
  'mine',
  'notifications',
] as const satisfies readonly ActivityHubAssetKey[];

export const ACTIVITY_HUB_ASSET_KEYS = Object.keys(ASSET_DEFINITIONS) as ActivityHubAssetKey[];

let cachedAssetsDirectory: string | null = null;

function moduleRelativeAssetsDirectory(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../assets'),
    path.resolve(here, '../../../../assets'),
    path.resolve(process.cwd(), 'apps/discord-gateway/assets'),
    path.resolve(process.cwd(), 'assets'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'Missing Activity Hub assets directory. Expected apps/discord-gateway/assets with icon files.',
  );
}

/** Resolve the Activity Hub assets directory deterministically for dev, tests, and Docker. */
export function resolveActivityHubAssetsDirectory(): string {
  if (cachedAssetsDirectory !== null) {
    return cachedAssetsDirectory;
  }
  cachedAssetsDirectory = moduleRelativeAssetsDirectory();
  return cachedAssetsDirectory;
}

export function getActivityHubAssetDefinition(
  key: ActivityHubAssetKey,
): ActivityHubAssetDefinition {
  const definition = ASSET_DEFINITIONS[key];
  return { key, ...definition };
}

export function tryResolveActivityHubAssetPath(key: ActivityHubAssetKey): string | null {
  const { filename } = getActivityHubAssetDefinition(key);
  const assetPath = path.join(resolveActivityHubAssetsDirectory(), filename);
  return existsSync(assetPath) ? assetPath : null;
}

export function isActivityHubAssetAvailable(key: ActivityHubAssetKey): boolean {
  return tryResolveActivityHubAssetPath(key) !== null;
}

export function resolveActivityHubAssetPath(key: ActivityHubAssetKey): string {
  const definition = getActivityHubAssetDefinition(key);
  const assetPath = tryResolveActivityHubAssetPath(key);
  if (assetPath === null) {
    if (definition.optional) {
      throw new Error(
        `Optional Activity Hub asset missing: ${definition.filename} (${definition.ownerStatus ?? 'optional'})`,
      );
    }
    throw new Error(`Missing Activity Hub asset: ${definition.filename}`);
  }
  return assetPath;
}

export function listActivityHubAssetDefinitions(): readonly ActivityHubAssetDefinition[] {
  return ACTIVITY_HUB_ASSET_KEYS.map((key) => getActivityHubAssetDefinition(key));
}

export function buildActivityHubAttachment(key: ActivityHubAssetKey): AttachmentBuilder {
  const { filename } = getActivityHubAssetDefinition(key);
  return new AttachmentBuilder(readFileSync(resolveActivityHubAssetPath(key)), { name: filename });
}

/** Full icon catalog (repo files). Does not require the optional banner. */
export function buildActivityHubAttachmentFiles(): AttachmentBuilder[] {
  return ACTIVITY_HUB_ICON_ASSET_KEYS.map((key) => buildActivityHubAttachment(key));
}

/**
 * Attachments for the public hub message:
 * - header icon (required)
 * - wide banner when `v2-activity-banner.webp` is present
 * - never the four large action icon files (those are emoji-scale via custom emoji)
 */
export function buildActivityHubMessageAttachmentFiles(): AttachmentBuilder[] {
  const files: AttachmentBuilder[] = [buildActivityHubAttachment('activityHub')];
  if (isActivityHubAssetAvailable('activityBanner')) {
    files.push(buildActivityHubAttachment('activityBanner'));
  }
  return files;
}
