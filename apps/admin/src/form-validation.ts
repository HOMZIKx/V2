import { deriveActivityTypeKey, isValidActivityTypeKey } from './activity-type-key.js';

export function validateActivityTypeCreateForm(input: {
  label: string;
  key?: string;
}): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  const label = input.label.trim();
  if (label === '') {
    errors['label'] = 'Podaj nazwę.';
    return errors;
  }
  const explicitKey = input.key?.trim() ?? '';
  const key = explicitKey !== '' ? explicitKey : deriveActivityTypeKey(label);
  if (key === '') {
    errors['label'] = 'Nazwa musi zawierać litery lub cyfry.';
  } else if (!isValidActivityTypeKey(key)) {
    errors['key'] = 'Klucz może zawierać litery, cyfry, _ : -';
  }
  return errors;
}

export function validateActivityTypeEditForm(input: {
  label: string;
}): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (input.label.trim() === '') {
    errors['label'] = 'Podaj nazwę.';
  }
  return errors;
}

/** @deprecated use validateActivityTypeCreateForm / validateActivityTypeEditForm */
export function validateActivityTypeForm(input: {
  key: string;
  label: string;
}): Readonly<Record<string, string>> {
  return validateActivityTypeCreateForm({ label: input.label, key: input.key });
}

export function validateStatusForm(input: { label: string }): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (input.label.trim() === '') {
    errors['label'] = 'Podaj nazwę statusu.';
  }
  return errors;
}

export function validateChannelList(raw: string): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  const ids = raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const invalid = ids.filter((id) => !/^\d{5,32}$/.test(id));
  if (invalid.length > 0) {
    errors['channelIds'] = `Nieprawidłowy identyfikator kanału: ${invalid.join(', ')}`;
  }
  return errors;
}

export function validateRemindersJson(raw: string): {
  errors: Readonly<Record<string, string>>;
  value: unknown;
} {
  if (raw.trim() === '') {
    return { errors: {}, value: [] };
  }
  try {
    return { errors: {}, value: JSON.parse(raw) as unknown };
  } catch {
    return { errors: { reminders: 'Przypomnienia mają nieprawidłowy format.' }, value: null };
  }
}

export function resolveActivityTypeKeyForCreate(input: { label: string; key?: string }): string {
  const explicit = input.key?.trim() ?? '';
  return explicit !== '' ? explicit : deriveActivityTypeKey(input.label);
}
