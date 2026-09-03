import { describe, expect, it } from 'vitest';

import {
  biologistProgressLabel,
  biologistQuestById,
  horseAdvanceDetail,
  progressionKindsForLevel,
  projectHardBiologistQuests,
  projectHardHorseRules,
  projectHardProductFacts,
  projectHardSkillBookRules,
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

  it('encodes unlock levels for cyclical PH timers', () => {
    expect(progressionKindsForLevel(19)).toEqual(['skill_book']);
    expect(progressionKindsForLevel(20)).toEqual(['skill_book', 'horse']);
    expect(progressionKindsForLevel(30)).toEqual(['skill_book', 'horse', 'biologist']);
    expect(projectHardSkillBookRules.dailyReset).toBe('midnight');
    expect(projectHardProductFacts.hasAlchemy).toBe(false);
    expect(projectHardProductFacts.hasSashes).toBe(false);
    expect(projectHardProductFacts.maxCharacterLevel).toBe(99);
  });
});
