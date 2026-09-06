'use client';

import { useCallback, useEffect, useState } from 'react';

import { D060Controls } from './d060-controls';
import {
  DEFAULT_MEMBER_ACTIVITY,
  DEFAULT_MEMBER_ACTIVITY_GUILD_ID,
  type ApiReachability,
  type MemberActivityConfig,
  type RankingRow,
  type RankingWindow,
  detectMemberActivityRanking,
  fetchMemberActivityRanking,
  fetchMyRanking,
  windowDaysToRankingWindow,
} from './member-activity-api';
import { fetchGuildRoles, roleLabel, type GuildRole } from './guild-roles-api';
import { HonestGap } from './ui-notes';
import { KNOWN_GUILD_NAMES, putConfigDraft } from './technika-config-api';
import { useTechnikaConfig } from './use-technika-config';
import { usePlayerStore } from '../player-store-react';

const WINDOWS: { id: RankingWindow; label: string }[] = [
  { id: '7d', label: '7 dni' },
  { id: '14d', label: '14 dni' },
  { id: '30d', label: '30 dni' },
  { id: 'since_bot', label: 'Od startu bota' },
];

function DiscordProfileLink({
  discordUserId,
  displayName,
}: {
  readonly discordUserId: string;
  readonly displayName: string;
}) {
  const webHref = 'https://discord.com/users/' + discordUserId;
  return (
    <a className="ma-player__name" href={webHref} target="_blank" rel="noreferrer">
      {displayName}
    </a>
  );
}

function readMemberActivityFromConfig(
  cfg: Record<string, unknown> | null | undefined,
): MemberActivityConfig {
  const raw =
    cfg && typeof cfg.memberActivity === 'object' && cfg.memberActivity
      ? (cfg.memberActivity as Record<string, unknown>)
      : null;
  if (!raw) return { ...DEFAULT_MEMBER_ACTIVITY };
  const roles = Array.isArray(raw.memberRoleIds)
    ? raw.memberRoleIds.map(String).filter((id) => /^\d{17,20}$/.test(id))
    : [];
  const windowDays =
    raw.windowDays === 14 || raw.windowDays === 30 ? Number(raw.windowDays) : 7;
  return {
    enabled: raw.enabled !== false,
    guildId:
      typeof raw.guildId === 'string' && /^\d{17,20}$/.test(raw.guildId)
        ? raw.guildId
        : DEFAULT_MEMBER_ACTIVITY_GUILD_ID,
    memberRoleIds: roles,
    windowDays,
    topN: typeof raw.topN === 'number' && raw.topN > 0 ? Math.min(500, raw.topN) : 10,
  };
}

function rankStatusLabel(s: ApiReachability): string {
  if (s === 'checking') return 'Sprawdzam API…';
  if (s === 'live') return 'API gotowe';
  if (s === 'offline') return 'Gateway offline';
  return 'API niedostępne';
}

