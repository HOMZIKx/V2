import { describe, expect, it } from 'vitest';

import {
  biologistProgressLabel,
  biologistQuestById,
  horseAdvanceDetail,
  inferProgressionKind,
  progressionKindsForLevel,
  progressionTimerIcons,
  progressionTimerLabels,
  projectHardBiologistQuests,
  projectHardExtraReadingRules,
  projectHardHorseRules,
  projectHardProductFacts,
  projectHardProgressionCycles,
  projectHardSkillBookRules,
  projectHardSoulStoneRules,
} from './project-hard-progression';

describe('project hard progression config', () => {
  it('keeps official biologist counts and success-only cooldown for first three', () => {
    expect(projectHardBiologistQuests).toHaveLength(10);
    const firstThree = projectHardBiologistQuests.slice(0, 3);
    expect(firstThree.every((quest) => quest.cooldownOnlyOnSuccess)).toBe(true);
    expect(projectHardBiologistQuests.slice(3).every((quest) => !quest.cooldownOnlyOnSuccess)).toBe(
      true,
    );
    const demon = biologistQuestById('demon-keepsake');
    expect(demon?.itemName).toBe('Pamiątka Po Demonie');
    expect(demon?.deliveriesRequired).toBe(15);
    expect(biologistProgressLabel(demon!, 6)).toBe('Pamiątka Po Demonie · 6/15');
  });

  it('encodes 23h horse advancement and medal material at level 12→13', () => {
    expect(projectHardHorseRules.advancementCooldownHours).toBe(23);
    expect(projectHardHorseRules.maxRidingLevel).toBe(61);
    expect(horseAdvanceDetail(12, 13)).toContain('Medal Konny ×5');
    expect(horseAdvanceDetail(12, 13)).toContain('23 h');
  });

  it('tracks reading families plus level-gated combo/horse/biologist cycles', () => {
    expect(progressionKindsForLevel(19)).toEqual([
      'skill_book',
      'soul_stone',
      'leadership',
      'polymorph',
      'mining',
    ]);
    expect(progressionKindsForLevel(20)).toEqual([
      'skill_book',
      'soul_stone',
      'leadership',
      'polymorph',
      'mining',
      'horse',
    ]);
    expect(progressionKindsForLevel(30)).toEqual([
      'skill_book',
      'soul_stone',
      'leadership',
      'polymorph',
      'mining',
      'combo',
      'horse',
      'biologist',
    ]);
    expect(projectHardProgressionCycles).toHaveLength(8);
    expect(projectHardSkillBookRules.dailyReset).toBe('midnight');
    expect(projectHardSoulStoneRules.dailyReset).toBe('midnight');
    expect(projectHardExtraReadingRules.dailyReset).toBe('midnight');
    expect(projectHardExtraReadingRules.families).toContain('combo');
    expect(projectHardSoulStoneRules.purpose).toContain('P');
    expect(progressionTimerLabels.soul_stone).toBe('Kamień duszy');
    expect(progressionTimerLabels.leadership).toBe('Dowodzenie');
    expect(progressionTimerLabels.polymorph).toBe('Polimorfia');
    expect(progressionTimerLabels.mining).toBe('Górnictwo');
    expect(progressionTimerLabels.combo).toBe('Combo');
    expect(progressionTimerIcons.skill_book).toContain('skill-book');
    expect(progressionTimerIcons.soul_stone).toContain('soul-stone');
    expect(progressionTimerIcons.leadership).toContain('leadership');
    expect(progressionTimerIcons.polymorph).toContain('polymorph');
    expect(progressionTimerIcons.mining).toContain('mining');
    expect(progressionTimerIcons.combo).toContain('combo');
    expect(progressionTimerIcons.biologist).toContain('biologist');
    expect(progressionTimerIcons.horse).toContain('horse-medal');
    expect(inferProgressionKind('Kamień duszy')).toBe('soul_stone');
    expect(inferProgressionKind('Dowodzenie')).toBe('leadership');
    expect(inferProgressionKind('Polimorfia')).toBe('polymorph');
    expect(inferProgressionKind('Górnictwo')).toBe('mining');
    expect(inferProgressionKind('Combo')).toBe('combo');
    expect(projectHardProductFacts.hasAlchemy).toBe(false);
    expect(projectHardProductFacts.hasSashes).toBe(false);
    expect(projectHardProductFacts.maxCharacterLevel).toBe(99);
  });
});
