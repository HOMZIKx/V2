'use client';

import { TechnikCentrumPage } from '../../../src/technik/centrum-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="centrum">
      <TechnikCentrumPage />
    </TechnikPageFrame>
  );
}
