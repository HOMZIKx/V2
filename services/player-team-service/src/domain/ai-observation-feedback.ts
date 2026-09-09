export type AiFeedbackDecision = {
  readonly status: 'accepted' | 'corrected';
  readonly changedFields: readonly string[];
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function normalizedText(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pl-PL')
    : '';
}

function normalizedEquipmentName(value: unknown): string {
  return normalizedText(value).replace(/\s*\+\d+$/u, '').trim();
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizedStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').map(normalizedText)
    : [];
}

export function evaluateEquipmentFeedback(aiOutput: unknown, finalOutput: unknown): AiFeedbackDecision {
  const ai = asRecord(aiOutput);
  const final = asRecord(finalOutput);
  const changed: string[] = [];

  if (normalizedEquipmentName(ai?.name) !== normalizedEquipmentName(final?.name)) changed.push('name');
  if (integer(ai?.enhancement) !== integer(final?.enhancement)) changed.push('enhancement');
  if (normalizedText(ai?.category) !== normalizedText(final?.category)) changed.push('category');

  const aiBonuses = normalizedStringArray(ai?.bonuses);
  const finalBonuses = normalizedStringArray(final?.bonuses);
  const catalogFilledEmptyAiBonuses =
    aiBonuses.length === 0 && normalizedText(final?.catalogLayer) === 'project_hard_source';
  if (
    !catalogFilledEmptyAiBonuses &&
    JSON.stringify(aiBonuses) !== JSON.stringify(finalBonuses)
  ) {
    changed.push('bonuses');
  }

  return { status: changed.length === 0 ? 'accepted' : 'corrected', changedFields: changed };
}

function economyAiItems(aiOutput: unknown): readonly { name: string; quantity: number | null }[] {
  const root = asRecord(aiOutput);
  const rows = Array.isArray(root?.normalizedItems) ? root.normalizedItems : [];
  return rows.map((raw) => {
    const item = asRecord(raw);
    const catalogMatch = asRecord(item?.catalogMatch);
    return {
      name: normalizedText(catalogMatch?.name) || normalizedText(item?.recognizedName),
      quantity: integer(item?.quantity),
    };
  });
}

function economyFinalItems(finalOutput: unknown): readonly { name: string; quantity: number | null }[] {
  const root = asRecord(finalOutput);
  const rows = Array.isArray(root?.items) ? root.items : [];
  return rows.map((raw) => {
    const item = asRecord(raw);
    return {
      name: normalizedText(item?.name),
      quantity: integer(item?.quantity),
    };
  });
}

export function evaluateEconomyFeedback(aiOutput: unknown, finalOutput: unknown): AiFeedbackDecision {
  const aiItems = economyAiItems(aiOutput);
  const finalItems = economyFinalItems(finalOutput);
  const changed: string[] = [];

  if (aiItems.length !== finalItems.length) changed.push('items.count');
  const length = Math.max(aiItems.length, finalItems.length);
  for (let index = 0; index < length; index += 1) {
    const ai = aiItems[index];
    const final = finalItems[index];
    if (!ai || !final) continue;
    if (ai.name !== final.name) changed.push(`items.${index}.name`);
    if (ai.quantity !== final.quantity) changed.push(`items.${index}.quantity`);
  }

  return { status: changed.length === 0 ? 'accepted' : 'corrected', changedFields: changed };
}
