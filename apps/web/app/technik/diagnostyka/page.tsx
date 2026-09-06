'use client';

import { TechnikDiagnosticsPage } from '../../../src/technik/diagnostics-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikRoute() {
  return (
    <TechnikPageFrame active="diagnostyka">
      <TechnikDiagnosticsPage />
    </TechnikPageFrame>
  );
}
