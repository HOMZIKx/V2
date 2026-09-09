'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';

import { resolveAiObservationFeedback } from '../../../../../src/ai-observation-feedback';
import {
  equipmentSlotForCategory,
  parseEnhancementFromName,
  searchGameItems,
  stripEnhancementFromName,
} from '../../../../../src/item-catalog';
import {
  equipmentSlots,
  slotLabels,
  type EquipmentSlot,
} from '../../../../../src/player-store';
import { usePlayerStore } from '../../../../../src/player-store-react';
import { Icon } from '../../../../app-shell';
import styles from './equipment-screenshot-add.module.css';

type AnalysisPayload = {
  readonly analysisId?: string | null;
  readonly draft?: {
    readonly name?: string;
    readonly enhancement?: number;
    readonly category?: EquipmentSlot | null;
    readonly bonuses?: readonly string[];
    readonly notes?: string;
  };
  readonly error?: string;
};

type Draft = {
  readonly name: string;
  readonly enhancement: number;
  readonly category: EquipmentSlot;
  readonly bonusesText: string;
};

function clampEnhancement(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9, Math.max(0, Math.trunc(value)));
}

function cleanBonuses(value: string): readonly string[] {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

export function EquipmentScreenshotAdd() {
  const params = useParams<{ teamId: string; characterId: string }>();
  const { state, writesEnabled, createItem, confirmLocation } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [analysisNote, setAnalysisNote] = useState('');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [triggerTarget, setTriggerTarget] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    name: '',
    enhancement: 0,
    category: 'weapon',
    bonusesText: '',
  });

  useEffect(() => {
    setMounted(true);
    let hiddenButton: HTMLButtonElement | null = null;
    const discover = () => {
      const candidate = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) =>
          !button.hasAttribute('data-eq-ai-beta') &&
          button.textContent?.trim().includes('Dodaj ze screena'),
      );
      if (!candidate) return;
      hiddenButton = candidate;
      candidate.style.display = 'none';
      setTriggerTarget(candidate.parentElement);
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (hiddenButton) hiddenButton.style.display = '';
    };
  }, []);

  const catalogMatches = useMemo(() => {
    const query = stripEnhancementFromName(draft.name).trim();
    if (query.length < 2) return [];
    return searchGameItems(query)
      .filter((item) => equipmentSlotForCategory(item.category) !== null)
      .slice(0, 6);
  }, [draft.name]);

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setError(null);
    setReviewRequired(false);
    setAnalysisNote('');
    setAnalysisId(null);
    setDraft({ name: '', enhancement: 0, category: 'weapon', bonusesText: '' });
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const analyze = async () => {
    if (!file || !workspace) {
      setError('Wybierz screen pojedynczego tooltipa przedmiotu.');
      return;
    }

    setStatus('loading');
    setError(null);
    const body = new FormData();
    body.append('image', file);
    body.append('workspaceId', workspace.id);
    body.append('characterId', params.characterId);

    try {
      const response = await fetch('/api/equipment/analyze-item', { method: 'POST', body });
      const payload = (await response.json()) as AnalysisPayload;
      if (!response.ok || !payload.draft?.name) {
        throw new Error(payload.error || 'Nie udało się odczytać przedmiotu ze screena.');
      }

      const baseName = stripEnhancementFromName(payload.draft.name);
      const enhancement = clampEnhancement(
        payload.draft.enhancement ?? parseEnhancementFromName(payload.draft.name),
      );
      const matches = searchGameItems(baseName)
        .filter((item) => equipmentSlotForCategory(item.category) !== null)
        .slice(0, 8);
      const exact = matches.find(
        (item) => item.title.trim().toLocaleLowerCase('pl') === baseName.trim().toLocaleLowerCase('pl'),
      );
      const best = exact ?? matches[0] ?? null;
      const catalogSlot = best ? equipmentSlotForCategory(best.category) : null;
      const resolvedSlot = catalogSlot ?? payload.draft.category ?? null;

      setAnalysisId(
        typeof payload.analysisId === 'string' && payload.analysisId.trim()
          ? payload.analysisId.trim()
          : null,
      );
      setDraft((current) => ({
        name: best?.title ?? baseName,
        enhancement,
        category: resolvedSlot ?? current.category,
        bonusesText: (payload.draft?.bonuses ?? []).join('\n'),
      }));
      setReviewRequired(resolvedSlot === null);
      setAnalysisNote(payload.draft.notes?.trim() ?? '');
      setStatus('done');
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Analiza screena nie powiodła się.');
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace || !writesEnabled) {
      setError('Zapis jest wyłączony dla tej sesji.');
      return;
    }
    if (draft.name.trim().length < 2) {
      setError('Podaj nazwę przedmiotu.');
      return;
    }
    if (reviewRequired) {
      setError('Potwierdź typ / slot przedmiotu przed dodaniem do wspólnej torby.');
      return;
    }

    const bonuses = cleanBonuses(draft.bonusesText);
    const createdId = createItem(workspace.id, {
      name: draft.name.trim(),
      category: draft.category,
      enhancement: clampEnhancement(draft.enhancement),
      bonuses,
      planned: false,
    });
    if (!createdId) {
      setError('Nie udało się utworzyć karty. Sprawdź nazwę i typ przedmiotu.');
      return;
    }

    confirmLocation(workspace.id, createdId, 'Torba I');
    if (analysisId) {
      void resolveAiObservationFeedback(analysisId, {
        name: draft.name.trim(),
        enhancement: clampEnhancement(draft.enhancement),
        category: draft.category,
        bonuses,
      });
    }
    close();
  };

  if (!workspace || state.authStatus !== 'authenticated' || !mounted) return null;

  const trigger = (
    <button
      className={styles.trigger}
      data-eq-ai-beta="true"
      disabled={!writesEnabled}
      onClick={() => setOpen(true)}
      type="button"
    >
      <Icon name="plus" size={15} />
      Dodaj ze screena · AI (beta)
    </button>
  );

  const modal = open ? (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section aria-label="Dodaj przedmiot ze screena — AI beta" className={styles.modal} role="dialog">
        <header className={styles.header}>
          <div>
            <strong>Dodaj przedmiot ze screena · AI (beta)</strong>
            <span>AI przygotowuje szkic. Ty zatwierdzasz dane przed zapisaniem do wspólnej torby.</span>
          </div>
          <button aria-label="Zamknij" className={styles.close} onClick={close} type="button">
            <Icon name="x" size={17} />
          </button>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <p className={styles.review}>
            AI może się pomylić. Zweryfikuj nazwę, ulepszenie, slot i bonusy przed zapisaniem karty.
          </p>
          <label className={styles.upload}>
            <span>Screen pojedynczego tooltipa · AI (beta)</span>
            <input
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setStatus('idle');
                setError(null);
                setAnalysisId(null);
              }}
              type="file"
            />
            <button
              className={styles.analyze}
              disabled={!file || status === 'loading'}
              onClick={(event) => {
                event.preventDefault();
                void analyze();
              }}
              type="button"
            >
              {status === 'loading' ? 'Analizuję…' : 'Analizuj screen · AI (beta)'}
            </button>
          </label>

          {status === 'done' ? (
            <p className={styles.info}>Analiza gotowa. Sprawdź dane i dopiero wtedy dodaj kartę.</p>
          ) : null}
          {analysisNote ? <p className={styles.review}>{analysisNote}</p> : null}

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Nazwa</span>
              <input
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                value={draft.name}
              />
            </label>
            <label className={styles.field}>
              <span>+N</span>
              <input
                max={9}
                min={0}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  enhancement: clampEnhancement(Number(event.target.value)),
                }))}
                type="number"
                value={draft.enhancement}
              />
            </label>
            <label className={styles.field}>
              <span>Typ / slot</span>
              <select
                onChange={(event) => {
                  setReviewRequired(false);
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as EquipmentSlot,
                  }));
                }}
                value={draft.category}
              >
                {equipmentSlots.map((slot) => (
                  <option key={slot} value={slot}>{slotLabels[slot]}</option>
                ))}
              </select>
            </label>
          </div>

          {catalogMatches.length > 0 ? (
            <p className={styles.info}>
              Baza V2: {catalogMatches.slice(0, 3).map((item) => item.title).join(' · ')}
            </p>
          ) : null}

          {reviewRequired ? (
            <p className={styles.review}>AI nie rozpoznało typu. Wybierz właściwy slot ręcznie.</p>
          ) : null}

          <label className={styles.field}>
            <span>Bonusy — jedna linia = jeden bonus</span>
            <textarea
              onChange={(event) => setDraft((current) => ({ ...current, bonusesText: event.target.value }))}
              placeholder="np. Silny przeciwko Nieumarłym +20%"
              value={draft.bonusesText}
            />
          </label>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.actions}>
            <button className={styles.cancel} onClick={close} type="button">Anuluj</button>
            <button className={styles.save} disabled={!writesEnabled} type="submit">
              Potwierdź i dodaj do torby
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  return (
    <>
      {triggerTarget ? createPortal(trigger, triggerTarget) : trigger}
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
