import { describe, expect, it } from 'vitest';

import { channelPickerOptions } from './channels-picker.js';

describe('channel allowlist picker', () => {
  const discord = [
    { id: 'A', name: 'centrum-aktywnosci', type: 0, usable: true },
    { id: 'B', name: 'ogloszenia', type: 0, usable: true },
    { id: 'C', name: 'eventy', type: 0, usable: true },
    { id: 'D', name: 'handel', type: 0, usable: true },
    { id: 'E', name: 'offtopic', type: 0, usable: true },
  ];

  it('keeps all configured channels selected without truncating to two', () => {
    const selected = ['A', 'B', 'C', 'D'];
    const options = channelPickerOptions(discord, selected);
    expect(options.map((option) => option.value)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(selected).toEqual(['A', 'B', 'C', 'D']);
    expect(options.every((option) => !option.label.match(/^\d{5,}$/))).toBe(true);
  });

  it('preserves A,B,C,D after an unrelated save payload', () => {
    const existing = ['A', 'B', 'C', 'D'];
    const saved = [...existing];
    expect(saved).toEqual(['A', 'B', 'C', 'D']);
  });

  it('removes C and later adds E', () => {
    let selected = ['A', 'B', 'C', 'D'];
    selected = selected.filter((id) => id !== 'C');
    expect(selected).toEqual(['A', 'B', 'D']);
    selected = [...selected, 'E'];
    expect(selected).toEqual(['A', 'B', 'D', 'E']);
  });

  it('shows configured channels missing from Discord without raw IDs', () => {
    const options = channelPickerOptions(discord.slice(0, 2), ['A', 'Z']);
    const missing = options.find((option) => option.value === 'Z');
    expect(missing?.label).toBe('Kanał niedostępny');
    expect(missing?.label).not.toBe('Z');
  });
});
