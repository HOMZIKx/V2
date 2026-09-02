import { describe, expect, it } from 'vitest';

import { deriveActivityTypeKey, isValidActivityTypeKey } from './activity-type-key.js';
import {
  resolveActivityTypeKeyForCreate,
  validateActivityTypeCreateForm,
  validateActivityTypeEditForm,
} from './form-validation.js';

describe('deriveActivityTypeKey', () => {
  it('generates a valid key from a Polish display name', () => {
    expect(deriveActivityTypeKey('Lodowa Wiedźma')).toBe('lodowa_wiedzma');
    expect(isValidActivityTypeKey(deriveActivityTypeKey('Lodowa Wiedźma'))).toBe(true);
  });

  it('keeps the existing key unchanged when only the label is renamed on edit', () => {
    const originalKey = deriveActivityTypeKey('Lodowa Wiedźma');
    expect(originalKey).toBe('lodowa_wiedzma');
    expect(deriveActivityTypeKey('Wiedźma')).toBe('wiedzma');
    expect(originalKey).toBe('lodowa_wiedzma');
    expect(validateActivityTypeEditForm({ label: 'Wiedźma' })).toEqual({});
  });

  it('resolves create key from label when owner did not override advanced key', () => {
    expect(resolveActivityTypeKeyForCreate({ label: 'Lodowa Wiedźma' })).toBe('lodowa_wiedzma');
    expect(resolveActivityTypeKeyForCreate({ label: 'Lodowa Wiedźma', key: 'custom_key' })).toBe(
      'custom_key',
    );
  });
});

describe('validateActivityTypeCreateForm', () => {
  it('requires a usable label and accepts generated keys', () => {
    expect(validateActivityTypeCreateForm({ label: '' })).toEqual({
      label: 'Podaj nazwę.',
    });
    expect(validateActivityTypeCreateForm({ label: 'Raid' })).toEqual({});
  });
});
