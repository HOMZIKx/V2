'use client';

import { TechnikCyklicznePage } from '../../../src/technik/cykliczne-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="cykliczne">
      <TechnikCyklicznePage />
    </TechnikPageFrame>
  );
}
