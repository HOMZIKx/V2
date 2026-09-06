/** In-memory Discord watchers for shared timer rooms (mapKey:channel). */

function roomKey(mapKey: string, channel: number): string {
  return `${mapKey.trim().toLowerCase()}:${channel}`;
}

const watchers = new Map<string, Set<string>>();

export function registerTimerRoomWatcher(input: {
  readonly mapKey: string;
  readonly channel: number;
  readonly discordUserId: string;
}): void {
  const key = roomKey(input.mapKey, input.channel);
  const set = watchers.get(key) ?? new Set<string>();
  set.add(input.discordUserId);
  watchers.set(key, set);
}

export function listTimerRoomWatchersExcept(input: {
  readonly mapKey: string;
  readonly channel: number;
  readonly exceptDiscordUserId: string;
}): string[] {
  const set = watchers.get(roomKey(input.mapKey, input.channel));
  if (!set) return [];
  return [...set].filter((id) => id !== input.exceptDiscordUserId);
}

export function resetTimerRoomWatchersForTests(): void {
  watchers.clear();
}
