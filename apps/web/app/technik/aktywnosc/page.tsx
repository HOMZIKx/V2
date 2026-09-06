'use client';

import { TechnikMemberActivityPage } from '../../../src/technik/member-activity-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="aktywnosc">
      <TechnikMemberActivityPage />
    </TechnikPageFrame>
  );
}
