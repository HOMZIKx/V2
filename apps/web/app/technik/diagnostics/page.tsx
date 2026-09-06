'use client';

import { TechnikDiagnosticsPage } from '../../../src/technik/diagnostics-page';
import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikDiagnosticsRoute() {
  return (
    <TechnikPageFrame active="diagnostics">
      <TechnikDiagnosticsPage />
    </TechnikPageFrame>
  );
}