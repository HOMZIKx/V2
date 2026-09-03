/**
 * Project Hard progression — from official presentation
 * https://projekt-hard.eu/presentation?lang=en (PL mirror requires login).
 *
 * Timer configuration for private team workspace. Not live game telemetry.
 * Polish item names match Metin2 PL wiki / dobry-temat catalog where available.
 */

export type ProgressionKind = 'biologist' | 'horse' | 'skill_book';

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

export function biologistQuestById(id: string): BiologistQuestDef | null {
  return projectHardBiologistQuests.find((quest) => quest.id === id) ?? null;
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
