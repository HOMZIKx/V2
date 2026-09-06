'use client';

import { TechnikBotConfigPage } from '../../../src/technik/bot-config-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikBotRoute() {
  return (
    <TechnikPageFrame active="bot">
      <TechnikBotConfigPage />
    </TechnikPageFrame>
  );
}