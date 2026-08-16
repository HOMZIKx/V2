import { describe, expect, it } from 'vitest';

import { createPanelCustomId } from '../security/activity-signed-custom-id.js';
import {
  collectCustomIdsFromComponents,
  customIdContainsPanelOpaqueId,
  messageMatchesPanelOpaqueId,
  pickCanonicalPanelMessageId,
} from './panel-message-scan.js';

const secret = 's'.repeat(32);
const opaquePanelId = 'a1b2c3d4e5f6';

describe('panel-message-scan', () => {
  it('detects panel opaque id inside signed custom_id markers', () => {
    const customId = createPanelCustomId(opaquePanelId, 'create', secret);
    expect(customIdContainsPanelOpaqueId(customId, opaquePanelId)).toBe(true);
    expect(customIdContainsPanelOpaqueId(customId, 'ffffffffffff')).toBe(false);
  });

  it('collects nested V2 component custom ids', () => {
    const customId = createPanelCustomId(opaquePanelId, 'mine', secret);
    const components = [
      {
        type: 18,
        components: [
          {
            type: 9,
            accessory: { type: 2, custom_id: customId },
          },
        ],
      },
    ];
    expect(collectCustomIdsFromComponents(components)).toContain(customId);
    expect(messageMatchesPanelOpaqueId({ components }, opaquePanelId)).toBe(true);
  });

  it('picks newest snowflake as canonical panel message', () => {
    expect(pickCanonicalPanelMessageId(['100', '9999999999999999999', '200'])).toBe(
      '9999999999999999999',
    );
  });
});
