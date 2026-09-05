import type { CharacterClass } from './character-profile';
import catalogDocument from './data/dobry-temat-item-catalog.json';
import phItemIconMap from './data/ph-item-icon-map.json';
import wikiBonusOverrides from './data/wiki-item-bonus-overrides.json';
import phEquipmentBonusOverrides from './data/ph-equipment-bonus-overrides.json';
import phItemBonusOverrides from './data/ph-item-bonus-overrides.json';
import additionalBonusPoolsDocument from './data/metin2-additional-bonus-pools.json';
import weaponCharacteristicLevels from './data/metin2-weapon-characteristic-levels.json';
import wikiImageMap from './data/wiki-item-image-map.json';
import wikiWeaponCharacteristicLevels from './data/wiki-weapon-characteristic-levels.json';

export type EquipmentSlotId =
  'weapon' | 'armor' | 'helmet' | 'shield' | 'earrings' | 'necklace' | 'bracelet' | 'shoes';

export interface GameItem {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly imagePath: string | null;
  readonly sourceImageUrl: string | null;
  readonly wikiUrl: string | null;
  readonly upgradeDescription: string | null;
}

export const ENHANCEMENT_MIN = 0;
export const ENHANCEMENT_MAX = 9;
export const ENHANCEMENT_LEVELS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

interface LegacyCatalogItem {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly image_url?: string;
  readonly wiki_url?: string;
  readonly wiki_upgrade?: string;
}

const legacy = catalogDocument.items as readonly LegacyCatalogItem[];
const localImages = wikiImageMap as Record<string, string>;
const phIcons = phItemIconMap as Record<string, string>;
const bonusOverrides = wikiBonusOverrides as Record<string, string>;
interface PhEquipmentItemOverlay {
  readonly requiredLevel?: number;
  readonly plus9?: readonly string[];
  readonly sourceItem?: string;
  readonly note?: string;
}

const phBonusDocument = phEquipmentBonusOverrides as {
  readonly rules?: unknown;
  readonly items?: Readonly<Record<string, PhEquipmentItemOverlay>>;
};
const phItemBonusDocument = phItemBonusOverrides as {
  readonly upgradeByTitle?: Readonly<Record<string, string>>;
  readonly requireLevelByTitle?: Readonly<Record<string, number>>;
};
const characteristicWeaponLevels = wikiWeaponCharacteristicLevels as Readonly<Record<string, number>>;

/** Dump wiki_upgrade is often cut at ~201 chars and lacks usable BonusN ladders. */
export function isTruncatedWikiUpgrade(upgrade: string | null | undefined): boolean {
  if (!upgrade || upgrade.trim().length === 0) return true;
  const trimmed = upgrade.trim();
  if (trimmed.includes('…') || trimmed.includes('...')) return true;
  if (trimmed.length >= 200) {
    const hasBonusName = /Bonus\d+(?:-Name)?\s*=\s*(?!\d)/u.test(trimmed);
    const hasBonusValue = /Bonus\d+-\d+\s*=\s*\S/u.test(trimmed);
    if (!hasBonusName || !hasBonusValue) return true;
  }
  return false;
}

function resolveUpgradeDescription(
  title: string,
  dumpUpgrade: string | null | undefined,
): string | null {
  const override = bonusOverrides[title];
  let baseline: string | null = null;
  if (override && override.trim().length > 0) {
    // Wiki baseline (preferred over truncated dump).
    baseline = override;
  } else {
    baseline = dumpUpgrade ?? null;
  }
  // Projekt Hard overlays apply AFTER wiki baseline / wiki-item-bonus-overrides.json.
  const phUpgrade = phItemBonusDocument.upgradeByTitle?.[title];
  if (phUpgrade && phUpgrade.trim().length > 0) return phUpgrade;
  return baseline;
}

export const gameItemCatalog: readonly GameItem[] = legacy.map((item) => {
  const ph = phIcons[item.title] ?? null;
  const local = ph ?? localImages[item.id] ?? null;
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    imagePath: item.image_url ?? null,
    sourceImageUrl: local,
    wikiUrl: item.wiki_url ?? null,
    // Prefer wiki overrides when dobry-temat wiki_upgrade is truncated/unusable.
    upgradeDescription: resolveUpgradeDescription(item.title, item.wiki_upgrade),
  };
});

