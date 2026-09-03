/**
 * Project Hard progression — from official presentation
 * https://projekt-hard.eu/presentation?lang=en (PL mirror requires login).
 *
 * Timer configuration for private team workspace. Not live game telemetry.
 * Polish item names match Metin2 PL wiki / dobry-temat catalog where available.
 */

export type ProgressionKind =
  'skill_book' | 'soul_stone' | 'leadership' | 'polymorph' | 'mining' | 'horse' | 'biologist';

export type ProgressionReset = 'midnight' | 'hours_23';

export interface ProgressionCycleDef {
  readonly kind: ProgressionKind;
  readonly label: string;
  readonly iconPath: string;
  readonly reset: ProgressionReset;
  /** Always tracked reading/turn-in families vs level-gated ones. */
  readonly alwaysTracked: boolean;
  readonly unlockLevel: number | null;
  readonly detailReady: string;
  readonly remainingReady: string;
  readonly doneHint: string;
}

export interface BiologistQuestDef {
  readonly id: string;
  readonly itemName: string;
  readonly minLevel: number;
  readonly deliveriesRequired: number;
  /** First three: cooldown only after successful turn-in (Project Hard QoL). */
  readonly cooldownOnlyOnSuccess: boolean;
  readonly rewardSummary: string;
}

export interface HorseRankDef {
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly characterLevelRequired: number;
  readonly materialName: string;
  readonly materialCount: number;
  readonly note: string;
}

/** Biologist table from Project Hard presentation. Resets at midnight. */
export const projectHardBiologistQuests: readonly BiologistQuestDef[] = [
  {
    id: 'orc-tooth',
    itemName: 'Ząb Orka',
    minLevel: 30,
    deliveriesRequired: 10,
    cooldownOnlyOnSuccess: true,
    rewardSummary: 'Szybkość ruchu +10%',
  },
  {
    id: 'curse-book',
    itemName: 'Księga Klątw',
    minLevel: 40,
    deliveriesRequired: 15,
    cooldownOnlyOnSuccess: true,
    rewardSummary: 'Szybkość ataku +5%',
  },
  {
    id: 'demon-keepsake',
    itemName: 'Pamiątka Po Demonie',
    minLevel: 50,
    deliveriesRequired: 15,
    cooldownOnlyOnSuccess: true,
    rewardSummary: 'Obrona +60',
  },
  {
    id: 'dull-ice',
    itemName: 'Matowy Lód',
    minLevel: 60,
    deliveriesRequired: 20,
    cooldownOnlyOnSuccess: false,
    rewardSummary: 'Wartość ataku +50',
  },
  {
    id: 'zelkova',
    itemName: 'Konar Zelkova',
    minLevel: 70,
    deliveriesRequired: 25,
    cooldownOnlyOnSuccess: false,
    rewardSummary: 'Odporność na potwory +10%',
  },
  {
    id: 'tuygis',
    itemName: 'Certyfikat Tuygisa',
    minLevel: 80,
    deliveriesRequired: 30,
    cooldownOnlyOnSuccess: false,
    rewardSummary: 'Wartość mag. ataku +75 · Wartość ataku +50',
  },
  {
    id: 'red-branch',
    itemName: 'Czerw. Konar Duchodrzewa',
    minLevel: 85,
    deliveriesRequired: 40,
    cooldownOnlyOnSuccess: false,
    rewardSummary: 'Odporność na klasy +10%',
  },
  {
    id: 'leader-note',
    itemName: 'Notatka Przywódcy',
    minLevel: 90,
    deliveriesRequired: 50,
    cooldownOnlyOnSuccess: false,
    rewardSummary: 'Silny przeciwko klasom +10% · Szansa na blok +5%',
  },
  {
    id: 'envy-gem',
    itemName: 'Klejnot Zawiści',
    minLevel: 92,
    deliveriesRequired: 30,
    cooldownOnlyOnSuccess: false,
    rewardSummary: 'Wartość mag. ataku +75 · Wartość ataku +50',
  },
  {
    id: 'wisdom-gem',
    itemName: 'Klejnot Mądrości',
    minLevel: 94,
    deliveriesRequired: 40,
    cooldownOnlyOnSuccess: false,
    rewardSummary: 'Max PŻ +1500',
  },
];

/**
 * Riding advancement from Project Hard presentation.
 * Cooldown between upgrades: 23 h. Max riding level: 61.
 * Medals: Monkey Dungeons or level-30 expedition boss (low chance).
 */
