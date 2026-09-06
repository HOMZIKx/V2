'use client';

import { TechnikAuditPage } from '../../../src/technik/audit-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="audit">
      <TechnikAuditPage />
    </TechnikPageFrame>
  );
}
