/**
 * Discord / WWW synchronization baseline for Hub-visible state.
 */

export const HUB_SYNC_RULES = {
  /** Backend state is Source of Truth. */
  sourceOfTruth: 'backend' as const,
  /**
   * Normal product/config changes must not require Owner manual /sync, /publish,
   * restart, or redeploy for Hub projection updates.
   */
  normalManualSyncSteps: 0,
  /** Personalized member data must not be projected into the public Hub channel. */
  publicHubAllowsPersonalizedData: false,
  /** Surfaces share module keys, profile, interests, Moje, Dla mnie. */
  equalMemberSurfaces: ['discord', 'www'] as const,
} as const;

export type HubSyncRules = typeof HUB_SYNC_RULES;
