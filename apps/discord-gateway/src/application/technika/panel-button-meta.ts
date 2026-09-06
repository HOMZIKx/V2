import fs from 'node:fs';
import path from 'node:path';

/** Persists ephemeral_text for hub_ephem custom buttons between publish and click. */
export type PanelButtonMeta = {
  readonly buttonId: string;
  readonly ephemeralText: string;
  readonly updatedAt: string;
};

type MetaFile = {
  readonly buttons: PanelButtonMeta[];
};

function empty(): MetaFile {
  return { buttons: [] };
}

export class PanelButtonMetaStore {
  public constructor(private readonly filePath: string) {}

  public putEphemeral(buttonId: string, ephemeralText: string): void {
    const data = this.read();
    const next = data.buttons.filter((b) => b.buttonId !== buttonId);
    next.push({
      buttonId,
      ephemeralText,
      updatedAt: new Date().toISOString(),
    });
    const trimmed = next.slice(-500);
    this.write({ buttons: trimmed });
  }

  public getEphemeral(buttonId: string): string | null {
    return this.read().buttons.find((b) => b.buttonId === buttonId)?.ephemeralText ?? null;
  }

  private read(): MetaFile {
    try {
      if (!fs.existsSync(this.filePath)) return empty();
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as MetaFile;
      if (!parsed || !Array.isArray(parsed.buttons)) return empty();
      return { buttons: parsed.buttons.filter((b) => b && typeof b.buttonId === 'string') };
    } catch {
      return empty();
    }
  }

  private write(data: MetaFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

let singleton: PanelButtonMetaStore | null = null;

export function resolvePanelButtonMetaStore(dataDir?: string): PanelButtonMetaStore {
  if (singleton) return singleton;
  const cwd = process.cwd().replace(/\\/g, '/');
  const base =
    dataDir && dataDir.trim()
      ? dataDir
      : cwd.endsWith('/apps/discord-gateway')
        ? path.resolve(process.cwd(), 'data')
        : path.resolve(process.cwd(), 'apps/discord-gateway/data');
  singleton = new PanelButtonMetaStore(path.join(base, 'technika-panel-button-meta.json'));
  return singleton;
}