export function TechnikMemberActivityPage() {
  const cfg = useTechnikaConfig();
  const { state } = usePlayerStore();
  const viewerDiscordId = state.viewer?.discordAccountId ?? '';
  const [draft, setDraft] = useState<MemberActivityConfig>(DEFAULT_MEMBER_ACTIVITY);
  const [hasCap, setHasCap] = useState(false);
  const [rankStatus, setRankStatus] = useState<ApiReachability>('checking');
  const [windowId, setWindowId] = useState<RankingWindow>('7d');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<readonly RankingRow[]>([]);
  const [myRow, setMyRow] = useState<RankingRow | null>(null);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasteRole, setPasteRole] = useState('');
  const [guildRoles, setGuildRoles] = useState<readonly GuildRole[]>([]);
  const [rolesOffline, setRolesOffline] = useState(false);
  const [rolesApiNote, setRolesApiNote] = useState<string | null>(null);
  const [rolePick, setRolePick] = useState('');

  useEffect(() => {
    const hit = cfg.capabilities.some(
      (c) => c.id === 'memberActivity' || c.id === 'member-activity',
    );
    setHasCap(hit);
    const fromSnap = readMemberActivityFromConfig(
      cfg.snapshot?.config as unknown as Record<string, unknown> | undefined,
    );
    setDraft(fromSnap);
    setWindowId(windowDaysToRankingWindow(fromSnap.windowDays));
  }, [cfg.capabilities, cfg.snapshot]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchGuildRoles(draft.guildId);
      if (cancelled) return;
      if (res.ok) {
        setGuildRoles(res.roles);
        setRolesOffline(false);
        setRolesApiNote(null);
      } else if (res.unavailable) {
        setGuildRoles([]);
        setRolesOffline(true);
        setRolesApiNote('Lista ról offline — wklej ID tylko jako zapas.');
      } else {
        setGuildRoles([]);
        setRolesOffline(true);
        setRolesApiNote('Role: ' + res.error + ' (HTTP ' + String(res.status) + ')');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.guildId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await detectMemberActivityRanking();
      if (!cancelled) setRankStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRanking = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchMemberActivityRanking({
        window: windowId,
        guildId: draft.guildId,
        ...(q.trim() ? { q: q.trim() } : {}),
        full: true,
      });
      if (!res.ok) {
        setRows([]);
        setTotalMembers(null);
        if (res.offline) setRankStatus('offline');
        setMsg(
          (res.offline ? 'Gateway offline: ' : 'Ranking: ') +
            res.error +
            (res.detail ? ' — ' + res.detail : '') +
            (res.status ? ' (HTTP ' + String(res.status) + ')' : ''),
        );
      } else {
        setRankStatus('live');
        setRows(res.rows);
        setTotalMembers(typeof res.totalMembers === 'number' ? res.totalMembers : null);
      }
      if (viewerDiscordId) {
        const me = await fetchMyRanking({
          window: windowId,
          discordUserId: viewerDiscordId,
          guildId: draft.guildId,
        });
        if (me.ok && me.rows[0]) setMyRow(me.rows[0]);
        else setMyRow(null);
      } else {
        setMyRow(null);
      }
    } finally {
      setBusy(false);
    }
  }, [windowId, q, draft.guildId, viewerDiscordId]);

  useEffect(() => {
    if (rankStatus === 'live') void loadRanking();
  }, [rankStatus, loadRanking]);

  const persistDraft = async (next: MemberActivityConfig) => {
    setDraft(next);
    if (!hasCap) {
      setMsg(
        'Brak możliwości „aktywność członków” w capabilities — UI lokalne do czasu gateway.',
      );
      return;
    }
    if (!cfg.canWrite) {
      setMsg('Brak sekretu Technika — nie zapiszę do szkicu.');
      return;
    }
    setBusy(true);
    try {
      const base = cfg.buildDraftPartial();
      const res = await putConfigDraft({ ...base, memberActivity: next });
      if (!res.ok) {
        setMsg('Szkic: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        return;
      }
      setMsg('Zapisano do szkicu — Sprawdź → Zobacz → Zapisz i włącz.');
      cfg.setLastAction('draft memberActivity');
      cfg.setStep('Draft');
      await cfg.load();
    } finally {
      setBusy(false);
    }
  };

  const addRoleId = (id: string) => {
    if (!/^\d{17,20}$/.test(id)) return;
    if (draft.memberRoleIds.includes(id)) return;
    void persistDraft({ ...draft, memberRoleIds: [...draft.memberRoleIds, id] });
    setRolePick('');
    setPasteRole('');
  };

  const removeRoleId = (id: string) => {
    void persistDraft({
      ...draft,
      memberRoleIds: draft.memberRoleIds.filter((x) => x !== id),
    });
  };

  const sourceName = KNOWN_GUILD_NAMES[draft.guildId] ?? 'źródłowa guildia';
  const rolesLive = guildRoles.length > 0;

  return (
    <div className="ma-page">
      <header className="ma-hero">
        <div className="ma-hero__titles">
          <h1>Aktywność członków</h1>
          <p className="technik-lead ma-hero__lead">
            Zbieranie aktywności z Destiled i pełny ranking ops. Okna 7 / 14 / 30 dni albo od startu
            bota — bez spamu na kanale.
          </p>
        </div>
        <div className="ma-hero__pills">
          <span
            className={
              hasCap ? 'technik-pill technik-pill--live' : 'technik-pill technik-pill--pending'
            }
          >
            {hasCap ? 'memberActivity' : 'brak capability'}
          </span>
          <span
            className={
              rankStatus === 'live'
                ? 'technik-pill technik-pill--live'
                : 'technik-pill technik-pill--pending'
            }
          >
            {rankStatusLabel(rankStatus)}
          </span>
        </div>
      </header>

      <p className="ma-strip" role="note">
        <strong>Ops.</strong> Włączasz zbieranie, wskazujesz guildię i role, przeglądasz ranking.
        Gracze nie dostają publicznego rankingu na kanale — DM tylko według powiadomień zespołu.
      </p>

      {!hasCap ? (
        <HonestGap>
          <p>
            Bot jeszcze nie wystawia możliwości „aktywność członków” (albo gateway offline). Formularz
            jest gotowy — po live zapis pójdzie do szkicu → Apply.
          </p>
        </HonestGap>
      ) : null}

      <section className="technik-panel technik-panel--live-config ma-card">
        <h2>Konfiguracja</h2>
        <label className="technik-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={busy}
            onChange={(e) => void persistDraft({ ...draft, enabled: e.target.checked })}
          />
          Włącz zbieranie aktywności
        </label>

        <label className="technik-field">
          <span>Guildia źródłowa</span>
          <select
            value={draft.guildId}
            disabled={busy}
            onChange={(e) => void persistDraft({ ...draft, guildId: e.target.value })}
          >
            <option value={DEFAULT_MEMBER_ACTIVITY_GUILD_ID}>
              {KNOWN_GUILD_NAMES[DEFAULT_MEMBER_ACTIVITY_GUILD_ID] ?? 'Destiled'}
            </option>
            {Object.entries(KNOWN_GUILD_NAMES)
              .filter(([id]) => id !== DEFAULT_MEMBER_ACTIVITY_GUILD_ID)
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
          <small className="technik-help">Teraz: {sourceName}</small>
        </label>

        <div className="technik-field ma-roles">
          <span>Role członków</span>
          <small className="technik-help">
            Puste = wszyscy na guildii. Wybierz po nazwie; klik chipa usuwa.
          </small>
          {rolesApiNote ? <p className="technik-muted ma-roles__note">{rolesApiNote}</p> : null}
          <div className="technik-role-chips" role="list">
            {draft.memberRoleIds.length === 0 ? (
              <span className="technik-muted">Brak filtra ról</span>
            ) : (
              draft.memberRoleIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="technik-role-chip"
                  role="listitem"
                  disabled={busy}
                  title={id}
                  onClick={() => removeRoleId(id)}
                >
                  {roleLabel(id, guildRoles)} ×
                </button>
              ))
            )}
          </div>
          {rolesLive ? (
            <label className="technik-field ma-roles__pick">
              <span>Dodaj rolę</span>
              <select
                value={rolePick}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  setRolePick(id);
                  if (id) addRoleId(id);
                }}
              >
                <option value="">— wybierz po nazwie —</option>
                {guildRoles
                  .filter((r) => !draft.memberRoleIds.includes(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : rolesOffline ? (
            <div className="ma-roles__paste">
              <label className="technik-field" style={{ flex: 1, marginTop: 0 }}>
                <span>Dodaj rolę (ID Discord)</span>
                <input
                  value={pasteRole}
                  disabled={busy}
                  onChange={(e) => setPasteRole(e.target.value)}
                  placeholder="np. 123456789012345678"
                  inputMode="numeric"
                />
              </label>
              <button
                type="button"
                className="technik-btn-ghost ma-btn"
                disabled={busy}
                onClick={() => {
                  const id = pasteRole.trim();
                  if (/^\d{17,20}$/.test(id)) addRoleId(id);
                }}
              >
                Dodaj
              </button>
            </div>
          ) : (
            <p className="technik-muted">Ładuję listę ról…</p>
          )}
        </div>

        <div className="ma-config-grid">
          <label className="technik-field">
            <span>Domyślne okno</span>
            <select
              value={String(draft.windowDays)}
              disabled={busy}
              onChange={(e) => {
                const days = Number(e.target.value);
                void persistDraft({ ...draft, windowDays: days });
                setWindowId(windowDaysToRankingWindow(days));
              }}
            >
              <option value="7">7 dni</option>
              <option value="14">14 dni</option>
              <option value="30">30 dni</option>
            </select>
          </label>
          <label className="technik-field">
            <span>Top N (dashboard)</span>
            <input
              type="number"
              min={1}
              max={500}
              value={draft.topN}
              disabled={busy}
              onChange={(e) =>
                void persistDraft({
                  ...draft,
                  topN: Math.min(500, Math.max(1, Number(e.target.value) || 10)),
                })
              }
            />
          </label>
        </div>
        {msg ? (
          <p className="technik-test-status" role="status">
            {msg}
          </p>
        ) : null}
      </section>

      <section className="technik-panel technik-panel--wide ma-card ma-rank">
        <div className="technik-panel-head">
          <h2>Ranking</h2>
          <span
            className={
              rankStatus === 'live'
                ? 'technik-pill technik-pill--live'
                : 'technik-pill technik-pill--pending'
            }
          >
            {rankStatusLabel(rankStatus)}
          </span>
        </div>

        {rankStatus === 'offline' ? (
          <HonestGap>
            <p>
              Discord gateway na <strong>:4100</strong> nie odpowiada. Po starcie odśwież ranking.
            </p>
          </HonestGap>
        ) : null}

        {rankStatus === 'unavailable' ? (
          <HonestGap>
            <p>Endpoint rankingu jeszcze nie odpowiada (404). UI jest gotowe — podłączy się po live.</p>
          </HonestGap>
        ) : null}

        {rankStatus === 'live' || rankStatus === 'offline' ? (
          <>
            <div className="ma-seg" role="tablist" aria-label="Okno rankingu">
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

            <div className="ma-search">
              <label className="technik-field ma-search__field">
                <span className="ma-sr-only">Szukaj nicku</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void loadRanking();
                  }}
                  placeholder="Szukaj nicku…"
                />
              </label>
              <button
                type="button"
                className="ma-btn ma-btn--primary"
                disabled={busy}
                onClick={() => void loadRanking()}
              >
                {busy ? '…' : 'Szukaj / odśwież'}
              </button>
            </div>

            {myRow ? (
              <p className="ma-me">
                Ty:{' '}
                <DiscordProfileLink
                  discordUserId={myRow.discordUserId}
                  displayName={myRow.displayName}
                />
                <span className="ma-me__stats">
                  {' '}
                  · wynik {myRow.score}
                  {typeof myRow.messages === 'number' ? ' · msg ' + String(myRow.messages) : ''}
                  {typeof myRow.voiceMinutes === 'number'
                    ? ' · VC ' + String(myRow.voiceMinutes) + ' min'
                    : ''}
                </span>
              </p>
            ) : null}

            {totalMembers !== null ? (
              <p className="technik-muted ma-rank__meta">Członków w oknie: {totalMembers}</p>
            ) : null}

            {rows.length === 0 ? (
              <p className="technik-muted">Brak wierszy rankingu.</p>
            ) : (
              <div className="ma-table-wrap">
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
                    {rows.map((r, i) => (
                      <tr key={r.discordUserId + String(i)}>
                        <td className="ma-num">{r.rank ?? i + 1}</td>
                        <td>
                          <DiscordProfileLink
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
            )}
          </>
        ) : null}
      </section>

      <div className="ma-d060">
        <D060Controls
          step={cfg.step}
          onStep={cfg.setStep}
          snapshot={cfg.snapshot}
          canWrite={cfg.canWrite}
          metaLoaded={cfg.metaLoaded}
          writeBlockReason={cfg.writeBlockReason}
          busy={cfg.busy || busy}
          lastAction={cfg.lastAction}
          gatewayLabel={cfg.gatewayLabel}
          onValidate={() => void cfg.runValidate()}
          onPreview={() => void cfg.runPreview()}
          onApply={() => void cfg.runApply()}
          onRollback={() => void cfg.runRollback()}
          onRefresh={() => void cfg.load()}
          help="Aktywność wchodzi do szkicu powyżej, potem wspólny Apply."
          showStepper={false}
        />
      </div>
      {cfg.actionError ? (
        <p className="technik-error" role="alert">
          {cfg.actionError}
        </p>
      ) : null}
    </div>
  );
}
