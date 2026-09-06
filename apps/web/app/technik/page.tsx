'use client';

import { TechnikStatusPage } from '../../src/technik/status-page';
import { TechnikPageFrame } from './technik-page-client';

export default function TechnikStatusRoute() {
  return (
    <TechnikPageFrame active="status">
      <TechnikStatusPage />
    </TechnikPageFrame>
  );
}