export const projectHardHorseRules = {
  maxRidingLevel: 61,
  advancementCooldownHours: 23,
  medalSources: 'Lochy Małp lub wyprawa 30 lvl (niska szansa na Medal Konny)',
  ranks: [
    {
      fromLevel: 1,
      toLevel: 10,
      characterLevelRequired: 20,
      materialName: 'Medal Konny',
      materialCount: 1,
      note: 'Odblokowanie zwykłego konia',
    },
    {
      fromLevel: 11,
      toLevel: 11,
      characterLevelRequired: 35,
      materialName: 'Medal Konny',
      materialCount: 1,
      note: 'Atak z konia · misja konia bojowego',
    },
    {
      fromLevel: 12,
      toLevel: 19,
      characterLevelRequired: 35,
      materialName: 'Medal Konny',
      materialCount: 5,
      note: 'Droga do konia militarnego',
    },
    {
      fromLevel: 20,
      toLevel: 20,
      characterLevelRequired: 35,
      materialName: 'Medal Konny',
      materialCount: 5,
      note: '+10 wartości ataku (także poza koniem)',
    },
    {
      fromLevel: 21,
      toLevel: 21,
      characterLevelRequired: 50,
      materialName: 'Medal Konny',
      materialCount: 5,
      note: 'Misja konia militarnego',
    },
    {
      fromLevel: 22,
      toLevel: 44,
      characterLevelRequired: 50,
      materialName: 'Certyfikat Konny',
      materialCount: 1,
      note: 'Dalsze etapy konia militarnego',
    },
    {
      fromLevel: 45,
      toLevel: 45,
      characterLevelRequired: 75,
      materialName: '—',
      materialCount: 0,
      note: 'Awans · +20 wartości ataku',
    },
    {
      fromLevel: 46,
      toLevel: 54,
      characterLevelRequired: 75,
      materialName: 'Order Konny',
      materialCount: 1,
      note: 'Dalsze etapy',
    },
    {
      fromLevel: 55,
      toLevel: 55,
      characterLevelRequired: 75,
      materialName: '—',
      materialCount: 0,
      note: 'Awans · +30 wartości ataku',
    },
    {
      fromLevel: 56,
      toLevel: 60,
      characterLevelRequired: 85,
      materialName: 'Wzmocnione Zioła Konne',
      materialCount: 1,
      note: 'Dalsze etapy',
    },
    {
      fromLevel: 61,
      toLevel: 61,
      characterLevelRequired: 85,
      materialName: 'Wzmocnione Zioła Konne',
      materialCount: 1,
      note: '+50 wartości ataku',
    },
  ] as const satisfies readonly HorseRankDef[],
};

/** Skill books: readable any time; daily limit resets at midnight (same as Biolog). */
export const projectHardSkillBookRules = {
  readableAnytime: true,
  dailyReset: 'midnight' as const,
  sources: 'wyprawy, bossy, szkatułki, drop z potworów',
};

/**
 * Soul Stones (Kamienie duszy / duchowe) — mastery toward Perfect (P).
 * Same midnight reading cadence as Skill Books on Project Hard.
 */
export const projectHardSoulStoneRules = {
  readableAnytime: true,
  dailyReset: 'midnight' as const,
  purpose: 'mistrzostwo umiejętności do stopnia P (pasywne / Perfect)',
  sources: 'metiny, bossy, potwory, skrzynie',
} as const;

/**
 * Extra reading families called out by Project Hard presentation + classic Metin2.
 * On PH all book reads reset together at midnight (same clock as Biolog).
 */
export const projectHardExtraReadingRules = {
  dailyReset: 'midnight' as const,
  sources: 'wyprawy, bossy, skrzynie, drop alternatywny z potworów',
  families: ['leadership', 'polymorph', 'mining'] as const,
} as const;

/** Horse upgrades unlock at character level 20 (Stableman). */
export const projectHardHorseUnlockLevel = 20;

/** Biologist quests start at level 30. */
export const projectHardBiologistUnlockLevel = 30;

/**
 * Full PH cyclical board: reading families + horse turn-in + biologist.
 * Reading rows are separate so the team can track each passive/book family,
 * even though PH resets them on the same midnight clock.
 */
