'use client';

import { TechnikOwnerPage } from '../../../src/technik/owner-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="owner">
      <TechnikOwnerPage />
    </TechnikPageFrame>
  );
}
