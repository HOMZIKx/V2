import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_HUB_ASSET_KEYS,
  buildActivityHubAttachmentFiles,
  buildActivityHubMessageAttachmentFiles,
  getActivityHubAssetDefinition,
  listActivityHubAssetDefinitions,
  resolveActivityHubAssetPath,
  resolveActivityHubAssetsDirectory,
} from './activity-hub-assets.js';

describe('activity-hub-assets', () => {
  it('registers all five hub icons with attachment URLs and alt text', () => {
    expect(ACTIVITY_HUB_ASSET_KEYS).toHaveLength(5);
    expect(listActivityHubAssetDefinitions().map((entry) => entry.key)).toEqual([
      'activityHub',
      'create',
      'lfg',
      'mine',
      'notifications',
    ]);

    const expected = {
      activityHub: {
        filename: 'centrum-aktywnosci-icon.webp',
        alt: 'Centrum Aktywności',
      },
      create: {
        filename: 'utworz-wydarzenie-icon.webp',
        alt: 'Utwórz aktywność',
      },
      lfg: {
        filename: 'szukam-ekipy-icon.webp',
        alt: 'Szukam ekipy',
      },
      mine: {
        filename: 'moje-aktywnosci-icon.webp',
        alt: 'Moje aktywności',
      },
      notifications: {
        filename: 'powiadomienia-icon.webp',
        alt: 'Powiadomienia',
      },
    } as const;

    for (const key of ACTIVITY_HUB_ASSET_KEYS) {
      const definition = getActivityHubAssetDefinition(key);
      const spec = expected[key];
      expect(definition.filename).toBe(spec.filename);
      expect(definition.attachmentUrl).toBe(`attachment://${spec.filename}`);
      expect(definition.alt).toBe(spec.alt);
      expect(existsSync(resolveActivityHubAssetPath(key))).toBe(true);
    }
  });

  it('builds the full asset catalog without removing unused hub icons from repo', () => {
    const files = buildActivityHubAttachmentFiles();
    expect(files).toHaveLength(5);
    const names = files.map((file) => file.name).sort();
    expect(names).toEqual([
      'centrum-aktywnosci-icon.webp',
      'moje-aktywnosci-icon.webp',
      'powiadomienia-icon.webp',
      'szukam-ekipy-icon.webp',
      'utworz-wydarzenie-icon.webp',
    ]);
  });

  it('attaches only the header icon on the public hub message', () => {
    const files = buildActivityHubMessageAttachmentFiles();
    expect(files.map((file) => file.name)).toEqual(['centrum-aktywnosci-icon.webp']);
  });

  it('resolves assets directory from repo layout', () => {
    const directory = resolveActivityHubAssetsDirectory();
    expect(path.basename(directory)).toBe('assets');
    expect(existsSync(path.join(directory, 'centrum-aktywnosci-icon.webp'))).toBe(true);
  });
});