export const gameItemCategories = [...new Set(gameItemCatalog.map((item) => item.category))].sort(
  (a, b) => a.localeCompare(b, 'pl'),
);

/** Collapse wiki abbreviations ("Zbr. Płyt.") and case for substring search. */
export function normalizeItemSearchText(value: string): string {
  return value
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[./_/\\-]+/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function searchTokenMatches(haystack: string, token: string): boolean {
  if (token.length === 0) return true;
  if (haystack.includes(token)) return true;
  // Polish inflection: "czarna" → stem "czarn" still hits "czarnej stali".
  if (token.length >= 4) {
    const stem = token.slice(0, Math.max(4, token.length - 1));
    if (haystack.includes(stem)) return true;
  }
  return false;
}

/** Token AND match against title + category (abbreviations / diacritics tolerant). */
export function itemMatchesSearchQuery(item: GameItem, query: string): boolean {
  const normalizedQuery = normalizeItemSearchText(query);
  if (normalizedQuery.length === 0) return true;
  const haystack = normalizeItemSearchText(`${item.title} ${item.category}`);
  const tokens = normalizedQuery.split(' ').filter((token) => token.length > 0);
  return tokens.every((token) => searchTokenMatches(haystack, token));
}

export function searchGameItems(query: string, category = 'all'): readonly GameItem[] {
  return gameItemCatalog.filter(
    (item) =>
      (category === 'all' || item.category === category) && itemMatchesSearchQuery(item, query),
  );
}

export function findGameItemByTitle(title: string): GameItem | null {
  const normalized = title.trim().toLocaleLowerCase('pl');
  return gameItemCatalog.find((item) => item.title.toLocaleLowerCase('pl') === normalized) ?? null;
}

/** Resolve catalog definition from a team card name like "Zatruty Miecz +9". */
export function findGameItemByCardName(cardName: string): GameItem | null {
  const trimmed = cardName.trim();
  const exact = findGameItemByTitle(trimmed);
  if (exact) return exact;
  const withoutEnhancement = trimmed.replace(/\s*\+\d+\s*$/u, '').trim();
  if (withoutEnhancement.length > 0 && withoutEnhancement !== trimmed) {
    return findGameItemByTitle(withoutEnhancement);
  }
  return null;
}

export function resolveItemIconPath(
  cardName: string,
  fallback = '/game/items/short-knife.svg',
): string {
  return findGameItemByCardName(cardName)?.sourceImageUrl ?? fallback;
}

/** Map dobry-temat / wiki categories onto EQ board slots. */
export function equipmentSlotForCategory(category: string): EquipmentSlotId | null {
  const value = category.toLocaleLowerCase('pl');
  // Ulepszacze (Amulet Orka itd.) nie są slotami EQ.
  if (
    value.includes('ulepsz') ||
    value.startsWith('amulet') ||
    value.includes('talizman') ||
    value.includes('kamień duszy') ||
    value.includes('kamien duszy') ||
    value.includes('kamienie duszy') ||
    value.includes('pozostałe')
  ) {
    return null;
  }
  if (value.includes('tarcze')) return 'shield';
  if (value.includes('buty')) return 'shoes';
  if (value.includes('kolczy')) return 'earrings';
  if (value.includes('naszyjn')) return 'necklace';
  if (value.includes('bransol')) return 'bracelet';
  if (
    value.includes('hełm') ||
    value.includes('helm') ||
    value.includes('czapka') ||
    value.includes('maska') ||
    value.includes('kaptur') ||
    value.includes('kapelusz')
  ) {
    return 'helmet';
  }
  if (value.includes('zbroj') || value.includes('szata')) return 'armor';
  if (
    value.includes('broń') ||
    value.includes('bron') ||
    value.includes('miecz') ||
    value.includes('sztylet') ||
    value.includes('łuk') ||
    value.includes('luk') ||
    value.includes('dzwon') ||
    value.includes('wachlar') ||
    value.includes('ostrz') ||
    value.includes('glew') ||
    value.includes('halab')
  ) {
    return 'weapon';
  }
  return null;
}

/**
 * Class restriction from official Metin2 wiki + dobry-temat category labels.
 *
 * Shared one-handed swords are stored in the dump under
 * `Ekwipunek — Wojownik — Bronie jednoręczne`, but Gameforge wiki states:
 * "Swords can be used by Warriors, Ninjas and Suras."
 * Two-handed weapons are Warrior-only; Sura blades / Ninja daggers & bows /
 * Shaman bells & fans stay class-exclusive. Jewelry, boots, shields → any.
 *
 * Sources: en-wiki Sura/weapons, Ninja/weapons, Warrior/weapons (Gameforge).
 */
export function compatibleClassesForCategory(
  category: string,
): readonly CharacterClass[] | 'any' | 'none' {
  if (equipmentSlotForCategory(category) === null) return 'none';
  const value = category.toLocaleLowerCase('pl');

  // Explicit weapon families before naive "wojownik/ninja/…" substring checks.
  if (value.includes('bronie jednoręczne (tylko sura)')) return ['sura'];
  if (value.includes('bronie dwuręczne')) return ['warrior'];
  if (value.includes('bronie jednoręczne') && value.includes('wojownik')) {
    return ['warrior', 'ninja', 'sura'];
  }
  if (value.includes('sztylet') || (value.includes('ninja') && value.includes('łuk'))) {
    return ['ninja'];
  }
  if (value.includes('ninja') && value.includes('luk')) return ['ninja'];
  if (value.includes('dzwon') || value.includes('wachlar')) return ['shaman'];

  if (value.includes('wojownik')) return ['warrior'];
  if (value.includes('ninja')) return ['ninja'];
  if (value.includes('sura')) return ['sura'];
  if (value.includes('szaman')) return ['shaman'];
  return 'any';
}

function isTruncatedWikiToken(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return trimmed.includes('…') || trimmed.includes('...');
}

function parseWikiUpgradeFields(upgradeDescription: string): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const part of upgradeDescription.split('|')) {
    const trimmed = part.trim();
    if (trimmed.length === 0 || !trimmed.includes('=')) continue;
    const separator = trimmed.indexOf('=');
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key.length === 0) continue;
    fields[key] = value;
  }
  return fields;
}

