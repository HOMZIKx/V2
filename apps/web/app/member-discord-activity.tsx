'use client';

import { useEffect, useState } from 'react';

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

const WINDOWS: { id: RankingWindow; label: string }[] = [
  { id: '7d', label: '7 dni' },
  { id: '14d', label: '14 dni' },
  { id: '30d', label: '30 dni' },
];

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setResolving(true);
      setError(null);
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
    // viewer object identity may change; membership fields are read inside resolve
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve on account id only
  }, [discordUserId]);

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
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
        if (cancelled) return;
        if (me.ok && me.rows[0]) setMyRow(me.rows[0]);
        else setMyRow(null);
        if (ranking.ok) {
          setTop(ranking.rows.slice(0, 10));
        } else {
          setTop([]);
          if (ranking.offline) {
            setError('Discord gateway offline — aktywność chwilowo niedostępna.');
          } else {
            setError('Nie udało się wczytać rankingu: ' + ranking.error);
          }
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolved, windowId, discordUserId]);

  return (
    <section className="panel ma-pulpit" aria-label="Aktywność Discord">
      <header className="ma-pulpit__head">
        <div>
          <span className="eyebrow">Discord</span>
          <h2>Twoja aktywność Discord</h2>
          <p className="ma-pulpit__lead">
            Wiadomości, czas na VC i wynik z wybranego serwera. Nowi gracze: to nie jest ranking
            kanału — tylko spokojny podgląd Twojej aktywności.
          </p>
        </div>
        <div className="ma-seg" role="tablist" aria-label="Okno aktywności">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={windowId === w.id}
              className={windowId === w.id ? 'ma-seg__btn is-on' : 'ma-seg__btn'}
              onClick={() => setWindowId(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      {resolving ? (
        <p className="empty-copy">Szukam Twojego serwera Discord…</p>
      ) : !resolved ? (
        <div className="ma-pulpit__empty">
          <p>
            Nie widzę Cię na Destiled ani na Projekt Sojusz (albo bot jeszcze nie zbiera
            aktywności). Gdy dołączysz do jednego z tych serwerów i bot Cię zobaczy, tu pojawi się
            Twój wynik.
          </p>
        </div>
      ) : (
        <>
          <p className="ma-pulpit__guild" role="status">
            Serwer: <strong>{resolved.guildName}</strong>
            <span className="ma-pulpit__guild-hint">
              {resolved.method === 'viewer_guilds'
                ? ' · z Twojego konta'
                : ' · wykryty po aktywności'}
            </span>
          </p>

          <div className="ma-pulpit__stats">
            {myRow ? (
              <>
                <article>
                  <strong>{myRow.messages ?? '—'}</strong>
                  <span>wiadomości</span>
                </article>
                <article>
                  <strong>{myRow.voiceMinutes ?? '—'}</strong>
                  <span>minut VC</span>
                </article>
                <article>
                  <strong>{myRow.score}</strong>
                  <span>wynik{typeof myRow.rank === 'number' ? ' · #' + String(myRow.rank) : ''}</span>
                </article>
              </>
            ) : (
              <p className="empty-copy">
                {busy
                  ? 'Ładuję Twoją aktywność…'
                  : 'Jesteś na serwerze, ale w tym oknie nie ma jeszcze punktów — napisz coś lub wejdź na VC.'}
              </p>
            )}
          </div>

          <div className="ma-pulpit__top">
            <h3>Top 10 — {resolved.guildName}</h3>
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
            {top.length === 0 && !error ? (
              <p className="empty-copy">
                {busy ? 'Ładuję ranking…' : 'Brak wpisów w rankingu dla tego okna.'}
              </p>
            ) : top.length > 0 ? (
              <div className="ma-table-wrap ma-pulpit__table">
                <table className="ma-rank-table">
                  <thead>
                    <tr>
                      <th className="ma-num" scope="col">
                        #
                      </th>
                      <th scope="col">Gracz</th>
                      <th className="ma-num" scope="col">
                        Wynik
                      </th>
                      <th className="ma-num" scope="col">
                        Msg
                      </th>
                      <th className="ma-num" scope="col">
                        VC min
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((r, i) => (
                      <tr key={r.discordUserId + String(i)}>
                        <td className="ma-num">{r.rank ?? i + 1}</td>
                        <td>
                          <DiscordNick
                            discordUserId={r.discordUserId}
                            displayName={r.displayName}
                          />
                        </td>
                        <td className="ma-num">{r.score}</td>
                        <td className="ma-num">{r.messages ?? '—'}</td>
                        <td className="ma-num">{r.voiceMinutes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
