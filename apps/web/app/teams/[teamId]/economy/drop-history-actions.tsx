'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { CompactAmountInput } from './compact-amount-input';
import { MarketPriceHint } from './market-price-hint';
import styles from './team-economy.module.css';

type Currency = 'yang' | 'won' | 'gem';
type SplitMode = 'max_equal' | 'strict_equal';

type DropItem = {
  id: string;
  itemId: string | null;
  displayName: string;
  totalQuantity: number;
  ourQuantity: number;
  unitPrice: number;
  currency: Currency;
  aiConfidence?: number | null;
};

type DropMoney = {
  id: string;
  currency: Currency;
  totalAmount: number;
  ourShareBasisPoints: number;
};

type Participant = {
  participantId: string;
  displayName: string;
  isTeamMember: boolean;
};

type Drop = {
  id: string;
  source: string;
  occurredAtIso: string;
  ourShareBasisPoints: number;
  pileCount: number;
  splitMode: SplitMode;
  items: DropItem[];
  money: DropMoney[];
  participants: Participant[];
};

type Member = {
  id: string;
  displayName: string;
};

type EditItem = DropItem & { key: string };
type EditMoney = DropMoney & { key: string };

function api(workspaceId: string, path: string): string {
  return `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/${path}`;
}

export function DropHistoryActions({
  workspaceId,
  drop,
  members,
  onChanged,
}: {
  readonly workspaceId: string;
  readonly drop: Drop;
  readonly members: readonly Member[];
  readonly onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState(drop.source);
  const [share, setShare] = useState(drop.ourShareBasisPoints / 100);
  const [piles, setPiles] = useState(drop.pileCount);
  const [splitMode, setSplitMode] = useState<SplitMode>(drop.splitMode);
  const [items, setItems] = useState<EditItem[]>(
    drop.items.map((item) => ({ ...item, key: item.id })),
  );
  const [moneyRows, setMoneyRows] = useState<EditMoney[]>(
    drop.money.map((entry) => ({ ...entry, key: entry.id })),
  );
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    drop.participants.filter((entry) => entry.isTeamMember).map((entry) => entry.participantId),
  );
  const [outsiders, setOutsiders] = useState(
    drop.participants
      .filter((entry) => !entry.isTeamMember)
      .map((entry) => entry.displayName)
      .join(', '),
  );

  const hasContent = useMemo(
    () => items.length > 0 || moneyRows.some((entry) => entry.totalAmount > 0),
    [items.length, moneyRows],
  );

  const patchItem = (key: string, patch: Partial<EditItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const patchMoney = (key: string, patch: Partial<EditMoney>) => {
    setMoneyRows((current) => current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  };

  const resolveItems = async (): Promise<EditItem[]> => {
    const resolved: EditItem[] = [];
    for (const item of items) {
      if (!item.displayName.trim()) throw new Error('Każdy przedmiot musi mieć nazwę.');
      if (item.itemId) {
        resolved.push(item);
        continue;
      }
      const response = await fetch(api(workspaceId, 'items'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canonicalName: item.displayName.trim(), category: 'Pozostałe' }),
      });
      if (!response.ok) throw new Error(`Nie udało się zapisać przedmiotu: ${item.displayName}.`);
      const saved = (await response.json()) as { id: string };
      resolved.push({ ...item, itemId: saved.id });
    }
    return resolved;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasContent) {
      setError('Drop musi zawierać przedmiot albo pieniądze.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const resolved = await resolveItems();
      const participants: Participant[] = [
        ...members
          .filter((member) => selectedMembers.includes(member.id))
          .map((member) => ({
            participantId: member.id,
            displayName: member.displayName,
            isTeamMember: true,
          })),
        ...outsiders
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .map((displayName, index) => ({
            participantId: `external-edit-${drop.id}-${index}`,
            displayName,
            isTeamMember: false,
          })),
      ];
      const response = await fetch(api(workspaceId, `management/drops/${encodeURIComponent(drop.id)}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: source.trim(),
          occurredAtIso: drop.occurredAtIso,
          ourShareBasisPoints: Math.round(share * 100),
          pileCount: piles,
          splitMode,
          participants,
          items: resolved.map((item) => ({
            dropItemId: item.id || null,
            itemId: item.itemId,
            displayName: item.displayName.trim(),
            totalQuantity: item.totalQuantity,
            ourQuantity: item.ourQuantity,
            unitPrice: item.unitPrice,
            currency: item.currency,
            aiConfidence: item.aiConfidence ?? null,
          })),
          money: moneyRows
            .filter((entry) => entry.totalAmount > 0)
            .map((entry) => ({
              currency: entry.currency,
              totalAmount: entry.totalAmount,
              ourShareBasisPoints: entry.ourShareBasisPoints,
            })),
        }),
      });
      if (!response.ok) {
        throw new Error(response.status === 403 ? 'Tylko właściciel zespołu może edytować zapisany drop.' : 'Nie udało się zapisać zmian dropu.');
      }
      setItems(resolved);
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd edycji dropu.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Usunąć drop „${drop.source}” z ${new Date(drop.occurredAtIso).toLocaleString('pl-PL')}?`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspaceId, `management/drops/${encodeURIComponent(drop.id)}`), {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(response.status === 403 ? 'Tylko właściciel zespołu może usuwać zapisany drop.' : 'Nie udało się usunąć dropu.');
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd usuwania dropu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={styles.rowActions}>
        <button className={styles.buttonGhost} disabled={busy} onClick={() => setEditing((value) => !value)} type="button">
          {editing ? 'Anuluj edycję' : 'Edytuj'}
        </button>
        <button className={styles.buttonGhost} disabled={busy} onClick={() => void remove()} type="button">
          Usuń drop
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      {editing ? (
        <form onSubmit={(event) => void save(event)}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Źródło
              <input value={source} onChange={(event) => setSource(event.target.value)} />
            </label>
            <label className={styles.field}>
              Udział pieniędzy %
              <input
                max="100"
                min="0"
                step="0.01"
                type="number"
                value={share}
                onChange={(event) => setShare(Math.max(0, Math.min(100, Number(event.target.value))))}
              />
            </label>
            <label className={styles.field}>
              Liczba kupek
              <input
                max="100"
                min="1"
                type="number"
                value={piles}
                onChange={(event) => setPiles(Math.max(1, Math.min(100, Math.floor(Number(event.target.value)))))}
              />
            </label>
            <label className={styles.field}>
              Tryb podziału
              <select value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)}>
                <option value="max_equal">Maksymalnie równo + reszta</option>
                <option value="strict_equal">Tylko idealnie równo</option>
              </select>
            </label>
          </div>

          <h4 className={styles.sectionTitle}>Przedmioty</h4>
          <table className={styles.itemTable}>
            <thead>
              <tr>
                <th>Przedmiot</th>
                <th>Całość</th>
                <th>Nasze</th>
                <th>Cena / szt.</th>
                <th>Waluta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td>
                    <input value={item.displayName} onChange={(event) => patchItem(item.key, { displayName: event.target.value, itemId: null })} />
                    <MarketPriceHint
                      currency={item.currency}
                      itemName={item.displayName}
                      onUsePrice={(value) => patchItem(item.key, { unitPrice: value })}
                      workspaceId={workspaceId}
                    />
                  </td>
                  <td>
                    <input
                      min="1"
                      type="number"
                      value={item.totalQuantity}
                      onChange={(event) => {
                        const totalQuantity = Math.max(1, Math.floor(Number(event.target.value)));
                        patchItem(item.key, { totalQuantity, ourQuantity: Math.min(item.ourQuantity, totalQuantity) });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      max={item.totalQuantity}
                      min="0"
                      type="number"
                      value={item.ourQuantity}
                      onChange={(event) => patchItem(item.key, { ourQuantity: Math.max(0, Math.min(item.totalQuantity, Math.floor(Number(event.target.value)))) })}
                    />
                  </td>
                  <td>
                    <CompactAmountInput value={item.unitPrice} onValueChange={(value) => patchItem(item.key, { unitPrice: value })} />
                  </td>
                  <td>
                    <select value={item.currency} onChange={(event) => patchItem(item.key, { currency: event.target.value as Currency })}>
                      <option value="yang">Yang</option>
                      <option value="won">Won</option>
                      <option value="gem">GEM</option>
                    </select>
                  </td>
                  <td>
                    <button className={styles.buttonGhost} onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))} type="button">
                      Usuń
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className={styles.buttonGhost}
            onClick={() => setItems((current) => [...current, {
              id: '',
              key: `edit-item-${Date.now()}`,
              itemId: null,
              displayName: '',
              totalQuantity: 1,
              ourQuantity: 1,
              unitPrice: 0,
              currency: 'yang',
              aiConfidence: null,
            }])}
            type="button"
          >
            + Przedmiot
          </button>

          <h4 className={styles.sectionTitle}>Pieniądze</h4>
          <div className={styles.moneyRows}>
            {moneyRows.map((entry) => (
              <div className={styles.moneyRow} key={entry.key}>
                <label className={styles.field}>
                  Kwota
                  <CompactAmountInput value={entry.totalAmount} onValueChange={(value) => patchMoney(entry.key, { totalAmount: value })} />
                </label>
                <label className={styles.field}>
                  Waluta
                  <select value={entry.currency} onChange={(event) => patchMoney(entry.key, { currency: event.target.value as Currency })}>
                    <option value="yang">Yang</option>
                    <option value="won">Won</option>
                    <option value="gem">GEM</option>
                  </select>
                </label>
                <label className={styles.field}>
                  Nasz udział %
                  <input
                    max="10000"
                    min="0"
                    type="number"
                    value={entry.ourShareBasisPoints / 100}
                    onChange={(event) => patchMoney(entry.key, { ourShareBasisPoints: Math.round(Math.max(0, Math.min(100, Number(event.target.value))) * 100) })}
                  />
                </label>
                <button className={styles.buttonGhost} onClick={() => setMoneyRows((current) => current.filter((candidate) => candidate.key !== entry.key))} type="button">
                  Usuń
                </button>
              </div>
            ))}
          </div>
          <button
            className={styles.buttonGhost}
            onClick={() => setMoneyRows((current) => [...current, {
              id: '',
              key: `edit-money-${Date.now()}`,
              currency: 'yang',
              totalAmount: 0,
              ourShareBasisPoints: Math.round(share * 100),
            }])}
            type="button"
          >
            + Pieniądze
          </button>

          <div className={styles.grid}>
            <fieldset className={styles.participants}>
              <legend>Członkowie zespołu</legend>
              {members.map((member) => (
                <label key={member.id}>
                  <input
                    checked={selectedMembers.includes(member.id)}
                    onChange={(event) => setSelectedMembers((current) => event.target.checked ? [...new Set([...current, member.id])] : current.filter((id) => id !== member.id))}
                    type="checkbox"
                  />
                  {member.displayName}
                </label>
              ))}
            </fieldset>
            <label className={styles.field}>
              Osoby / ekipy z zewnątrz
              <textarea value={outsiders} onChange={(event) => setOutsiders(event.target.value)} />
            </label>
          </div>

          <div className={styles.rowActions}>
            <button className={styles.button} disabled={busy} type="submit">
              {busy ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
