import { ComponentType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { renderActivityHubMessage } from './activity-hub-renderer.js';

const secret = 'test-signing-secret-at-least-32-bytes-long!!';
const opaquePanelId = 'a1b2c3d4e5f6';

function toJson(component: unknown): Record<string, unknown> {
  return (component as { toJSON: () => Record<string, unknown> }).toJSON();
}

describe('activity-hub-renderer', () => {
  it('renders Components V2 hub with Section accessories and panelId custom ids', () => {
    const payload = renderActivityHubMessage({ opaquePanelId, signingSecret: secret });
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.components).toHaveLength(1);
    expect(payload).not.toHaveProperty('embeds');

    const container = toJson(payload.components![0]);
    expect(container.type).toBe(ComponentType.Container);

    const serialized = JSON.stringify(container);
    expect(serialized).toContain(`:panel:${opaquePanelId}:create`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:lfg`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:mine`);
    expect(serialized).toContain(`:panel:${opaquePanelId}:inbox`);
    expect(serialized.toLowerCase()).not.toContain('zgłoś');
    expect(serialized).not.toContain(':report');
    expect(serialized).not.toContain('ready=true');
    expect(serialized).not.toContain('commit');

    const components = (container.components as Array<Record<string, unknown>>) ?? [];
    const sections = components.filter((c) => c.type === ComponentType.Section);
    expect(sections).toHaveLength(4);
    for (const section of sections) {
      expect(section.accessory).toBeDefined();
    }
  });
});
