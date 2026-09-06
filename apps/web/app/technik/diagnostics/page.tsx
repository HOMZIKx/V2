'use client';

import { useEffect } from 'react';

import { TechnikPageFrame } from '../technik-page-client';

export default function TechnikDiagnosticsLegacyRedirect() {
  useEffect(() => {
    window.location.replace('/technik/diagnostyka');
  }, []);
  return (
    <TechnikPageFrame active="diagnostyka">
      <p className="technik-lead">Przekierowuję do Diagnostyki…</p>
    </TechnikPageFrame>
  );
}
