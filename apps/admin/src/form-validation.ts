export function validateActivityTypeForm(input: {
  key: string;
  label: string;
}): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (input.key.trim() === '') {
    errors['key'] = 'Podaj klucz techniczny.';
  } else if (!/^[a-z0-9_:-]+$/i.test(input.key.trim())) {
    errors['key'] = 'Klucz może zawierać litery, cyfry, _ : -';
  }
  if (input.label.trim() === '') {
    errors['label'] = 'Podaj nazwę.';
  }
  return errors;
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
