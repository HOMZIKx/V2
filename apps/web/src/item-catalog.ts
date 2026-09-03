import type { CharacterClass } from './character-profile';
import catalogDocument from './data/dobry-temat-item-catalog.json';
import phItemIconMap from './data/ph-item-icon-map.json';
import wikiImageMap from './data/wiki-item-image-map.json';

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
    upgradeDescription: item.wiki_upgrade ?? null,
  };
});

export const gameItemCategories = [...new Set(gameItemCatalog.map((item) => item.category))].sort(
  (a, b) => a.localeCompare(b, 'pl'),
);

export function searchGameItems(query: string, category = 'all'): readonly GameItem[] {
  const normalized = query.trim().toLocaleLowerCase('pl');
  return gameItemCatalog.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (normalized.length === 0 ||
        [item.title, item.category, item.upgradeDescription ?? ''].some((value) =>
          value.toLocaleLowerCase('pl').includes(normalized),
        )),
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
    const name = fields[`Bonus${index}-Name`];
    if (name === undefined || isTruncatedWikiToken(name)) continue;

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

/** Prefer catalog ladder bonuses; keep caller fallback when dump has none. */
export function resolveItemBonuses(
  cardName: string,
  enhancement: number,
  fallback: readonly string[] = [],
): readonly string[] {
  const item = findGameItemByCardName(cardName);
  const fromCatalog = bonusesAtEnhancement(item?.upgradeDescription, enhancement);
  return fromCatalog.length > 0 ? fromCatalog : fallback;
}

/** Ulepszacze / materiały ulepszania z dumpa (nie sloty EQ). */
export function enhancerCatalogItems(query = ''): readonly GameItem[] {
  const normalized = query.trim().toLocaleLowerCase('pl');
  return gameItemCatalog.filter((item) => {
    if (!item.category.toLocaleLowerCase('pl').includes('ulepsz')) return false;
    if (normalized.length === 0) return true;
    return [item.title, item.category, item.upgradeDescription ?? ''].some((value) =>
      value.toLocaleLowerCase('pl').includes(normalized),
    );
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