export const projectHardProgressionCycles: readonly ProgressionCycleDef[] = [
  {
    kind: 'skill_book',
    label: 'Księga umiejętności',
    iconPath: '/game/progression/skill-book.png',
    reset: 'midnight',
    alwaysTracked: true,
    unlockLevel: null,
    detailReady: 'Czytanie ksiąg do G1 · limit czytań resetuje się o północy',
    remainingReady: 'gotowe do czytania',
    doneHint: 'Księga: limit czytań resetuje się o północy.',
  },
  {
    kind: 'soul_stone',
    label: 'Kamień duszy',
    iconPath: '/game/progression/soul-stone.png',
    reset: 'midnight',
    alwaysTracked: true,
    unlockLevel: null,
    detailReady:
      'Czytanie kamieni duchowych do P (umiejętności pasywne / Perfect) · limit resetuje się o północy',
    remainingReady: 'gotowe do czytania',
    doneHint: 'Kamień duszy: limit czytań (mistrzostwo P) resetuje się o północy.',
  },
  {
    kind: 'leadership',
    label: 'Dowodzenie',
    iconPath: '/game/progression/leadership.png',
    reset: 'midnight',
    alwaysTracked: true,
    unlockLevel: null,
    detailReady:
      'Sun Zi / Wu Zi / WeiLiao Zi · czytanie pasywki party · limit resetuje się o północy',
    remainingReady: 'gotowe do czytania',
    doneHint: 'Dowodzenie: limit czytań resetuje się o północy.',
  },
  {
    kind: 'polymorph',
    label: 'Polimorfia',
    iconPath: '/game/progression/polymorph.png',
    reset: 'midnight',
    alwaysTracked: true,
    unlockLevel: null,
    detailReady:
      'Księgi polimorfii (zwykła / zaaw. / mistrz.) · czas przemiany · limit resetuje się o północy',
    remainingReady: 'gotowe do czytania',
    doneHint: 'Polimorfia: limit czytań resetuje się o północy.',
  },
  {
    kind: 'mining',
    label: 'Górnictwo',
    iconPath: '/game/progression/mining.png',
    reset: 'midnight',
    alwaysTracked: true,
    unlockLevel: null,
    detailReady: 'Przewodnik do górnictwa · kopanie rud · limit czytań resetuje się o północy',
    remainingReady: 'gotowe do czytania',
    doneHint: 'Górnictwo: limit czytań resetuje się o północy.',
  },
  {
    kind: 'horse',
    label: 'Jazda konna',
    iconPath: '/game/progression/horse-medal.png',
    reset: 'hours_23',
    alwaysTracked: false,
    unlockLevel: projectHardHorseUnlockLevel,
    detailReady: 'Oddanie Medalu / materiałów u Stajennego · cooldown 23 h',
    remainingReady: 'gotowe do oddania',
    doneHint: `Cooldown jazdy ${projectHardHorseRules.advancementCooldownHours} h (Projekt Hard).`,
  },
  {
    kind: 'biologist',
    label: 'Biolog',
    iconPath: '/game/progression/biologist.png',
    reset: 'midnight',
    alwaysTracked: false,
    unlockLevel: projectHardBiologistUnlockLevel,
    detailReady: 'Oddawanie u biologa Chaegiraba · reset o północy',
    remainingReady: 'gotowe do oddania',
    doneHint: 'Biolog: kolejna dostawa od północy.',
  },
];

export const progressionTimerIcons: Readonly<Record<ProgressionKind, string>> = Object.fromEntries(
  projectHardProgressionCycles.map((cycle) => [cycle.kind, cycle.iconPath]),
) as Readonly<Record<ProgressionKind, string>>;

export const progressionTimerLabels: Readonly<Record<ProgressionKind, string>> = Object.fromEntries(
  projectHardProgressionCycles.map((cycle) => [cycle.kind, cycle.label]),
) as Readonly<Record<ProgressionKind, string>>;

export const progressionDisplayOrder: readonly ProgressionKind[] = projectHardProgressionCycles.map(
  (cycle) => cycle.kind,
);

/** Project Hard has no alchemy and no sashes — never invent those systems in copy. */
export const projectHardProductFacts = {
  hasAlchemy: false,
  hasSashes: false,
  maxCharacterLevel: 99,
  serverName: 'Project Hard',
} as const;

export function nextMidnightLabel(now = new Date()): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function nextMidnightIso(now = new Date()): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

