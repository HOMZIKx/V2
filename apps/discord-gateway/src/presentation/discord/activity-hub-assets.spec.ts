import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_HUB_ASSET_KEYS,
  ACTIVITY_HUB_BANNER_FILENAME,
  ACTIVITY_HUB_ICON_ASSET_KEYS,
  OWNER_ASSET_REQUIRED,
  buildActivityHubAttachmentFiles,
  buildActivityHubMessageAttachmentFiles,
  getActivityHubAssetDefinition,
  isActivityHubAssetAvailable,
  listActivityHubAssetDefinitions,
  resolveActivityHubAssetPath,
  resolveActivityHubAssetsDirectory,
} from './activity-hub-assets.js';

describe('activity-hub-assets', () => {
  it('registers hub icons plus optional banner in the central registry', () => {
    expect(ACTIVITY_HUB_ASSET_KEYS).toEqual([
      'activityHub',
      'activityBanner',
      'create',
      'lfg',
      'mine',
      'notifications',
    ]);
    expect(listActivityHubAssetDefinitions().map((entry) => entry.key)).toEqual(
      ACTIVITY_HUB_ASSET_KEYS,
    );

    const banner = getActivityHubAssetDefinition('activityBanner');
    expect(banner.filename).toBe(ACTIVITY_HUB_BANNER_FILENAME);
    expect(banner.optional).toBe(true);
    expect(banner.ownerStatus).toBe(OWNER_ASSET_REQUIRED);

    for (const key of ACTIVITY_HUB_ICON_ASSET_KEYS) {
      expect(existsSync(resolveActivityHubAssetPath(key))).toBe(true);
    }
  });

  it('builds the icon catalog without requiring the banner file', () => {
    const files = buildActivityHubAttachmentFiles();
    expect(files).toHaveLength(5);
    const names = files.map((file) => file.name).sort();
    expect(names).toEqual([
      'centrum-aktywnosci-icon.png',
      'moje-aktywnosci-icon.png',
      'powiadomienia-icon.png',
      'szukam-ekipy-icon.png',
      'utworz-wydarzenie-icon.png',
    ]);
  });

  it('attaches header icon and banner only when banner asset exists', () => {
    const files = buildActivityHubMessageAttachmentFiles();
    const names = files.map((file) => file.name).sort();
    expect(names).toContain('centrum-aktywnosci-icon.png');
    expect(names).not.toContain('utworz-wydarzenie-icon.png');
    if (isActivityHubAssetAvailable('activityBanner')) {
      expect(names).toEqual(['centrum-aktywnosci-icon.png', 'v2-activity-banner.png']);
    } else {
      expect(names).toEqual(['centrum-aktywnosci-icon.png']);
    }
  });

  it('resolves assets directory from repo layout', () => {
    const directory = resolveActivityHubAssetsDirectory();
    expect(path.basename(directory)).toBe('assets');
    expect(existsSync(path.join(directory, 'centrum-aktywnosci-icon.png'))).toBe(true);
  });
});
