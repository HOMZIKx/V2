/**
 * Technika (D-060) capability catalog — safe functional bot toggles only.
 * No tokens, OAuth secrets, allowlists, or infrastructure credentials (WEB_ACCESS).
 */

export type CapabilityValueType = 'boolean' | 'number' | 'string' | 'object';

export type BotCapabilityDefinition = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly valueType: CapabilityValueType;
  readonly default: unknown;
  /** When true, Technika may display but not draft/apply this value. */
  readonly readOnly?: boolean;
  /** Nested field schema for object capabilities (OpenAPI + Technika forms). */
  readonly fields?: ReadonlyArray<{
    readonly key: string;
    readonly title: string;
    readonly description: string;
    readonly valueType: 'boolean' | 'number' | 'string';
    readonly default: boolean | number | string;
  }>;
};

const CHARACTER_TIMERS_DEFAULT = {
  enabled: false,
  messageTemplate:
    '**DESTILED · Timer postaci**\n{{title}}\n\n{{body}}\n\nInne: {{otherTimersSummary}}',
  reminderMinutesBefore: 60,
  resetNotifyEnabled: true,
} as const;

const CHARACTER_TIMERS_FIELDS = [
  {
    key: 'enabled',
    title: 'Włączony',
    description: 'Główny przełącznik powiadomień timerów postaci (Księga, Kamień, …).',
    valueType: 'boolean' as const,
    default: false,
  },
  {
    key: 'messageTemplate',
    title: 'Szablon wiadomości',
    description:
      'Szablon PL — {{title}}, {{body}}, {{otherTimersSummary}}, {{characterName}}, {{timerLabel}}, {{endsAt}}, {{deepLinkUrl}}. Bez sekretów. Nie dotyczy metinów na mapie.',
    valueType: 'string' as const,
    default: CHARACTER_TIMERS_DEFAULT.messageTemplate,
  },
  {
    key: 'reminderMinutesBefore',
    title: 'Przypomnienie (min przed)',
    description: 'Ile minut przed końcem cyklu wysłać auto-reminder (domyślnie 60).',
    valueType: 'number' as const,
    default: 60,
  },
  {
    key: 'resetNotifyEnabled',
    title: 'DM po starcie / resecie',
    description:
      'Po starcie lub oznaczeniu Gotowe wyślij PW ze skrótem innych timerów postaci w zespole.',
    valueType: 'boolean' as const,
    default: true,
  },
] as const;

