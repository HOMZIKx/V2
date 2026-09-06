'use client';

import { TechnikKanalyPage } from '../../../src/technik/kanaly-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="kanaly">
      <TechnikKanalyPage />
    </TechnikPageFrame>
  );
}
