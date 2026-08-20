import { AttachmentBuilder } from 'discord.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ActivityHubAssetKey = 'activityHub' | 'create' | 'lfg' | 'mine' | 'notifications';

export type ActivityHubAssetDefinition = {
  readonly key: ActivityHubAssetKey;
  readonly filename: string;
  readonly attachmentUrl: string;
  readonly alt: string;
};

const ASSET_DEFINITIONS: Readonly<
  Record<ActivityHubAssetKey, Omit<ActivityHubAssetDefinition, 'key'>>
> = {
  activityHub: {
    filename: 'centrum-aktywnosci-icon.webp',
    attachmentUrl: 'attachment://centrum-aktywnosci-icon.webp',
    alt: 'Centrum Aktywności',
  },
  create: {
    filename: 'utworz-wydarzenie-icon.webp',
    attachmentUrl: 'attachment://utworz-wydarzenie-icon.webp',
    alt: 'Utwórz aktywność',
  },
  lfg: {
    filename: 'szukam-ekipy-icon.webp',
    attachmentUrl: 'attachment://szukam-ekipy-icon.webp',
    alt: 'Szukam ekipy',
  },
  mine: {
    filename: 'moje-aktywnosci-icon.webp',
    attachmentUrl: 'attachment://moje-aktywnosci-icon.webp',
    alt: 'Moje aktywności',
  },
  notifications: {
    filename: 'powiadomienia-icon.webp',
    attachmentUrl: 'attachment://powiadomienia-icon.webp',
    alt: 'Powiadomienia',
  },
};

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

export function resolveActivityHubAssetPath(key: ActivityHubAssetKey): string {
  const { filename } = getActivityHubAssetDefinition(key);
  const assetPath = path.join(resolveActivityHubAssetsDirectory(), filename);
  if (!existsSync(assetPath)) {
    throw new Error(`Missing Activity Hub asset: ${filename}`);
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

/** All hub icon assets (kept in repo; not all attached to the public hub message). */
export function buildActivityHubAttachmentFiles(): AttachmentBuilder[] {
  return ACTIVITY_HUB_ASSET_KEYS.map((key) => buildActivityHubAttachment(key));
}

/** Attachments for the public hub message — header icon only. */
export function buildActivityHubMessageAttachmentFiles(): AttachmentBuilder[] {
  return [buildActivityHubAttachment('activityHub')];
}