function formatCatalogBonusLine(name: string, rawValue: string | null): string {
  if (rawValue === null || rawValue.length === 0) return name;
  const value = rawValue.replace(/\s+/gu, ' ').trim();
  if (value.length === 0) return name;
  if (value.startsWith('+') || value.startsWith('-')) return `${name} ${value}`;
  if (value.endsWith('%')) return `${name} +${value}`;
  if (/^\d/u.test(value)) return `${name} +${value}`;
  return `${name} ${value}`;
}

/**
 * Bonus lines at a given enhancement (+0…+9) from dobry-temat `wiki_upgrade`.
 * Skips truncated wiki dump tokens; never invents missing ladders.
 */
export function bonusesAtEnhancement(
  upgradeDescription: string | null | undefined,
  enhancement: number,
): readonly string[] {
  if (!upgradeDescription || upgradeDescription.trim().length === 0) return [];
  const fields = parseWikiUpgradeFields(upgradeDescription);
  const level = clampEnhancement(enhancement);
  const lines: string[] = [];

  for (let index = 1; index <= 8; index += 1) {
    const named = fields[`Bonus${index}-Name`];
    const altNamed = fields[`Bonus${index}`];
    const name =
      named !== undefined && !isTruncatedWikiToken(named)
        ? named
        : altNamed !== undefined && !isTruncatedWikiToken(altNamed)
          ? altNamed
          : null;
    if (name === null) continue;

    let rawValue: string | null = null;
    for (let step = level; step >= ENHANCEMENT_MIN; step -= 1) {
      const candidate = fields[`Bonus${index}-${step}`];
      if (candidate !== undefined && !isTruncatedWikiToken(candidate) && candidate.length > 0) {
        rawValue = candidate;
        break;
      }
    }
    lines.push(formatCatalogBonusLine(name, rawValue));
  }
  return lines;
}

