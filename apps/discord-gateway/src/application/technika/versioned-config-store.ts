import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  cloneBotConfig,
  defaultBotConfigValues,
  mergePartialDraft,
  validateBotConfigDraft,
  type ConfigValidationResult,
} from './bot-config.schema.js';
import type { BotConfigValues } from './capabilities.js';

export type ConfigStatus = 'active' | 'draft';

export type ConfigSnapshot = {
  readonly revision: number;
  readonly status: ConfigStatus;
  readonly config: BotConfigValues;
  readonly updatedAt: string;
  readonly hasDraft: boolean;
  readonly canRollback: boolean;
};

export type PreviewResult = {
  readonly ok: boolean;
  readonly revision: number;
  readonly status: ConfigStatus;
  readonly active: BotConfigValues;
  readonly draft: BotConfigValues | null;
  readonly wouldBecomeRevision: number | null;
  readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  readonly updatedAt: string;
};

type PersistedState = {
  revision: number;
  active: BotConfigValues;
  draft: BotConfigValues | null;
  previous: BotConfigValues | null;
  updatedAt: string;
};

export type VersionedConfigStoreOptions = {
  readonly dataDir: string;
  readonly fileName?: string;
  readonly now?: () => Date;
};

export class ApplyValidationError extends Error {
  public readonly issues: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  public constructor(
    issues: ReadonlyArray<{ readonly path: string; readonly message: string }>,
  ) {
    super('Draft failed validation');
    this.name = 'ApplyValidationError';
    this.issues = issues;
  }
}

export class RollbackUnavailableError extends Error {
  public constructor() {
    super('No previous revision available to rollback');
    this.name = 'RollbackUnavailableError';
  }
}

export class VersionedConfigStore {
  private readonly filePath: string;
  private readonly now: () => Date;
  private revision: number;
  private active: BotConfigValues;
  private draft: BotConfigValues | null;
  private previous: BotConfigValues | null;
  private updatedAt: string;

  public constructor(options: VersionedConfigStoreOptions) {
    this.filePath = path.join(options.dataDir, options.fileName ?? 'technika-bot-config.json');
    this.now = options.now ?? (() => new Date());
    mkdirSync(options.dataDir, { recursive: true });

    const loaded = this.tryLoad();
    if (loaded) {
      this.revision = loaded.revision;
      this.active = loaded.active;
      this.draft = loaded.draft;
      this.previous = loaded.previous;
      this.updatedAt = loaded.updatedAt;
    } else {
      this.revision = 1;
      this.active = defaultBotConfigValues();
      this.draft = null;
      this.previous = null;
      this.updatedAt = this.now().toISOString();
      this.persist();
    }
  }

  public getActiveSnapshot(): ConfigSnapshot {
    return {
      revision: this.revision,
      status: 'active',
      config: cloneBotConfig(this.active),
      updatedAt: this.updatedAt,
      hasDraft: this.draft !== null,
      canRollback: this.previous !== null,
    };
  }

  public getDraftSnapshot(): ConfigSnapshot | null {
    if (this.draft === null) {
      return null;
    }
    return {
      revision: this.revision,
      status: 'draft',
      config: cloneBotConfig(this.draft),
      updatedAt: this.updatedAt,
      hasDraft: true,
      canRollback: this.previous !== null,
    };
  }

  public putDraft(input: unknown): ConfigValidationResult {
    const base = this.draft ?? this.active;
    const result = mergePartialDraft(base, input);
    if (!result.ok) {
      return result;
    }
    this.draft = cloneBotConfig(result.config);
    this.updatedAt = this.now().toISOString();
    this.persist();
    return result;
  }

  public validate(input?: unknown): ConfigValidationResult {
    if (input === undefined) {
      if (this.draft === null) {
        return { ok: true, config: cloneBotConfig(this.active), issues: [] };
      }
      return validateBotConfigDraft(this.draft);
    }
    return validateBotConfigDraft(input);
  }

  public preview(): PreviewResult {
    if (this.draft === null) {
      return {
        ok: true,
        revision: this.revision,
        status: 'active',
        active: cloneBotConfig(this.active),
        draft: null,
        wouldBecomeRevision: null,
        issues: [],
        updatedAt: this.updatedAt,
      };
    }

    const draftValidation = validateBotConfigDraft(this.draft);
    return {
      ok: draftValidation.ok,
      revision: this.revision,
      status: 'draft',
      active: cloneBotConfig(this.active),
      draft: cloneBotConfig(this.draft),
      wouldBecomeRevision: draftValidation.ok ? this.revision + 1 : null,
      issues: draftValidation.ok ? [] : draftValidation.issues,
      updatedAt: this.updatedAt,
    };
  }

  /** Promote draft → active. Idempotent when no draft or draft equals active. */
  public apply(): ConfigSnapshot {
    if (this.draft === null) {
      return this.getActiveSnapshot();
    }

    const validation = validateBotConfigDraft(this.draft);
    if (!validation.ok) {
      throw new ApplyValidationError(validation.issues);
    }

    if (configsEqual(this.active, validation.config)) {
      this.draft = null;
      this.updatedAt = this.now().toISOString();
      this.persist();
      return this.getActiveSnapshot();
    }

    this.previous = cloneBotConfig(this.active);
    this.active = cloneBotConfig(validation.config);
    this.draft = null;
    this.revision += 1;
    this.updatedAt = this.now().toISOString();
    this.persist();
    return this.getActiveSnapshot();
  }

  public rollback(): ConfigSnapshot {
    if (this.previous === null) {
      throw new RollbackUnavailableError();
    }
    const current = cloneBotConfig(this.active);
    this.active = cloneBotConfig(this.previous);
    this.previous = current;
    this.draft = null;
    this.revision += 1;
    this.updatedAt = this.now().toISOString();
    this.persist();
    return this.getActiveSnapshot();
  }

  public resetForTests(initial?: BotConfigValues): void {
    this.revision = 1;
    this.active = cloneBotConfig(initial ?? defaultBotConfigValues());
    this.draft = null;
    this.previous = null;
    this.updatedAt = this.now().toISOString();
    this.persist();
  }

  private tryLoad(): PersistedState | null {
    if (!existsSync(this.filePath)) {
      return null;
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedState;
      const activeCheck = validateBotConfigDraft(raw.active);
      if (!activeCheck.ok) {
        return null;
      }
      let draft: BotConfigValues | null = null;
      if (raw.draft !== null && raw.draft !== undefined) {
        const draftCheck = validateBotConfigDraft(raw.draft);
        if (draftCheck.ok) {
          draft = draftCheck.config;
        }
      }
      let previous: BotConfigValues | null = null;
      if (raw.previous !== null && raw.previous !== undefined) {
        const prevCheck = validateBotConfigDraft(raw.previous);
        if (prevCheck.ok) {
          previous = prevCheck.config;
        }
      }
      return {
        revision: typeof raw.revision === 'number' && raw.revision >= 1 ? raw.revision : 1,
        active: activeCheck.config,
        draft,
        previous,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : this.now().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private persist(): void {
    const state: PersistedState = {
      revision: this.revision,
      active: this.active,
      draft: this.draft,
      previous: this.previous,
      updatedAt: this.updatedAt,
    };
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.filePath);
  }
}

function configsEqual(a: BotConfigValues, b: BotConfigValues): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
