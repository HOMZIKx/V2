'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { usePlayerStore } from '../../../../../src/player-store-react';
import { AppShell } from '../../../../app-shell';
import { DiscordEntryScreen } from '../../../../discord-entry';
import { EconomyContextNav } from '../economy-context-nav';
import { EconomySubnav } from '../economy-subnav';
import styles from '../economy-tools.module.css';

type CatalogItem = {
  id: string;
  canonicalName: string;
  category: string;
  imageUrl: string | null;
};

function api(workspaceId: string, path: string): string {
  return `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/${path}`;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Nie udało się odczytać obrazu.'));
    };
    reader.onerror = () => reject(new Error('Nie udało się odczytać obrazu.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nie udało się otworzyć obrazu.'));
    image.src = dataUrl;
  });
}

async function compactImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Obsługiwane formaty: PNG, JPG i WEBP.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Obraz jest za duży. Maksymalnie 8 MB.');

  const source = await readFile(file);
  const image = await loadImage(source);
  const maxSide = 96;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Przeglądarka nie obsługuje przetwarzania obrazu.');
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  let result = canvas.toDataURL('image/webp', 0.82);
  if (result.length > 75_000) result = canvas.toDataURL('image/webp', 0.58);
  if (result.length > 75_000) throw new Error('Nie udało się wystarczająco zmniejszyć obrazu.');
  return result;
}

export function EconomyImages() {
  const { teamId } = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === teamId && !entry.archived) ?? null;

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!workspace) return;
    setError('');
    try {
      const response = await fetch(api(workspace.id, `items?q=${encodeURIComponent(query)}`), {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Nie udało się pobrać katalogu.');
      setItems((await response.json()) as CatalogItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd katalogu.');
    }
  }, [workspace, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    setPreview('');
  }, [selectedId]);

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setPreview(await compactImage(file));
      setNotice('Podgląd gotowy. Obraz został zmniejszony do maksymalnie 96 px.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd przygotowania obrazu.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function saveImage() {
    if (!workspace || !selected || !preview) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(workspace.id, `management/items/${selected.id}/image`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: preview }),
      });
      if (!response.ok) {
        throw new Error('Zapis ilustracji wymaga ownera zespołu albo obraz jest nieprawidłowy.');
      }
      setNotice(`Ilustracja ${selected.canonicalName} zapisana.`);
      setPreview('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu ilustracji.');
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;
  if (!workspace) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className={styles.page}><section className={styles.panel}><h1>Nie znaleziono zespołu</h1></section></main>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className={styles.page} id="main-content">
          <EconomyContextNav currentLabel="Ilustracje" workspaceId={workspace.id} workspaceName={workspace.name} />

          <section className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>Zespół · Ekonomia · Ilustracje</span>
              <h1>{workspace.name}</h1>
              <p>Dodawanie własnych ikon do nowych i nierozpoznanych przedmiotów.</p>
            </div>
          </section>

          {error ? <p className={styles.error}>{error}</p> : null}
          {notice ? <p className={styles.notice}>{notice}</p> : null}

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Wybierz przedmiot</h2>
                <small>Najpierw wyszukaj rekord. Własny plik jest lokalnie zmniejszany i dopiero wtedy zapisywany.</small>
              </div>
            </div>
            <div className={styles.toolbar}>
              <label className={styles.field}>
                Nazwa / alias
                <input value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button className={styles.button} onClick={() => void load()} type="button">Szukaj</button>
            </div>
            <div className={styles.cardGrid}>
              {items.map((item) => (
                <button
                  className={styles.card}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  type="button"
                >
                  <span className={styles.itemHead}>
                    <span
                      className={styles.image}
                      style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
                    />
                    <span>
                      <strong>{item.canonicalName}</strong><br />
                      <small>{item.category}</small>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.panel} style={{ marginTop: 14 }}>
            <div className={styles.panelHeader}>
              <div>
                <h2>{selected ? selected.canonicalName : 'Ilustracja przedmiotu'}</h2>
                <small>PNG, JPG lub WEBP. Maks. plik wejściowy 8 MB; zapis maks. 96 px.</small>
              </div>
            </div>
            <div className={styles.cardGrid}>
              <article className={styles.card}>
                <h3>Aktualna ilustracja</h3>
                <div
                  className={styles.image}
                  style={{
                    width: 96,
                    height: 96,
                    marginTop: 12,
                    backgroundImage: selected?.imageUrl ? `url(${selected.imageUrl})` : undefined,
                  }}
                />
              </article>
              <article className={styles.card}>
                <h3>Nowa ilustracja</h3>
                <div
                  className={styles.image}
                  style={{
                    width: 96,
                    height: 96,
                    marginTop: 12,
                    backgroundImage: preview ? `url(${preview})` : undefined,
                  }}
                />
                <label className={styles.field} style={{ marginTop: 12 }}>
                  Wybierz plik
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!selected || busy}
                    onChange={(event) => void chooseImage(event)}
                    type="file"
                  />
                </label>
                <button
                  className={styles.button}
                  disabled={!selected || !preview || busy}
                  onClick={() => void saveImage()}
                  type="button"
                >
                  Zapisz ilustrację
                </button>
              </article>
            </div>
          </section>
        </main>
      </AppShell>
      <EconomySubnav />
    </>
  );
}