/**
 * Bonus names seen in the dobry-temat dump (non-truncated).
 * Used for picker UI — never invents names beyond the catalog.
 */
export function knownCatalogBonusNames(): readonly string[] {
  const names = new Set<string>();
  for (const item of gameItemCatalog) {
    if (!item.upgradeDescription) continue;
    const fields = parseWikiUpgradeFields(item.upgradeDescription);
    for (let index = 1; index <= 8; index += 1) {
      for (const key of [`Bonus${index}-Name`, `Bonus${index}`] as const) {
        const value = fields[key];
        if (value && !isTruncatedWikiToken(value)) names.add(value.trim());
      }
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right, 'pl'));
}

export interface CatalogBonusEntry {
  readonly name: string;
  /** Value at the requested enhancement level, or null when not in dump. */
  readonly valueAtLevel: string | null;
  /** Formatted full line, e.g. "Obrona +57". */
  readonly line: string;
}

function shouldUsePhPlus9Snapshot(cardName: string, enhancement: number): boolean {
  const level = clampEnhancement(enhancement);
  return level === ENHANCEMENT_MAX || parseEnhancementFromName(cardName) === ENHANCEMENT_MAX;
}

/**
 * Returns per-bonus entries for a given item at a specific enhancement.
 * At +9, prefers PH presentation plus9 snapshot over the wiki ladder when present.
 * For +0..+8 keeps wiki / dump ladders (PH only documents +9).
 * Used for the bonus picker — user sees "Obrona +57" and confirms.
 */
function lookupPhEquipmentItem(cardName: string): PhEquipmentItemOverlay | null {
  const base = stripEnhancementFromName(cardName);
  const items = phBonusDocument.items;
  if (!items) return null;
  const direct = items[base];
  if (direct) {
    if (Array.isArray(direct)) return { plus9: direct };
    return direct;
  }
  const normalized = base.toLocaleLowerCase('pl');
  for (const [title, entry] of Object.entries(items)) {
    if (title.toLocaleLowerCase('pl') !== normalized) continue;
    if (Array.isArray(entry)) return { plus9: entry };
    return entry;
  }
  return null;
}

function catalogEntriesFromPhPlus9(lines: readonly string[]): readonly CatalogBonusEntry[] {
  return lines.map((line) => {
    const trimmed = line.trim();
    const leadingPercent = trimmed.match(/^(\d+%)\s+(.+)$/u);
    if (leadingPercent?.[1] && leadingPercent[2]) {
      return {
        name: leadingPercent[2].trim(),
        valueAtLevel: leadingPercent[1],
        line: trimmed,
      };
    }
    const trailing = trimmed.match(
      /^(.+?)\s+([+-]?\d+(?:[.,]\d+)?(?:\s*[-–]\s*[+-]?\d+(?:[.,]\d+)?)?%?|\+?\d+\s*s)$/u,
    );
    if (trailing?.[1] && trailing[2]) {
      return {
        name: trailing[1].trim(),
        valueAtLevel: trailing[2].trim(),
        line: trimmed,
      };
    }
    return { name: trimmed, valueAtLevel: null, line: trimmed };
  });
}

/**
 * Returns per-bonus entries for a given item at a specific enhancement.
 * At +9, prefer PH presentation plus9 lines when present (Projekt Hard overlay).
 * Otherwise uses wiki/dump ladders. Never invents missing values.
 */
export function catalogBonusEntriesForItem(
  cardName: string,
  enhancement: number,
): readonly CatalogBonusEntry[] {
  const level = clampEnhancement(enhancement);
  if (shouldUsePhPlus9Snapshot(cardName, enhancement)) {
    const plus9 = phPlus9Lines(cardName);
    if (plus9.length > 0) {
      return catalogEntriesFromPhPlus9(plus9);
    }
  }

  const item = findGameItemByCardName(cardName);
  if (!item?.upgradeDescription) return [];
  const fields = parseWikiUpgradeFields(item.upgradeDescription);
  const entries: CatalogBonusEntry[] = [];

  for (let index = 1; index <= 8; index += 1) {
    const named = fields[`Bonus${index}-Name`];
    const altNamed = fields[`Bonus${index}`];
    const name =
      named !== undefined && !isTruncatedWikiToken(named)
        ? named
        : altNamed !== undefined && !isTruncatedWikiToken(altNamed)
          ? altNamed
          : null;
    if (name === null) continue;

    let rawValue: string | null = null;
    for (let step = level; step >= ENHANCEMENT_MIN; step -= 1) {
      const candidate = fields[`Bonus${index}-${step}`];
      if (candidate !== undefined && !isTruncatedWikiToken(candidate) && candidate.length > 0) {
        rawValue = candidate;
        break;
      }
    }
    if (rawValue === null) continue;
    const line = formatCatalogBonusLine(name, rawValue);
    entries.push({ name, valueAtLevel: rawValue, line });
  }
  return entries;
}



