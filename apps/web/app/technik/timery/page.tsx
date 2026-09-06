'use client';

import { TechnikTimersPage } from '../../../src/technik/timers-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="timers">
      <TechnikTimersPage />
    </TechnikPageFrame>
  );
}
