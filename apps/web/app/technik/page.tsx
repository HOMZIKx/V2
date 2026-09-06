'use client';

import { TechnikOverviewPage } from '../../src/technik/overview-page';
import { TechnikPageFrame } from './technik-page-client';

export default function TechnikOverviewRoute() {
  return (
    <TechnikPageFrame active="overview">
      <TechnikOverviewPage />
    </TechnikPageFrame>
  );
}