interface WeaponCharacteristicLevelsDocument {
  readonly byTitle: Readonly<Record<string, number>>;
  readonly phPresentation?: {
    readonly pvmAttackFromLevelExclusive?: number;
  };
}

const weaponLevelsDoc = weaponCharacteristicLevels as WeaponCharacteristicLevelsDocument;

export const AVERAGE_DAMAGE_MIN = -60;
export const AVERAGE_DAMAGE_MAX = 60;
export const SKILL_DAMAGE_MIN = -30;
export const SKILL_DAMAGE_MAX = 30;

/** Required weapon level from wiki map (30 / 75 / …), or null when unknown. */
export function weaponRequiredLevel(cardName: string): number | null {
  const base = stripEnhancementFromName(cardName);
  const fromItemMap = phItemBonusDocument.requireLevelByTitle?.[base];
  if (typeof fromItemMap === 'number') return fromItemMap;
  const normalized = base.toLocaleLowerCase('pl');
  for (const [title, level] of Object.entries(phItemBonusDocument.requireLevelByTitle ?? {})) {
    if (title.toLocaleLowerCase('pl') === normalized) return level;
  }
  const phLevel = phRequiredLevel(cardName);
  if (typeof phLevel === 'number') return phLevel;
  const exact = weaponLevelsDoc.byTitle[base];
  if (typeof exact === 'number') return exact;
  for (const [title, level] of Object.entries(weaponLevelsDoc.byTitle)) {
    if (title.toLocaleLowerCase('pl') === normalized) return level;
  }
  return null;
}

/** Official Metin2: Średnie Obrażenia + Obrażenia Umiejętności on weapons level 30 and 75. */
export function weaponHasAverageSkillDamage(cardName: string): boolean {
  const level = weaponRequiredLevel(cardName);
  return level === 30 || level === 75;
}

/**
 * PH presentation: weapons above level 25 include Attack Value PvM / Magic Attack Value PvM.
 * No invented numeric ladder — callers may persist observed values only.
 */
export function weaponHasPhPvmAttackBonuses(cardName: string): boolean {
  const level = weaponRequiredLevel(cardName);
  const threshold = weaponLevelsDoc.phPresentation?.pvmAttackFromLevelExclusive ?? 25;
  return level !== null && level > threshold;
}

export function clampAverageDamagePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(AVERAGE_DAMAGE_MAX, Math.max(AVERAGE_DAMAGE_MIN, Math.trunc(value)));
}

export function clampSkillDamagePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(SKILL_DAMAGE_MAX, Math.max(SKILL_DAMAGE_MIN, Math.trunc(value)));
}

/**
 * Max additional (Zaczarowanie) lines is always 5.
 * For weapons lvl 30/75, Średnie Obrażenia / Obrażenia Umiejętności are normal additional
 * kinds that consume 1–2 of those 5 slots when set.
 */
export function maxAdditionalBonusesForItem(_cardName?: string, _slot?: EquipmentSlotId): number {
  void _cardName;
  void _slot;
  return 5;
}

export const MAX_ADDITIONAL_ITEM_BONUSES = 5;

interface AdditionalBonusPoolSection {
  readonly title: string;
  readonly bonuses: readonly string[];
}

interface AdditionalBonusPool {
  readonly id: string;
  readonly label: string;
  readonly sections: readonly AdditionalBonusPoolSection[];
}

