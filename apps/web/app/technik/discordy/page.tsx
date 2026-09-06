'use client';

import { TechnikGuildsPage } from '../../../src/technik/guilds-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="discordy">
      <TechnikGuildsPage />
    </TechnikPageFrame>
  );
}
