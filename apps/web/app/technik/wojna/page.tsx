'use client';

import { TechnikWojnaPage } from '../../../src/technik/wojna-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="wojna">
      <TechnikWojnaPage />
    </TechnikPageFrame>
  );
}