interface AdditionalBonusPoolsDocument {
  readonly maxAdditionalBonuses: number;
  readonly slotToPoolId: Readonly<Record<string, string>>;
  readonly pools: readonly AdditionalBonusPool[];
}

const additionalBonusPools = additionalBonusPoolsDocument as AdditionalBonusPoolsDocument;

export interface SplitItemBonuses {
  /** Built-in upgrade ladder lines from catalog (+N). Not user-editable. */
  readonly builtin: readonly string[];
  /** Extra 1–5 Zaczarowanie lines stored on the card. */
  readonly additional: readonly string[];
}

/**
 * Split stored card lines into catalog builtins vs user additional bonuses.
 * Builtins always come from the dump/overrides ladder when available.
 */
export function splitItemBonuses(
  cardName: string,
  enhancement: number,
  storedBonuses: readonly string[],
): SplitItemBonuses {
  const builtin = catalogBonusEntriesForItem(cardName, enhancement).map((entry) => entry.line);
  if (builtin.length === 0) {
    // No ladder in dump — treat everything currently stored as additional (editable).
    return { builtin: [], additional: storedBonuses };
  }
  const builtinSet = new Set(builtin);
  const additional = storedBonuses.filter((line) => !builtinSet.has(line));
  return { builtin, additional };
}

/** Display order: locked builtins first, then additional. */
export function displayItemBonuses(
  cardName: string,
  enhancement: number,
  storedBonuses: readonly string[],
): readonly string[] {
  const { builtin, additional } = splitItemBonuses(cardName, enhancement, storedBonuses);
  if (builtin.length === 0) return additional;
  return [...builtin, ...additional];
}

export function additionalBonusPoolForSlot(slot: EquipmentSlotId): AdditionalBonusPool | null {
  const poolId = additionalBonusPools.slotToPoolId[slot];
  if (!poolId) return null;
  return additionalBonusPools.pools.find((pool) => pool.id === poolId) ?? null;
}

function isAverageOrSkillDamageLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^Średnie Obrażenia\s*[+-]?\d+\s*%?$/iu.test(trimmed) ||
    /^Obrażenia Umiejętności\s*[+-]?\d+\s*%?$/iu.test(trimmed)
  );
}

/** Flat list of additional-bonus lines allowed for a slot (from dobry-temat mix pools). */
export function additionalBonusOptionsForSlot(slot: EquipmentSlotId): readonly string[] {
  const pool = additionalBonusPoolForSlot(slot);
  if (!pool) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const section of pool.sections) {
    for (const bonus of section.bonuses) {
      if (seen.has(bonus)) continue;
      seen.add(bonus);
      lines.push(bonus);
    }
  }
  return lines;
}

/**
 * Slot pool options, with Średnie Obrażenia / Obrażenia Umiejętności only for weapons
 * that actually carry those characteristics (wiki lvl 30 / 75).
 */
export function additionalBonusOptionsForItem(
  cardName: string,
  slot: EquipmentSlotId,
): readonly string[] {
  const lines = additionalBonusOptionsForSlot(slot);
  if (slot === 'weapon' && weaponHasAverageSkillDamage(cardName)) return lines;
  return lines.filter((line) => !isAverageOrSkillDamageLine(line));
}

/**
 * Persist builtins (when known) + up to 5 additional lines.
 * Never invents bonus numbers — additional must come from the imported pool or prior stored data.
 */
export function mergeItemBonusStorage(
  cardName: string,
  enhancement: number,
  additional: readonly string[],
  slot?: EquipmentSlotId,
): readonly string[] {
  const builtin = catalogBonusEntriesForItem(cardName, enhancement).map((entry) => entry.line);
  const resolvedSlot = slot ?? equipmentSlotForCategory(findGameItemByCardName(cardName)?.category ?? '') ?? 'weapon';
  const maxAdditional = maxAdditionalBonusesForItem(cardName, resolvedSlot);
  const builtinSet = new Set(builtin);
  // Strip builtins BEFORE slicing to max 5 — otherwise a pre-merged payload
  // (builtins + additionals) would keep only the first 5 builtins and drop additionals.
  const cleanedAdditional = additional
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => builtin.length === 0 || !builtinSet.has(line))
    .slice(0, maxAdditional);
  if (builtin.length === 0) return cleanedAdditional;
  return [...builtin, ...cleanedAdditional];
}

