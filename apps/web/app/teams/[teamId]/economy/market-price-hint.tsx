'use client';

import { useEffect, useMemo, useState } from 'react';

import styles from './market-price-hint.module.css';

type Currency = 'yang' | 'won' | 'gem';

type CatalogItem = {
  id: string;
  canonicalName: string;
  category: string;
};

type PriceRow = {
  itemId: string;
  itemName: string;
  unitPrice: number;
  currency: Currency;
  averagePrice: number;
  sampleCount: number;
  createdBy: string;
  createdAtIso: string;
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

function compact(value: number, currency: Currency): string {
  if (currency === 'won') return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} Won`;
  if (currency === 'gem') return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} GEM`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}kkk`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}kk`;
  if (value >= 1_000) return `${(value / 1_000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}k`;
  return `${value.toLocaleString('pl-PL')} Yang`;
}

function api(workspaceId: string, path: string): string {
  return `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/${path}`;
}

export function MarketPriceHint({
  workspaceId,
  itemName,
  currency,
  onUsePrice,
}: {
  readonly workspaceId: string;
  readonly itemName: string;
  readonly currency: Currency;
  readonly onUsePrice: (value: number) => void;
}) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = itemName.trim();
    if (!name) {
      setItem(null);
      setPrices([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const itemsResponse = await fetch(api(workspaceId, `items?q=${encodeURIComponent(name)}`), {
            cache: 'no-store',
          });
          if (!itemsResponse.ok) return;
          const items = (await itemsResponse.json()) as CatalogItem[];
          const exact = items.find((candidate) => normalize(candidate.canonicalName) === normalize(name)) ?? null;
          setItem(exact);
          if (!exact) {
            setPrices([]);
            return;
          }
          const priceResponse = await fetch(
            api(workspaceId, `management/prices?itemId=${encodeURIComponent(exact.id)}&limit=100`),
            { cache: 'no-store' },
          );
          if (!priceResponse.ok) return;
          setPrices((await priceResponse.json()) as PriceRow[]);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [itemName, workspaceId]);

  const selected = useMemo(
    () => prices.find((price) => price.currency === currency) ?? null,
    [currency, prices],
  );

  if (!itemName.trim()) return null;
  if (loading && !item) return <div className={styles.hint}>Sprawdzam ceny w bazie ogólnej…</div>;
  if (!item) return <div className={`${styles.hint} ${styles.muted}`}>Brak dokładnego dopasowania w bazie.</div>;
  if (!selected) {
    return <div className={`${styles.hint} ${styles.muted}`}>Brak zapisanej ceny {currency.toUpperCase()} dla tego przedmiotu.</div>;
  }

  return (
    <div className={styles.hint}>
      <div className={styles.row}>
        <span>Ostatnia:</span>
        <strong>{compact(selected.unitPrice, currency)}</strong>
        <span>· {new Date(selected.createdAtIso).toLocaleDateString('pl-PL')}</span>
        <button className={styles.action} onClick={() => onUsePrice(selected.unitPrice)} type="button">
          Użyj
        </button>
      </div>
      <div className={styles.row}>
        <span>Średnia:</span>
        <strong>{compact(selected.averagePrice, currency)}</strong>
        <span>· {selected.sampleCount} wpisów</span>
        <button className={styles.action} onClick={() => onUsePrice(selected.averagePrice)} type="button">
          Użyj średniej
        </button>
      </div>
    </div>
  );
}
