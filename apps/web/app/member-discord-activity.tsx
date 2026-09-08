'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  resolveMemberActivityGuild,
  type ResolvedMemberActivityGuild,
} from '../src/member-activity-guild';
import {
  fetchMemberActivityRanking,
  fetchMyRanking,
  type RankingRow,
  type RankingWindow,
} from '../src/technik/member-activity-api';
import styles from './member-discord-activity.module.css';

const WINDOWS: { id: RankingWindow; label: string }[] = [
  { id: '7d', label: '7 dni' },
  { id: '14d', label: '14 dni' },
  { id: '30d', label: '30 dni' },
];

const RANKING_REFRESH_MS = 60 * 1000;

function DiscordNick({
  discordUserId,
  displayName,
}: {
  readonly discordUserId: string;
  readonly displayName: string;
}) {
  return (
    <a
      className="ma-player__name"
      href={'https://discord.com/users/' + discordUserId}
      target="_blank"
      rel="noreferrer"
    >
      {displayName}
    </a>
  );
}

function playerInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('pl');
  return `${parts[0]![0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toLocaleUpperCase('pl');
}

function formatVoice(minutes: number | undefined): { value: string; unit: string } {
  if (typeof minutes !== 'number') return { value: '—', unit: '' };
  if (minutes < 60) return { value: String(minutes), unit: 'min' };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return { value: rest ? `${hours}h ${rest}` : `${hours}h`, unit: rest ? 'min' : '' };
}

function rankClass(rank: number): string {
  if (rank === 1) return styles.rankOne ?? '';
  if (rank === 2) return styles.rankTwo ?? '';
  if (rank === 3) return styles.rankThree ?? '';
  return '';
}

function rowClass(rank: number): string {
  if (rank === 1) return styles.topOne ?? '';
  if (rank === 2) return styles.topTwo ?? '';
  if (rank === 3) return styles.topThree ?? '';
  return '';
}

type Props = {
  readonly discordUserId: string;
  readonly viewer: unknown;
};

export function MemberDiscordActivity({ discordUserId, viewer }: Props) {
  const [windowId, setWindowId] = useState<RankingWindow>('7d');
  const [resolved, setResolved] = useState<ResolvedMemberActivityGuild | null>(null);
  const [resolving, setResolving] = useState(true);
  const [myRow, setMyRow] = useState<RankingRow | null>(null);
  const [top, setTop] = useState<readonly RankingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshedHint, setRefreshedHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setResolving(true);
      setError(null);
      if (!/^\d{17,20}$/.test(discordUserId)) {
        if (!cancelled) {
          setResolved(null);
          setResolving(false);
          setError('Brak poprawnego Discord user ID w sesji — zaloguj się ponownie przez Discord.');
          setMyRow(null);
          setTop([]);
        }
        return;
      }
      const g = await resolveMemberActivityGuild({
        discordUserId,
        viewer,
        window: '7d',
      });
      if (cancelled) return;
      setResolved(g);
      setResolving(false);
      if (!g) {
        setMyRow(null);
        setTop([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discordUserId, viewer]);

  const loadActivity = useCallback(
    async (opts?: { readonly silent?: boolean }) => {
      if (!resolved) return;
      const silent = Boolean(opts?.silent);
      if (!silent) {
        setBusy(true);
        setError(null);
      }
      try {
        const [me, ranking] = await Promise.all([
          fetchMyRanking({
            window: windowId,
            discordUserId,
            guildId: resolved.guildId,
          }),
          fetchMemberActivityRanking({
            window: windowId,
            guildId: resolved.guildId,
            topN: 10,
            full: false,
          }),
        ]);

        const parts: string[] = [];
        if (me.ok) {
          const self = me.rows.find((row) => row.discordUserId === discordUserId) ?? null;
          setMyRow(self);
        } else if (!silent) {
          setMyRow(null);
          parts.push(
            'Twoja aktywność: ' +
              me.error +
              (me.detail ? ' — ' + me.detail : '') +
              (me.status ? ' (HTTP ' + String(me.status) + ')' : ''),
          );
        }

        if (ranking.ok) {
          setTop(ranking.rows.slice(0, 10));
          const t = new Date();
          const hh = String(t.getHours()).padStart(2, '0');
          const mm = String(t.getMinutes()).padStart(2, '0');
          setRefreshedHint('odświeżono ' + hh + ':' + mm);
        } else if (!silent) {
          setTop([]);
          if (ranking.offline) {
            parts.push('Discord gateway offline — ranking chwilowo niedostępny.');
          } else {
            parts.push(
              'Ranking: ' +
                ranking.error +
                (ranking.detail ? ' — ' + ranking.detail : '') +
                (ranking.status ? ' (HTTP ' + String(ranking.status) + ')' : ''),
            );
          }
        }

        if (!silent) setError(parts.length ? parts.join(' ') : null);
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [resolved, windowId, discordUserId],
  );

  useEffect(() => {
    if (!resolved) return;
    void loadActivity();
  }, [resolved, loadActivity]);

  useEffect(() => {
    if (!resolved) return;
    const refresh = () => {
      void loadActivity({ silent: true });
    };
    const id = window.setInterval(refresh, RANKING_REFRESH_MS);
    const onFocus = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [resolved, loadActivity]);

  const maxScore = useMemo(() => Math.max(1, ...top.map((row) => row.score)), [top]);
  const myVoice = formatVoice(myRow?.voiceMinutes);

  return (
    <section className={`panel ma-pulpit ${styles.activityPanel}`} aria-label="Aktywność Discord">
      <header className={styles.head}>
        <div className={styles.heading}>
          <span className="eyebrow">Discord · aktywność</span>
          <h2>Twój pulpit aktywności</h2>
          <p className={styles.lead}>
            Szybki podgląd Twojej aktywności i rankingu społeczności. Wynik łączy wiadomości i
            aktywność na kanałach głosowych w wybranym okresie.
          </p>
        </div>
        <div className={styles.windowTabs} role="tablist" aria-label="Okno aktywności">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={windowId === w.id}
              className={`${styles.windowButton}${windowId === w.id ? ` ${styles.windowButtonActive}` : ''}`}
              onClick={() => setWindowId(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      {resolving ? (
        <p className={`empty-copy ${styles.emptyState}`}>Szukam Twojego serwera Discord…</p>
      ) : !resolved ? (
        <div className={`ma-pulpit__empty ${styles.emptyState}`}>
          <p>
            {error ??
              'Nie widzę Cię na Destiled ani na Projekt Sojusz (albo bot jeszcze nie zbiera aktywności).'}
          </p>
          <p className="empty-copy">
            Logowanie Discord ograniczone do serwerów z botem — egzekucja Auth osobno.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.serverBar} role="status">
            <span className={styles.serverDot} aria-hidden />
            <span>Serwer</span>
            <strong>{resolved.guildName}</strong>
            <span>
              {resolved.method === 'viewer_guilds'
                ? '· z Twojego konta'
                : resolved.method === 'fallback_destiled'
                  ? '· domyślny Destiled'
                  : '· wykryty po aktywności'}
            </span>
            {refreshedHint ? <span className={styles.refreshHint}>{refreshedHint}</span> : null}
          </div>

          {error ? (
            <p className={`field-error ${styles.error}`} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.statsGrid}>
            {myRow ? (
              <>
                <article className={styles.statCard}>
                  <span className={styles.statLabel}>Wiadomości</span>
                  <strong className={styles.statValue}>{myRow.messages ?? '—'}</strong>
                  <span className={styles.statMeta}>wysłane w tym okresie</span>
                </article>
                <article className={styles.statCard}>
                  <span className={styles.statLabel}>Voice chat</span>
                  <strong className={styles.statValue}>{myVoice.value}</strong>
                  <span className={styles.statMeta}>{myVoice.unit || 'czas na kanałach VC'}</span>
                </article>
                <article className={styles.statCard}>
                  <span className={styles.statLabel}>Wynik aktywności</span>
                  <strong className={styles.statValue}>{myRow.score}</strong>
                  <span className={styles.statMeta}>
                    {typeof myRow.rank === 'number' ? `pozycja #${myRow.rank} w rankingu` : 'ranking społeczności'}
                  </span>
                </article>
              </>
            ) : (
              <p className="empty-copy">
                {busy
                  ? 'Ładuję Twoją aktywność…'
                  : error
                    ? 'Nie udało się wczytać Twojej aktywności (szczegóły powyżej).'
                    : 'Jesteś na serwerze, ale w tym oknie nie ma jeszcze punktów — napisz coś lub wejdź na VC.'}
              </p>
            )}
          </div>

          <section className={styles.rankingCard} aria-label={`Top 10 — ${resolved.guildName}`}>
            <header className={styles.rankingHeader}>
              <div>
                <h3>Ranking aktywności · Top 10</h3>
                <p>{resolved.guildName} · {WINDOWS.find((entry) => entry.id === windowId)?.label}</p>
              </div>
              <span className={styles.liveBadge}>Live</span>
            </header>

            {top.length === 0 && !error ? (
              <p className={`empty-copy ${styles.emptyState}`}>
                {busy ? 'Ładuję ranking…' : 'Brak wpisów w rankingu dla tego okna.'}
              </p>
            ) : top.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Pozycja</th>
                      <th scope="col">Gracz</th>
                      <th scope="col">Wynik</th>
                      <th scope="col">Wiad.</th>
                      <th scope="col">VC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((row, index) => {
                      const rank = row.rank ?? index + 1;
                      const isSelf = row.discordUserId === discordUserId;
                      const voice = formatVoice(row.voiceMinutes);
                      const scorePercent = Math.max(3, Math.min(100, (row.score / maxScore) * 100));
                      return (
                        <tr
                          className={`${styles.row} ${rowClass(rank)}${isSelf ? ` ${styles.selfRow}` : ''}`}
                          key={row.discordUserId + String(index)}
                        >
                          <td className={styles.rankCell}>
                            <span className={`${styles.rankBadge} ${rankClass(rank)}`}>#{rank}</span>
                          </td>
                          <td>
                            <div className={styles.playerCell}>
                              <span className={styles.avatar} aria-hidden>{playerInitials(row.displayName)}</span>
                              <div className={styles.playerInfo}>
                                <div>
                                  <DiscordNick discordUserId={row.discordUserId} displayName={row.displayName} />
                                  {isSelf ? <em className={styles.youBadge}>TY</em> : null}
                                </div>
                                <small>Discord</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className={styles.scoreCell}>
                              <div className={styles.scoreTopline}>
                                <strong>{row.score}</strong>
                                <span>pkt</span>
                              </div>
                              <span className={styles.scoreTrack} aria-hidden>
                                <span className={styles.scoreFill} style={{ width: `${scorePercent}%` }} />
                              </span>
                            </div>
                          </td>
                          <td className={styles.metricCell}>{row.messages ?? '—'}</td>
                          <td className={styles.metricCell}>
                            {voice.value}{voice.unit ? <small>{voice.unit}</small> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}
