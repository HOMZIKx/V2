/** Daily-bucket member activity store — real MessageCreate + voice minutes. */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type DayUserBucket = {
  readonly messageCount: number;
  readonly voiceMinutes: number;
  readonly displayName?: string;
  readonly avatarUrl?: string;
};

export type AggregatedUserActivity = {
  readonly messageCount: number;
  readonly voiceMinutes: number;
  readonly displayName?: string;
  readonly avatarUrl?: string;
};

export type DayFile = Record<string, DayUserBucket>;

export type MemberActivityMeta = {
  readonly collectorStartedAt: string;
};

function warsawDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export class MemberActivityStore {
  private readonly root: string;
  private readonly metaPath: string;

  public constructor(dataDir: string) {
    this.root = path.resolve(dataDir, 'member-activity');
    this.metaPath = path.join(this.root, 'meta.json');
    mkdirSync(path.join(this.root, 'days'), { recursive: true });
    this.ensureMeta();
  }

  public getCollectorStartedAt(): string {
    return this.ensureMeta().collectorStartedAt;
  }

  public dayKey(d = new Date()): string {
    return warsawDayKey(d);
  }

  public dayFilePath(guildId: string, dayKey: string): string {
    return path.join(this.root, 'days', guildId, `${dayKey}.json`);
  }

  public readDay(guildId: string, dayKey: string): DayFile {
    return readJsonFile<DayFile>(this.dayFilePath(guildId, dayKey), {});
  }

  public listDayKeys(guildId: string): string[] {
    const dir = path.join(this.root, 'days', guildId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();
  }

  public addMessages(input: {
    readonly guildId: string;
    readonly discordUserId: string;
    readonly delta?: number;
    readonly displayName?: string;
    readonly avatarUrl?: string;
    readonly at?: Date;
  }): void {
    const day = this.dayKey(input.at);
    const file = this.readDay(input.guildId, day);
    const prev = file[input.discordUserId] ?? { messageCount: 0, voiceMinutes: 0 };
    file[input.discordUserId] = {
      messageCount: Math.max(0, prev.messageCount + (input.delta ?? 1)),
      voiceMinutes: prev.voiceMinutes,
      ...(input.displayName || prev.displayName
        ? { displayName: input.displayName ?? prev.displayName }
        : {}),
      ...(input.avatarUrl || prev.avatarUrl ? { avatarUrl: input.avatarUrl ?? prev.avatarUrl } : {}),
    };
    atomicWriteJson(this.dayFilePath(input.guildId, day), file);
  }

  public addVoiceMinutes(input: {
    readonly guildId: string;
    readonly discordUserId: string;
    readonly minutes: number;
    readonly displayName?: string | undefined;
    readonly avatarUrl?: string | undefined;
    readonly at?: Date;
  }): void {
    if (input.minutes <= 0) return;
    const day = this.dayKey(input.at);
    const file = this.readDay(input.guildId, day);
    const prev = file[input.discordUserId] ?? { messageCount: 0, voiceMinutes: 0 };
    file[input.discordUserId] = {
      messageCount: prev.messageCount,
      voiceMinutes: Math.max(0, prev.voiceMinutes + input.minutes),
      ...(input.displayName || prev.displayName
        ? { displayName: input.displayName ?? prev.displayName }
        : {}),
      ...(input.avatarUrl || prev.avatarUrl ? { avatarUrl: input.avatarUrl ?? prev.avatarUrl } : {}),
    };
    atomicWriteJson(this.dayFilePath(input.guildId, day), file);
  }

  public aggregate(input: {
    readonly guildId: string;
    readonly fromDayInclusive: string;
    readonly toDayInclusive: string;
  }): Map<string, AggregatedUserActivity> {
    const out = new Map<string, AggregatedUserActivity>();
    for (const day of this.listDayKeys(input.guildId)) {
      if (day < input.fromDayInclusive || day > input.toDayInclusive) continue;
      const file = this.readDay(input.guildId, day);
      for (const [userId, bucket] of Object.entries(file)) {
        const prev = out.get(userId) ?? { messageCount: 0, voiceMinutes: 0 };
        out.set(userId, {
          messageCount: prev.messageCount + bucket.messageCount,
          voiceMinutes: prev.voiceMinutes + bucket.voiceMinutes,
          displayName: bucket.displayName ?? prev.displayName,
          avatarUrl: bucket.avatarUrl ?? prev.avatarUrl,
        });
      }
    }
    return out;
  }

  private ensureMeta(): MemberActivityMeta {
    const existing = readJsonFile<MemberActivityMeta | null>(this.metaPath, null);
    if (existing?.collectorStartedAt) return existing;
    const meta: MemberActivityMeta = { collectorStartedAt: new Date().toISOString() };
    atomicWriteJson(this.metaPath, meta);
    return meta;
  }
}