/** Stable English kebab-case / camelCase module ids — do not rename without a contract bump. */
export const BOT_CAPABILITIES = [
  {
    id: 'panel-test-enabled',
    title: 'Panel testowy',
    description:
      'Włącza komendy / interakcje panelu testowego (lab) na guildzie testowym. Nie zmienia poświadczeń logowania bota.',
    valueType: 'boolean',
    default: true,
  },
  {
    id: 'notify-timer-enabled',
    title: 'Endpoint notify/timer',
    description:
      'Akceptuje POST /notify/timer (S2S). Osobno od szablonów characterTimers — wyłączenie blokuje cały endpoint.',
    valueType: 'boolean',
    default: true,
  },
  {
    id: 'characterTimers',
    title: 'Timers postaci (Księga, Kamień…)',
    description:
      'Powiadomienia Discord o timerach postaci z karty EQ/Timer (Księga umiejętności, Kamień Duchowy, Dowodzenie, Polimorfia, Górnictwo, Jazda konna). NIE dotyczy timerów map/metin. Przyciski w PW: Gotowe / Przypomnij później.',
    valueType: 'object',
    default: { ...CHARACTER_TIMERS_DEFAULT },
    fields: [...CHARACTER_TIMERS_FIELDS],
  },
  {
    id: 'timersNotify',
    title: 'Timers postaci (alias timersNotify)',
    description:
      'Alias produktu = characterTimers (te same pole). Zachowany dla kompatybilności OpenAPI. Semantyka: timery postaci, nie map/metin.',
    valueType: 'object',
    default: { ...CHARACTER_TIMERS_DEFAULT },
    fields: [...CHARACTER_TIMERS_FIELDS],
  },
  {
    id: 'kingdomWar',
    title: 'Moduł Wojna Królestw',
    description:
      'Powiadomienie przed Wojną Królestw (Europe/Warsaw). Np. warAt 18:00 i notifyMinutesBefore 30 → ping o 17:30.',
    valueType: 'object',
    default: {
      enabled: false,
      warAt: '18:00',
      notifyMinutesBefore: 30,
      maxClaimsPerUser: 3,
      messageTemplate:
        '**DESTILED · Wojna Królestw**\nZa {{notifyMinutesBefore}} min start ({{warAt}} Europe/Warsaw).',
    },
    fields: [
      {
        key: 'enabled',
        title: 'Włączony',
        description: 'Włącza harmonogram powiadomień o Wojnie Królestw.',
        valueType: 'boolean',
        default: false,
      },
      {
        key: 'warAt',
        title: 'Godzina wojny',
        description: 'Lokalna godzina startu w Europe/Warsaw, format HH:mm (np. "18:00").',
        valueType: 'string',
        default: '18:00',
      },
      {
        key: 'notifyMinutesBefore',
        title: 'Powiadomienie (min przed)',
        description: 'Ile minut przed warAt wysłać ping (domyślnie 30 → 17:30 przy 18:00).',
        valueType: 'number',
        default: 30,
      },
      {
        key: 'maxClaimsPerUser',
        title: 'Max claimów / user',
        description: 'Ile postaci wojny może zająć jeden użytkownik Discord (domyślnie 3).',
        valueType: 'number',
        default: 3,
      },
      {
        key: 'messageTemplate',
        title: 'Szablon wiadomości',
        description: 'Szablon PL z {{warAt}}, {{notifyMinutesBefore}}. Bez sekretów infrastrukturalnych.',
        valueType: 'string',
        default:
          '**DESTILED · Wojna Królestw**\nZa {{notifyMinutesBefore}} min start ({{warAt}} Europe/Warsaw).',
      },
    ],
  },
  {
    id: 'memberActivity',
    title: 'Aktywność członków (ranking)',
    description:
      'Collector MessageCreate + voice minutes per user/guild/day. Dashboard 7d/14d/30d top10 + /me; Technika full+q+since_bot.',
    valueType: 'object',
    default: {
      enabled: true,
      guildId: '1543972927719080016',
      memberRoleIds: [],
      windowDays: 7,
      topN: 10,
    },
    fields: [
      { key: 'enabled', title: 'Włączony', description: 'Włącza collector aktywności.', valueType: 'boolean', default: true },
      { key: 'guildId', title: 'Guildia źródłowa', description: 'Domyślnie Destiled.', valueType: 'string', default: '1543972927719080016' },
      { key: 'windowDays', title: 'Okno (dni)', description: '7, 14 lub 30.', valueType: 'number', default: 7 },
      { key: 'topN', title: 'Top N', description: 'Dashboard top (10).', valueType: 'number', default: 10 },
    ],
  },
  {
    id: 'publishChannels',
    title: 'Kanały publikacji (cel → kanał)',
    description:
      'Mapa: centrumHub, notifications, dungeons, trade, recurring, events, website (Strona WWW / link do aplikacji). Nie bare allowlist. Preferuj guild-scoped + GET channels picker. Zero auto-publish.',
    valueType: 'object',
    default: {},
  },
  {
    id: 'recurringPosts',
    title: 'Posty cykliczne (szkic / config)',
    description:
      'Config-only flat object: enabled/title/content/schedule{mode,daysOfWeek,timeWarsaw,horizonDays}/channelId/seedReactions/showCountsInPost/rsvpEnabled/rules. Scheduler/cron NIE zaimplementowany — uczciwa luka. Zero auto-publish.',
    valueType: 'object',
    default: { enabled: false, title: '', content: '', schedule: { mode: 'weekly', daysOfWeek: [1, 3, 5], timeWarsaw: '18:00', horizonDays: 90 }, channelId: '', seedReactions: [], showCountsInPost: false, rsvpEnabled: false, rules: { whoCanReact: 'everyone', closeAt: 'none' } },
  },
  {
    id: 'strict-guild-isolation',
    title: 'Ścisła izolacja guildii',
    description:
      'Odczyt bieżącego DISCORD_STRICT_GUILD_ISOLATION (env). Technika nie zmienia tego z UI — tylko podgląd bezpieczeństwa.',
    valueType: 'boolean',
    default: true,
    readOnly: true,
  },
] as const satisfies readonly BotCapabilityDefinition[];

