import type { DiscordChannelOption } from '../api/activity-admin.js';

export function channelPickerOptions(
  discordChannels: readonly DiscordChannelOption[],
  selectedIds: readonly string[],
): readonly { value: string; label: string; disabled?: boolean }[] {
  const seen = new Set<string>();
  const options: { value: string; label: string; disabled?: boolean }[] = [];
  for (const channel of discordChannels) {
    seen.add(channel.id);
    options.push({
      value: channel.id,
      label: `#${channel.name}`,
      ...(channel.usable ? {} : { disabled: true }),
    });
  }
  for (const id of selectedIds) {
    if (!seen.has(id)) {
      options.push({
        value: id,
        label: 'Kanał niedostępny',
      });
    }
  }
  return options;
}
