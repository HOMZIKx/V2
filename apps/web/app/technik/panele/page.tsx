'use client';

import { TechnikPanelePage } from '../../../src/technik/panele-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="panele">
      <TechnikPanelePage />
    </TechnikPageFrame>
  );
}
