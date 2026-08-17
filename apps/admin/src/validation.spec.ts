import { describe, expect, it } from 'vitest';

import {
  validateActivityTypeForm,
  validateChannelList,
  validateRemindersJson,
  validateStatusForm,
} from './form-validation.js';

describe('admin form validation', () => {
  it('requires type key and label', () => {
    expect(validateActivityTypeForm({ key: '', label: '' })).toEqual({
      key: 'Podaj klucz techniczny.',
      label: 'Podaj nazwę.',
    });
    expect(validateActivityTypeForm({ key: 'raid', label: 'Raid' })).toEqual({});
  });

  it('requires status label', () => {
    expect(validateStatusForm({ label: '   ' })).toEqual({
      label: 'Podaj nazwę statusu.',
    });
  });

  it('rejects invalid channel snowflakes', () => {
    const invalid = validateChannelList('abc\n123456789012345678');
    expect(invalid.channelIds).toBeDefined();
    expect(String(invalid.channelIds)).toContain('abc');
    expect(validateChannelList('123456789012345678')).toEqual({});
  });

  it('parses reminders JSON', () => {
    expect(validateRemindersJson('not-json').errors).toEqual({
      reminders: 'Przypomnienia mają nieprawidłowy format.',
    });
    expect(validateRemindersJson('[{"offsetMinutes":60}]').errors).toEqual({});
  });
});
