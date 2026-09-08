import type { EconomyCatalogSeedItem } from '../../domain/ports/team-economy.port.js';

const LEGACY_EXPORT_URL =
  'https://raw.githubusercontent.com/HOMZIKx/dobry-temat/main/data/items/Item_export.csv';

let cachedItems: readonly EconomyCatalogSeedItem[] | null = null;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function categoryFor(name: string, rawCategory: string): string {
  if (name.toLocaleLowerCase('pl-PL') === 'runiczny pył') return 'Ulepszacze';
  const category = rawCategory.trim();
  if (!category || category === 'Inne') return 'Pozostałe';
  return category;
}

export async function loadLegacyEconomyCatalog(): Promise<readonly EconomyCatalogSeedItem[]> {
  if (cachedItems) return cachedItems;

  const response = await fetch(LEGACY_EXPORT_URL, {
    headers: { accept: 'text/csv,text/plain;q=0.9' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`DOBRYTEMAT Item_export.csv failed: ${response.status}`);
  }

  const rows = parseCsv(await response.text());
  const header = rows[0] ?? [];
  const nameIndex = header.indexOf('name');
  const categoryIndex = header.indexOf('category');
  const imageIndex = header.indexOf('image_url');
  const idIndex = header.indexOf('id');
  if (nameIndex < 0 || categoryIndex < 0 || imageIndex < 0 || idIndex < 0) {
    throw new Error('DOBRYTEMAT Item_export.csv has an unexpected header');
  }

  const byName = new Map<string, EconomyCatalogSeedItem>();
  for (const row of rows.slice(1)) {
    const canonicalName = (row[nameIndex] ?? '').trim();
    if (!canonicalName) continue;
    const normalized = canonicalName.toLocaleLowerCase('pl-PL');
    if (byName.has(normalized)) continue;
    const rawId = (row[idIndex] ?? '').trim();
    byName.set(normalized, {
      id: `legacy_${rawId || normalized.replace(/[^a-z0-9]+/g, '_')}`,
      canonicalName,
      category: categoryFor(canonicalName, row[categoryIndex] ?? ''),
      imageUrl: (row[imageIndex] ?? '').trim() || null,
    });
  }

  cachedItems = Array.from(byName.values());
  return cachedItems;
}
