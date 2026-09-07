import fs from 'node:fs';
import path from 'node:path';

import type { PanelPublishAppearance } from '../../presentation/discord/panel-publish-appearance.js';

export type StoredPanel = {
  readonly id: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly kind: string;
  readonly jumpUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appearance?: PanelPublishAppearance;
};

type RegistryFile = {
  readonly panels: StoredPanel[];
};

function emptyRegistry(): RegistryFile {
  return { panels: [] };
}

export class PanelRegistry {
  public constructor(private readonly filePath: string) {}

  public listByGuild(guildId: string): StoredPanel[] {
    return this.read().panels.filter((p) => p.guildId === guildId);
  }

  public get(guildId: string, panelId: string): StoredPanel | null {
    return (
      this.read().panels.find(
        (p) => p.guildId === guildId && (p.id === panelId || p.messageId === panelId),
      ) ?? null
    );
  }

  public upsert(panel: StoredPanel): StoredPanel {
    const data = this.read();
    const next = data.panels.filter(
      (p) =>
        !(p.guildId === panel.guildId && (p.id === panel.id || p.messageId === panel.messageId)),
    );
    next.push(panel);
    this.write({ panels: next });
    return panel;
  }

  public remove(guildId: string, panelId: string): boolean {
    const data = this.read();
    const next = data.panels.filter(
      (p) => !(p.guildId === guildId && (p.id === panelId || p.messageId === panelId)),
    );
    if (next.length === data.panels.length) return false;
    this.write({ panels: next });
    return true;
  }

  private read(): RegistryFile {
    try {
      if (!fs.existsSync(this.filePath)) return emptyRegistry();
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as RegistryFile;
      if (!parsed || !Array.isArray(parsed.panels)) return emptyRegistry();
      return { panels: parsed.panels.filter((p) => p && typeof p.id === 'string') };
    } catch {
      return emptyRegistry();
    }
  }

  private write(data: RegistryFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}