export type TimersNotifyConfig = {
  readonly enabled: boolean;
  readonly messageTemplate: string;
  readonly reminderMinutesBefore: number;
  readonly resetNotifyEnabled: boolean;
};

/** Explicit product module — same shape as timersNotify; preferred when present. */
export type CharacterTimersConfig = TimersNotifyConfig;

export type KingdomWarConfig = {
  readonly enabled: boolean;
  readonly warAt: string;
  readonly notifyMinutesBefore: number;
  readonly maxClaimsPerUser: number;
  readonly messageTemplate: string;
};


export type GuildModuleFlags = {
  readonly characterTimers: boolean;
  readonly kingdomWar: boolean;
  readonly panels: boolean;
  readonly channels: boolean;
};

export type GuildRight =
  | 'technika.config'
  | 'technika.apply'
  | 'technika.rollback'
  | 'discord.notify'
  | 'discord.panels'
  | 'discord.commands';

export type GuildConfig = {
  readonly enabled: boolean;
  readonly displayName?: string;
  readonly modules: GuildModuleFlags;
  readonly rights: readonly GuildRight[];
  readonly notes?: string;
  readonly publishChannels?: PublishChannelsMap;
  /** Per-guild DESTILED web app URL (with publishChannels.website). Zero auto-publish. */
  readonly appWebsiteUrl?: string;
};

export type GuildsMap = Readonly<Record<string, GuildConfig>>;

export function defaultGuildModules(): GuildModuleFlags {
  return {
    characterTimers: true,
    kingdomWar: false,
    panels: true,
    channels: false,
  };
}

export function defaultGuildConfig(partial?: Partial<GuildConfig>): GuildConfig {
  return {
    enabled: partial?.enabled ?? false,
    ...(partial?.displayName ? { displayName: partial.displayName } : {}),
    modules: { ...defaultGuildModules(), ...(partial?.modules ?? {}) },
    rights: partial?.rights
      ? [...partial.rights]
      : ['technika.config', 'discord.notify', 'discord.panels'],
    ...(partial?.notes ? { notes: partial.notes } : {}),
    ...(partial?.appWebsiteUrl ? { appWebsiteUrl: partial.appWebsiteUrl } : {}),
  };
}


export type MemberActivityConfig = {
  readonly enabled: boolean;
  readonly guildId: string;
  readonly memberRoleIds: readonly string[];
  readonly windowDays: number;
  readonly topN: number;
};

export type PublishChannelPurpose =
  | 'centrumHub'
  | 'notifications'
  | 'dungeons'
  | 'trade'
  | 'recurring'
  | 'events'
  | 'website';



export type SeedReactionRole = 'decorative' | 'rsvp_yes' | 'rsvp_no' | 'rsvp_maybe' | 'count';

export type SeedReaction = {
  readonly emoji: string;
  readonly role: SeedReactionRole;
  readonly label?: string;
};

export type RecurringSchedule = {
  readonly mode: 'daily' | 'weekly' | 'days';
  readonly daysOfWeek: readonly number[];
  readonly timeWarsaw: string;
  readonly horizonDays: number;
};

export type RecurringPostRules = {
  readonly maxSlots?: number | null;
  readonly closeAt?: 'none' | 'at_start' | 'manual';
  readonly whoCanReact: 'everyone' | 'roles';
  readonly roleIds?: readonly string[];
};

/** Exact New Bot recurringPosts object (config-only; no scheduler runtime).
 * content placeholders `{{count:EMOJI}}` / `{{rsvp_list}}` resolved at publish/scheduler time.
 */
export type RecurringPostsConfig = {
  readonly enabled: boolean;
  readonly title: string;
  /** May include {{count:✅}} / {{rsvp_list}} — not resolved at draft save. */
  readonly content: string;
  readonly schedule: RecurringSchedule;
  readonly channelId: string;
  readonly seedReactions: readonly SeedReaction[];
  readonly showCountsInPost: boolean;
  readonly rsvpEnabled: boolean;
  readonly rules: RecurringPostRules;
};

