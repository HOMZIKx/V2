'use client';

import { useEffect } from 'react';

import { isPointInsideContainedImage } from '../src/map-marker-geometry';

export function MapMarkerBoundaryGuard() {
  useEffect(() => {
    const guardClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const stage = target.closest<HTMLElement>('.respawn-map-stage.is-placing');
      if (!stage) return;
      if (target.closest('.respawn-map-marker')) return;

      const image = stage.querySelector<HTMLImageElement>(':scope > img');
      if (!image) return;

      const rect = image.getBoundingClientRect();
      const allowed = isPointInsideContainedImage({
        boxWidth: rect.width,
        boxHeight: rect.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        localX: event.clientX - rect.left,
        localY: event.clientY - rect.top,
      });

      if (allowed) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener('click', guardClick, true);
    return () => document.removeEventListener('click', guardClick, true);
  }, []);

  return null;
}