/** Prefer catalog ladder bonuses; keep caller fallback when dump has none. */
export function resolveItemBonuses(
  cardName: string,
  enhancement: number,
  fallback: readonly string[] = [],
): readonly string[] {
  // Prefer PH presentation plus9 builtins at +9 when documented.
  if (shouldUsePhPlus9Snapshot(cardName, enhancement)) {
    const plus9 = phPlus9Lines(cardName);
    if (plus9.length > 0) return plus9;
  }
  const item = findGameItemByCardName(cardName);
  const fromCatalog = bonusesAtEnhancement(item?.upgradeDescription, enhancement);
  return fromCatalog.length > 0 ? fromCatalog : fallback;
}

/** Ulepszacze / materiały ulepszania z dumpa (nie sloty EQ). */
export function enhancerCatalogItems(query = ''): readonly GameItem[] {
  return gameItemCatalog.filter((item) => {
    if (!item.category.toLocaleLowerCase('pl').includes('ulepsz')) return false;
    return itemMatchesSearchQuery(item, query);
  });
}

export function isItemCompatibleWithClass(
  category: string,
  characterClass: CharacterClass,
): boolean {
  const allowed = compatibleClassesForCategory(category);
  if (allowed === 'none') return false;
  if (allowed === 'any') return true;
  return allowed.includes(characterClass);
}


export const AVERAGE_DAMAGE_BONUS_NAME = 'Średnie Obrażenia';
export const SKILL_DAMAGE_BONUS_NAME = 'Obrażenia Umiejętności';
export const AVERAGE_DAMAGE_RANGE = { min: -60, max: 60 } as const;
export const SKILL_DAMAGE_RANGE = { min: -30, max: 30 } as const;

/** Wiki Poziom 30 / 75 weapons that carry editable average/skill damage (not "hidden"). */
export function characteristicWeaponLevel(cardName: string): 30 | 75 | null {
  const base = stripEnhancementFromName(cardName);
  const level = characteristicWeaponLevels[base];
  if (level === 30 || level === 75) return level;
  return null;
}

export function isCharacteristicAverageSkillWeapon(cardName: string): boolean {
  return characteristicWeaponLevel(cardName) !== null;
}

function parseSignedPercentBonus(line: string, bonusName: string): number | null {
  const escaped = bonusName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = line.trim().match(new RegExp(`^${escaped}\\s*([+-]?\\d+)\\s*%?$`, 'iu'));
  if (!match) return null;
  return Number(match[1]);
}

export function readAverageSkillDamage(bonuses: readonly string[]): {
  readonly averageDamagePercent: number | null;
  readonly skillDamagePercent: number | null;
} {
  let averageDamagePercent: number | null = null;
  let skillDamagePercent: number | null = null;
  for (const line of bonuses) {
    const avg = parseSignedPercentBonus(line, AVERAGE_DAMAGE_BONUS_NAME);
    if (avg !== null) averageDamagePercent = avg;
    const skill = parseSignedPercentBonus(line, SKILL_DAMAGE_BONUS_NAME);
    if (skill !== null) skillDamagePercent = skill;
  }
  return { averageDamagePercent, skillDamagePercent };
}

export function formatAverageDamageLine(percent: number): string {
  const value = Math.min(AVERAGE_DAMAGE_RANGE.max, Math.max(AVERAGE_DAMAGE_RANGE.min, Math.trunc(percent)));
  const sign = value > 0 ? '+' : '';
  return `${AVERAGE_DAMAGE_BONUS_NAME} ${sign}${value}%`;
}

export function formatSkillDamageLine(percent: number): string {
  const value = Math.min(SKILL_DAMAGE_RANGE.max, Math.max(SKILL_DAMAGE_RANGE.min, Math.trunc(percent)));
  const sign = value > 0 ? '+' : '';
  return `${SKILL_DAMAGE_BONUS_NAME} ${sign}${value}%`;
}

