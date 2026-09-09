'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function TeamEconomyAiDisclosure() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const discover = () => {
      const input = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).find(
        (candidate) =>
          candidate.accept.includes('image/png') &&
          candidate.closest('label')?.textContent?.includes('Screen dropu'),
      );
      setTarget(input?.closest('label') ?? null);
    };

    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;

  return createPortal(
    <span
      role="note"
      style={{
        display: 'block',
        marginTop: 8,
        padding: '9px 11px',
        border: '1px solid rgba(230, 195, 109, 0.22)',
        borderRadius: 10,
        background: 'rgba(230, 195, 109, 0.07)',
        color: 'rgba(255, 244, 209, 0.82)',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      AI (beta) — wynik może być błędny. Zweryfikuj nazwy i ilości przed zapisaniem dropu.
    </span>,
    target,
  );
}
