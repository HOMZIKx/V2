'use client';

import { useEffect } from 'react';

import { TechnikPageFrame } from '../technik-page-client';

/** Legacy /technik/bot → overview (full IA lives in subroutes). */
export default function TechnikBotLegacyRedirect() {
  useEffect(() => {
    window.location.replace('/technik');
  }, []);
  return (
    <TechnikPageFrame active="overview">
      <p className="technik-lead">Przekierowuję do Przeglądu…</p>
    </TechnikPageFrame>
  );
}