/** Persist editable Średnie Obrażenia / Obrażenia Umiejętności on the card (characteristic Metin2). */
export function withAverageSkillDamage(
  bonuses: readonly string[],
  next: { readonly averageDamagePercent: number | null; readonly skillDamagePercent: number | null },
): readonly string[] {
  const without = bonuses.filter((line) => {
    return (
      parseSignedPercentBonus(line, AVERAGE_DAMAGE_BONUS_NAME) === null &&
      parseSignedPercentBonus(line, SKILL_DAMAGE_BONUS_NAME) === null
    );
  });
  const extra: string[] = [];
  if (next.averageDamagePercent !== null && next.averageDamagePercent !== 0) {
    extra.push(formatAverageDamageLine(next.averageDamagePercent));
  }
  if (next.skillDamagePercent !== null && next.skillDamagePercent !== 0) {
    extra.push(formatSkillDamageLine(next.skillDamagePercent));
  }
  return [...without, ...extra];
}

/** Documented PH +9 tooltip lines from presentation scrape (structured items.plus9). */
export function phDocumentedBonusLines(cardName: string): readonly string[] {
  return phPlus9Lines(cardName);
}

/** PH presentation requiredLevel from equipment overlays items[base], or null. */
export function phRequiredLevel(cardName: string): number | null {
  const level = lookupPhEquipmentItem(cardName)?.requiredLevel;
  return typeof level === 'number' ? level : null;
}

/** PH presentation +9 builtin bonus lines for a title (empty when not documented). */
export function phPlus9Lines(cardName: string): readonly string[] {
  const lines = lookupPhEquipmentItem(cardName)?.plus9;
  return lines && lines.length > 0 ? lines : [];
}

export function clampEnhancement(value: number): number {
  if (!Number.isFinite(value)) return ENHANCEMENT_MIN;
  return Math.min(ENHANCEMENT_MAX, Math.max(ENHANCEMENT_MIN, Math.trunc(value)));
}

export function parseEnhancementFromName(name: string): number {
  const match = name.trim().match(/\+(\d+)\s*$/u);
  if (!match) return ENHANCEMENT_MIN;
  return clampEnhancement(Number(match[1]));
}

export function stripEnhancementFromName(name: string): string {
  return name
    .trim()
    .replace(/\s*\+\d+\s*$/u, '')
    .trim();
}

export function formatEnhancedItemName(baseName: string, enhancement: number): string {
  const base = stripEnhancementFromName(baseName);
  const level = clampEnhancement(enhancement);
  return `${base} +${level}`;
}

export function equipmentCatalogItems(options?: {
  readonly characterClass?: CharacterClass;
  readonly slot?: EquipmentSlotId | 'all';
}): readonly GameItem[] {
  return gameItemCatalog.filter((item) => {
    const slot = equipmentSlotForCategory(item.category);
    if (slot === null) return false;
    if (options?.slot && options.slot !== 'all' && slot !== options.slot) return false;
    if (
      options?.characterClass &&
      !isItemCompatibleWithClass(item.category, options.characterClass)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Autocomplete for EQ create: searches the full equipment dump (all classes),
 * ranks class-compatible hits first, keeps incompatible visible so names are findable.
 */
export function searchEquipmentCatalogSuggestions(
  query: string,
  options?: {
    readonly characterClass?: CharacterClass;
    readonly limit?: number;
  },
): readonly GameItem[] {
  const normalized = normalizeItemSearchText(query);
  if (normalized.length < 2) return [];
  const limit = options?.limit ?? 30;
  const characterClass = options?.characterClass;
  const scored: { item: GameItem; rank: number }[] = [];

  for (const item of equipmentCatalogItems({ slot: 'all' })) {
    if (!itemMatchesSearchQuery(item, query)) continue;
    const titleNorm = normalizeItemSearchText(item.title);
    const compatible =
      characterClass === undefined || isItemCompatibleWithClass(item.category, characterClass);
    let rank = compatible ? 0 : 100;
    if (titleNorm.startsWith(normalized)) rank += 0;
    else if (titleNorm.split(' ').some((word) => word.startsWith(normalized))) rank += 10;
    else rank += 20;
    scored.push({ item, rank });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.item.title.localeCompare(b.item.title, 'pl');
  });
  return scored.slice(0, limit).map((entry) => entry.item);
}