export function progressionCycleByKind(kind: ProgressionKind): ProgressionCycleDef {
  const cycle = projectHardProgressionCycles.find((entry) => entry.kind === kind);
  if (!cycle) {
    throw new Error(`Unknown progression kind: ${kind}`);
  }
  return cycle;
}

export function progressionKindsForLevel(level: number | null): readonly ProgressionKind[] {
  return projectHardProgressionCycles
    .filter((cycle) => {
      if (cycle.alwaysTracked) return true;
      if (cycle.unlockLevel === null) return true;
      if (level === null) return cycle.kind === 'horse';
      return level >= cycle.unlockLevel;
    })
    .map((cycle) => cycle.kind);
}

export function biologistQuestById(id: string): BiologistQuestDef | null {
  return projectHardBiologistQuests.find((quest) => quest.id === id) ?? null;
}

/** Highest biologist quest whose minLevel the character already meets. */
export function biologistQuestForLevel(level: number): BiologistQuestDef | null {
  const eligible = projectHardBiologistQuests.filter((quest) => level >= quest.minLevel);
  return eligible.at(-1) ?? null;
}

export function biologistProgressLabel(quest: BiologistQuestDef, delivered: number): string {
  return `${quest.itemName} · ${delivered}/${quest.deliveriesRequired}`;
}

export function horseRankForLevel(ridingLevel: number): HorseRankDef | null {
  return (
    projectHardHorseRules.ranks.find(
      (rank) => ridingLevel >= rank.fromLevel && ridingLevel <= rank.toLevel,
    ) ?? null
  );
}

export function horseAdvanceDetail(fromLevel: number, toLevel: number): string {
  const rank = horseRankForLevel(toLevel);
  if (!rank) {
    return `Jazda ${fromLevel} → ${toLevel} · cooldown ${projectHardHorseRules.advancementCooldownHours} h`;
  }
  const material =
    rank.materialCount > 0
      ? `${rank.materialName} ×${rank.materialCount}`
      : 'bez materiału (misja awansu)';
  return `Jazda ${fromLevel} → ${toLevel} · ${material} · cooldown ${projectHardHorseRules.advancementCooldownHours} h`;
}

export function inferProgressionKind(label: string): ProgressionKind | null {
  const normalized = label.toLocaleLowerCase('pl');
  if (normalized.includes('biolog')) return 'biologist';
  if (normalized.includes('jazd') || normalized.includes('koń') || normalized.includes('konn')) {
    return 'horse';
  }
  if (
    normalized.includes('kamień duszy') ||
    normalized.includes('kamien duszy') ||
    normalized.includes('kamień duch') ||
    normalized.includes('kamien duch') ||
    normalized.includes('soul stone') ||
    normalized.includes('duchow')
  ) {
    return 'soul_stone';
  }
  if (
    normalized.includes('dowodz') ||
    normalized.includes('sun zi') ||
    normalized.includes('leadership')
  ) {
    return 'leadership';
  }
  if (normalized.includes('polimorf') || normalized.includes('polymorph')) return 'polymorph';
  if (
    normalized.includes('górnict') ||
    normalized.includes('gornict') ||
    normalized.includes('kopan') ||
    normalized.includes('mining')
  ) {
    return 'mining';
  }
  if (normalized.includes('księg') || normalized.includes('skill')) return 'skill_book';
  return null;
}

export function isMidnightProgressionKind(kind: ProgressionKind | null): boolean {
  if (!kind) return false;
  return progressionCycleByKind(kind).reset === 'midnight';
}

export function restartAfterDone(
  kind: ProgressionKind | null,
  now = new Date(),
): {
  readonly readyAtIso: string;
  readonly remainingLabel: string;
  readonly detailHint: string;
} {
  if (kind === 'horse') {
    const hours = projectHardHorseRules.advancementCooldownHours;
    return {
      readyAtIso: new Date(now.getTime() + hours * 3_600_000).toISOString(),
      remainingLabel: `${hours} h u Stajennego`,
      detailHint: progressionCycleByKind('horse').doneHint,
    };
  }
  if (kind && isMidnightProgressionKind(kind)) {
    return {
      readyAtIso: nextMidnightIso(now),
      remainingLabel: `do ${nextMidnightLabel(now)}`,
      detailHint: progressionCycleByKind(kind).doneHint,
    };
  }
  return {
    readyAtIso: new Date(now.getTime() + 60 * 60_000).toISOString(),
    remainingLabel: '60 min',
    detailHint: 'Kolejny cykl za 60 minut.',
  };
}