/** purpose -> channelId map (not a bare allowlist). */
export type PublishChannelsMap = Readonly<Partial<Record<PublishChannelPurpose, string>>>;

export type BotConfigValues = {
  readonly 'panel-test-enabled': boolean;
  readonly 'notify-timer-enabled': boolean;
  readonly timersNotify: TimersNotifyConfig;
  readonly characterTimers: CharacterTimersConfig;
  readonly kingdomWar: KingdomWarConfig;
  readonly 'notify-timer-dm-action-buttons': boolean;
  readonly guilds: GuildsMap;
  readonly memberActivity: MemberActivityConfig;
  readonly publishChannels: PublishChannelsMap;
  readonly recurringPosts: RecurringPostsConfig;
};

export function defaultTimersNotify(): TimersNotifyConfig {
  return { ...CHARACTER_TIMERS_DEFAULT };
}

export function defaultCharacterTimers(): CharacterTimersConfig {
  return { ...CHARACTER_TIMERS_DEFAULT };
}


export function defaultMemberActivity(): MemberActivityConfig {
  return {
    enabled: true,
    guildId: '1543972927719080016',
    memberRoleIds: [],
    windowDays: 7,
    topN: 10,
  };
}

export function defaultPublishChannels(): PublishChannelsMap {
  return {};
}

export function defaultRecurringPosts(): RecurringPostsConfig {
  return {
    enabled: false,
    title: '',
    content: '',
    schedule: {
      mode: 'weekly',
      daysOfWeek: [1, 3, 5],
      timeWarsaw: '18:00',
      horizonDays: 90,
    },
    channelId: '',
    seedReactions: [],
    showCountsInPost: false,
    rsvpEnabled: false,
    rules: { whoCanReact: 'everyone', closeAt: 'none' },
  };
}


export function defaultKingdomWar(): KingdomWarConfig {
  return {
    enabled: false,
    warAt: '18:00',
    notifyMinutesBefore: 30,
    maxClaimsPerUser: 3,
    messageTemplate:
      '**DESTILED · Wojna Królestw**\nZa {{notifyMinutesBefore}} min start ({{warAt}} Europe/Warsaw).',
  };
}

export function defaultBotConfigValues(): BotConfigValues {
  const timers = defaultCharacterTimers();
  return {
    'panel-test-enabled': true,
    'notify-timer-enabled': true,
    timersNotify: timers,
    characterTimers: timers,
    kingdomWar: defaultKingdomWar(),
    'notify-timer-dm-action-buttons': true,
    guilds: {},
    memberActivity: defaultMemberActivity(),
    publishChannels: defaultPublishChannels(),
    recurringPosts: defaultRecurringPosts(),
  };
}

/** Prefer characterTimers; fall back to timersNotify (alias). */
export function resolveCharacterTimersConfig(config: BotConfigValues): CharacterTimersConfig {
  return config.characterTimers ?? config.timersNotify;
}

export function listCapabilitiesForApi(strictGuildIsolation: boolean): {
  readonly capabilities: ReadonlyArray<Record<string, unknown>>;
} {
  const HIDDEN_FROM_TECHNIKA = new Set([
    'notify-timer-dm-action-buttons', // map-hunt era; character timer buttons always on when module enabled
  ]);
  return {
    capabilities: BOT_CAPABILITIES.filter((cap) => !HIDDEN_FROM_TECHNIKA.has(cap.id)).map((cap) => {
      const base: Record<string, unknown> = {
        id: cap.id,
        title: cap.title,
        description: cap.description,
        valueType: cap.valueType,
        default: cap.default,
      };
      if ('fields' in cap && cap.fields) {
        base.fields = cap.fields;
      }
      if ('readOnly' in cap && cap.readOnly) {
        base.readOnly = true;
      }
      if (cap.id === 'strict-guild-isolation') {
        base.readOnly = true;
        base.currentDisplayValue = strictGuildIsolation;
      }
      return base;
    }),
  };
}
