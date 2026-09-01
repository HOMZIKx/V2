import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from '@v2/configuration';
import { REST, Routes } from 'discord.js';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../src/infrastructure/discord/discord-config.js';
import { loadEnvFile } from '../src/infrastructure/discord/load-env-file.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadEnvFile(path.join(root, '.env'));

const config = normalizeDiscordConfig(createConfig(DiscordGatewayConfigSchema));
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
const channelId = '1534228693449179146';
const me = (await rest.get(Routes.user('@me'))) as { id: string };
const messages = (await rest.get(Routes.channelMessages(channelId), {
  query: new URLSearchParams({ limit: '20' }),
})) as Array<Record<string, unknown>>;

for (const msg of messages) {
  if ((msg.author as { id?: string } | undefined)?.id !== me.id) continue;
  const raw = JSON.stringify(msg);
  if (!raw.includes('Centrum') && !raw.includes('Mapa V2')) continue;
  console.log(
    JSON.stringify(
      {
        messageId: msg.id,
        edited: msg.edited_timestamp ?? null,
        hasMapaV2: raw.includes('Mapa V2'),
        hasWybierz: raw.includes('Wybierz działanie'),
        hasUtworz: raw.includes('Utwórz aktywność'),
        hasWkroce: raw.includes('Wkrótce'),
        hasDlaCiebie: raw.includes('DLA CIEBIE'),
        pngIcon: raw.includes('centrum-aktywnosci-icon.png'),
        pngBanner: raw.includes('v2-activity-banner.png'),
        webpIcon: raw.includes('centrum-aktywnosci-icon.webp'),
        jumpUrl: `https://discord.com/channels/${config.DISCORD_TEST_GUILD_ID}/${channelId}/${msg.id}`,
      },
      null,
      2,
    ),
  );
}
