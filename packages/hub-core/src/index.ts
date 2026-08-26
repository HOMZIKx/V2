export {
  DEFAULT_HUB_MODULES,
  HUB_CENTRUM_ACTION_KEYS,
  HUB_CENTRUM_SECTION_LABELS,
  HUB_CENTRUM_SELECT_OPTIONS,
  HUB_GROUP_LABELS,
  HUB_MODULE_AVAILABILITIES,
  HUB_MODULE_GROUPS,
  HUB_MODULE_KEYS,
  getHubModule,
  isHubCentrumActionKey,
  isHubModuleInteractive,
  isHubModuleKey,
  listHubCentrumSelectOptions,
  listHubModulesForSelect,
  listRoadmapModuleLabels,
  type HubCentrumActionKey,
  type HubCentrumSelectOption,
  type HubDiscordEntry,
  type HubModuleAvailability,
  type HubModuleDefinition,
  type HubModuleGroup,
  type HubModuleKey,
  type HubWwwEntry,
} from './module-registry.js';

export {
  DeepLinkSchema,
  formatDeepLink,
  parseDeepLink,
  wwwPathForDeepLink,
  type DeepLink,
} from './deep-link.js';

export {
  DEFAULT_CLASS_SPEC_CATALOG,
  FORBIDDEN_PLAYER_CLASS_SPEC_LABELS,
  PLAYER_FACING_CLASS_SPEC_LABELS,
  listEnabledClassSpecs,
  resolveClassSpecLabel as resolveHubClassSpecLabel,
  type ClassSpecCatalogEntry,
} from './catalogs/class-spec.js';

export {
  DEFAULT_PARTY_ROLE_CATALOG,
  PARTY_ROLE_KEYS,
  isPartyRoleKey,
  type PartyRoleCatalogEntry,
  type PartyRoleKey,
} from './catalogs/party-role.js';

export { DEFAULT_INTEREST_CATALOG, type InterestCatalogEntry } from './catalogs/interests.js';

export {
  CHANNEL_RETIREMENT_STATUSES,
  canOwnerRetireChannel,
  type ChannelRetirementStatus,
  type LegacyChannelRecord,
} from './channel-retirement.js';

export { HUB_SYNC_RULES, type HubSyncRules } from './sync-rules.js';

export {
  isLfgIntentActive,
  listEligibleJoinRoles,
  normalizeSessionRoles,
  pickDeterministicJoinRole,
  rankLfgMatch,
  type LfgGroupMatchInput,
  type LfgIntent,
  type LfgMatchRank,
  type LfgRoleNeed,
  type LfgSeekerInput,
} from './lfg-matching.js';

export {
  LFG_DUNGEON_ACTIVITY_TYPES,
  buildLfgMatchFingerprint,
  deriveIntentExpiresAt,
  formatLfgMatchReason,
  formatLfgRoleNeedSummary,
  type LfgMatchFingerprintInput,
} from './lfg-v1.js';

export { isValidOpaqueId, opaqueIdFromUuid } from './opaque-id.js';
