'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
import {
  DEFAULT_TECHNIK_ACCESS,
  MATEUSZ_OPERATOR_DISCORD_ID,
  canAccessMemberActivityTechnik,
  ensureMateuszOperator,
  isPermanentTechnikOperator,
  readTechnikAccessFromConfig,
  resolveViewerDiscordId,
  type TechnikAccessConfig,
  type TechnikOperatorEntry,
} from './technik-access';

const WINDOWS: { id: RankingWindow; label: string }[] = [
  { id: '7d', label: '7 dni' },
  { id: '14d', label: '14 dni' },
  { id: '30d', label: '30 dni' },
  { id: 'since_bot', label: 'Od startu bota' },
];

const GUILD_OVERRIDE_KEY = 'technik.memberActivity.guildOverride';

function readGuildOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(GUILD_OVERRIDE_KEY);
    return v && /^\d{17,20}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function writeGuildOverride(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!id) window.localStorage.removeItem(GUILD_OVERRIDE_KEY);
    else window.localStorage.setItem(GUILD_OVERRIDE_KEY, id);
  } catch {
    /* ignore */
  }
}

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
  const windowDays =
    raw.windowDays === 14 || raw.windowDays === 30 ? Number(raw.windowDays) : 7;
  return {
    enabled: raw.enabled !== false,
    guildId:
      typeof raw.guildId === 'string' && /^\d{17,20}$/.test(raw.guildId)
        ? raw.guildId
        : DEFAULT_MEMBER_ACTIVITY_GUILD_ID,
    memberRoleIds: [],
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
  const viewerDiscordId =
    resolveViewerDiscordId(state.viewer) ||
    (state.viewer?.discordAccountId ?? '').trim() ||
    '';
  const [draft, setDraft] = useState<MemberActivityConfig>(DEFAULT_MEMBER_ACTIVITY);
  const [accessDraft, setAccessDraft] = useState<TechnikAccessConfig>(DEFAULT_TECHNIK_ACCESS);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [seenRevision, setSeenRevision] = useState<number | null>(null);
  const stickyGuildRef = useRef<string | null>(null);
  const [hasCap, setHasCap] = useState(false);
  const [rankStatus, setRankStatus] = useState<ApiReachability>('checking');
  const [windowId, setWindowId] = useState<RankingWindow>('7d');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<readonly RankingRow[]>([]);
  const [myRow, setMyRow] = useState<RankingRow | null>(null);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guildRoles, setGuildRoles] = useState<readonly GuildRole[]>([]);
  const [rolesOffline, setRolesOffline] = useState(false);
  const [rolesApiNote, setRolesApiNote] = useState<string | null>(null);
  const [adminRolePick, setAdminRolePick] = useState('');
  const [pasteAdminRole, setPasteAdminRole] = useState('');
  const [opId, setOpId] = useState('');
  const [opName, setOpName] = useState('');

  const allowed = canAccessMemberActivityTechnik({
    viewerDiscordId,
    viewer: state.viewer,
    access: accessDraft,
  });

  useEffect(() => {
    const hit = cfg.capabilities.some(
      (c) => c.id === 'memberActivity' || c.id === 'member-activity',
    );
    setHasCap(hit);
    const snapCfg = cfg.snapshot?.config as unknown as Record<string, unknown> | undefined;
    const fromSnap = readMemberActivityFromConfig(snapCfg);
    const accessFromSnap = readTechnikAccessFromConfig(snapCfg);
    const revision = cfg.snapshot?.revision ?? null;

    if (!draftHydrated) {
      const override = readGuildOverride();
      const guildId = override ?? fromSnap.guildId;
      stickyGuildRef.current = guildId;
      setDraft({ ...fromSnap, guildId, memberRoleIds: [] });
      setAccessDraft(accessFromSnap);
      setWindowId(windowDaysToRankingWindow(fromSnap.windowDays));
      setSeenRevision(revision);
      setDraftHydrated(true);
      return;
    }

    if (revision !== null && seenRevision !== null && revision !== seenRevision) {
      const override = readGuildOverride();
      let guildId = fromSnap.guildId;
      if (override && override !== fromSnap.guildId) {
        guildId = override;
      } else {
        writeGuildOverride(null);
        guildId = fromSnap.guildId;
      }
      stickyGuildRef.current = guildId;
      setDraft({ ...fromSnap, guildId, memberRoleIds: [] });
      setAccessDraft(accessFromSnap);
      setWindowId(windowDaysToRankingWindow(fromSnap.windowDays));
      setSeenRevision(revision);
      return;
    }
    // Snapshot refresh after putConfigDraft/load — do NOT clobber local draft.guildId.
  }, [cfg.capabilities, cfg.snapshot, draftHydrated, seenRevision]);

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
        setRolesApiNote('Lista ról offline — wklej ID Admin tylko jako zapas.');
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
    if (!allowed) return;
    if (rankStatus === 'live') void loadRanking();
  }, [rankStatus, loadRanking, allowed]);

  const persistAll = async (
    nextActivity: MemberActivityConfig,
    nextAccess: TechnikAccessConfig,
  ) => {
    const activity = { ...nextActivity, memberRoleIds: [] as const };
    setDraft(activity);
    setAccessDraft(nextAccess);
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
      const res = await putConfigDraft({
        ...base,
        memberActivity: activity,
        technikAccess: nextAccess,
      });
      if (!res.ok) {
        setMsg('Szkic: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        return;
      }
      setMsg('Zapisano do szkicu — Sprawdź → Zobacz → Zapisz i włącz.');
      cfg.setLastAction('draft memberActivity + technikAccess');
      cfg.setStep('Draft');
      await cfg.load();
    } finally {
      setBusy(false);
    }
  };

  const changeGuild = (guildId: string) => {
    writeGuildOverride(guildId);
    stickyGuildRef.current = guildId;
    void persistAll({ ...draft, guildId, memberRoleIds: [] }, accessDraft);
  };

  const addAdminRoleId = (id: string) => {
    if (!/^\d{17,20}$/.test(id)) return;
    if (accessDraft.adminRoleIds.includes(id)) return;
    void persistAll(draft, {
      ...accessDraft,
      adminRoleIds: [...accessDraft.adminRoleIds, id],
    });
    setAdminRolePick('');
    setPasteAdminRole('');
  };

  const removeAdminRoleId = (id: string) => {
    void persistAll(draft, {
      ...accessDraft,
      adminRoleIds: accessDraft.adminRoleIds.filter((x) => x !== id),
    });
  };

  const addOperator = () => {
    const id = opId.trim();
    if (!/^\d{17,20}$/.test(id)) {
      setMsg('ID operatora musi być snowflake Discord (17–20 cyfr).');
      return;
    }
    if (accessDraft.operators.some((o) => o.discordUserId === id)) return;
    const entry: TechnikOperatorEntry = opName.trim()
      ? { discordUserId: id, displayName: opName.trim() }
      : { discordUserId: id };
    void persistAll(draft, {
      ...accessDraft,
      operators: ensureMateuszOperator([...accessDraft.operators, entry]),
    });
    setOpId('');
    setOpName('');
  };

  const removeOperator = (id: string) => {
    if (isPermanentTechnikOperator(id)) return;
    void persistAll(draft, {
      ...accessDraft,
      operators: ensureMateuszOperator(
        accessDraft.operators.filter((o) => o.discordUserId !== id),
      ),
    });
  };

  const sourceName = KNOWN_GUILD_NAMES[draft.guildId] ?? 'źródłowa guildia';
  const rolesLive = guildRoles.length > 0;

  if (!draftHydrated) {
    return (
      <div className="ma-page">
        <p className="technik-muted">Ładowanie ustawień…</p>
      </div>
    );
  }

  if (!allowed) {
    const sessionIdLabel = viewerDiscordId
      ? viewerDiscordId
      : state.viewer?.id
        ? 'brak Discord ID w sesji (viewer.id=' + state.viewer.id + ')'
        : 'brak ID w sesji';
    return (
      <div className="ma-page">
        <header className="ma-hero">
          <div className="ma-hero__titles">
            <h1>Aktywność członków</h1>
          </div>
        </header>
        <HonestGap>
          <p>
            <strong>Ta sekcja wymaga roli operatora Technika.</strong> Mateusz (
            <code>{MATEUSZ_OPERATOR_DISCORD_ID}</code>) ma stały dostęp wpisany w kodzie — nie
            traci go przez listę operatorów ani lokalne logowanie bez Discord ID.
          </p>
          <p className="technik-muted">
            Sesja teraz: <code>{sessionIdLabel}</code>. Jeśli to Ty (Mateusz) i nadal widzisz ten
            komunikat, odśwież po zalogowaniu Discord albo sprawdź, czy sesja ma discordAccountId.
          </p>
          <p className="technik-muted">
            Reszta Technika działa normalnie — zablokowana jest tylko „Aktywność członków”.
          </p>
        </HonestGap>
      </div>
    );
  }

  return (
    <div className="ma-page">
      <header className="ma-hero">
        <div className="ma-hero__titles">
          <h1>Aktywność członków</h1>
          <p className="technik-lead ma-hero__lead">
            Zbieranie aktywności z wybranego serwera i pełny ranking ops. Okna 7 / 14 / 30 dni albo od
            startu bota — bez spamu na kanale.
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
        <strong>Ops.</strong> Włączasz zbieranie, wskazujesz guildię, przeglądasz ranking. Zakres
        liczenia = cały wybrany serwer. Dostęp do tej strony = sekcja Admin / operatorzy poniżej.
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
            onChange={(e) =>
              void persistAll({ ...draft, enabled: e.target.checked, memberRoleIds: [] }, accessDraft)
            }
          />
          Włącz zbieranie aktywności
        </label>

        <label className="technik-field">
          <span>Guildia źródłowa</span>
          <select
            value={draft.guildId}
            disabled={busy}
            onChange={(e) => changeGuild(e.target.value)}
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
          <small className="technik-help">
            Ranking dotyczy tylko: <strong>{sourceName}</strong>. Wybór zostaje sticky do Apply — nie
            wraca sam do Destiled po zapisie szkicu.
          </small>
        </label>

        <div className="ma-config-grid">
          <label className="technik-field">
            <span>Domyślne okno</span>
            <select
              value={String(draft.windowDays)}
              disabled={busy}
              onChange={(e) => {
                const days = Number(e.target.value);
                void persistAll(
                  { ...draft, windowDays: days, memberRoleIds: [] },
                  accessDraft,
                );
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
                void persistAll(
                  {
                    ...draft,
                    topN: Math.min(500, Math.max(1, Number(e.target.value) || 10)),
                    memberRoleIds: [],
                  },
                  accessDraft,
                )
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

      <section className="technik-panel technik-panel--live-config ma-card">
        <h2>Dostęp do Technika (Aktywność)</h2>
        <p className="technik-help">
          To NIE jest filtr rankingu — tylko kto widzi tę stronę w Technik. Auth Discord / membership
          serwera egzekwuje Identity osobno.
        </p>

        <div className="technik-field ma-roles">
          <span>Ranga Admin (Discord role IDs)</span>
          <small className="technik-help">
            Role, które odblokowują „Aktywność członków” w Technik dla posiadaczy (best-effort).
          </small>
          {rolesApiNote ? <p className="technik-muted ma-roles__note">{rolesApiNote}</p> : null}
          <div className="technik-role-chips" role="list">
            {accessDraft.adminRoleIds.length === 0 ? (
              <span className="technik-muted">Brak rang Admin</span>
            ) : (
              accessDraft.adminRoleIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="technik-role-chip"
                  role="listitem"
                  disabled={busy}
                  title={id}
                  onClick={() => removeAdminRoleId(id)}
                >
                  {roleLabel(id, guildRoles)} ×
                </button>
              ))
            )}
          </div>
          {rolesLive ? (
            <label className="technik-field ma-roles__pick">
              <span>Dodaj rangę Admin</span>
              <select
                value={adminRolePick}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  setAdminRolePick(id);
                  if (id) addAdminRoleId(id);
                }}
              >
                <option value="">— wybierz po nazwie —</option>
                {guildRoles
                  .filter((r) => !accessDraft.adminRoleIds.includes(r.id))
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
                <span>Dodaj Admin (ID Discord)</span>
                <input
                  value={pasteAdminRole}
                  disabled={busy}
                  onChange={(e) => setPasteAdminRole(e.target.value)}
                  placeholder="np. 123456789012345678"
                  inputMode="numeric"
                />
              </label>
              <button
                type="button"
                className="technik-btn-ghost ma-btn"
                disabled={busy}
                onClick={() => {
                  const id = pasteAdminRole.trim();
                  if (/^\d{17,20}$/.test(id)) addAdminRoleId(id);
                }}
              >
                Dodaj
              </button>
            </div>
          ) : (
            <p className="technik-muted">Ładuję listę ról…</p>
          )}
        </div>

        <div className="technik-field ma-roles" style={{ marginTop: '1rem' }}>
          <span>Dodatkowi operatorzy</span>
          <small className="technik-help">
            Lista Discord user ID z dostępem do Aktywności. Mateusz (
            <code>{MATEUSZ_OPERATOR_DISCORD_ID}</code>) jest stałym Technikiem — zawsze widoczny,
            nie da się usunąć.
          </small>
          <div className="technik-role-chips" role="list">
            {ensureMateuszOperator(accessDraft.operators).map((o) => {
              const permanent = isPermanentTechnikOperator(o.discordUserId);
              if (permanent) {
                return (
                  <span
                    key={o.discordUserId}
                    className="technik-role-chip technik-role-chip--permanent"
                    role="listitem"
                    title={o.discordUserId}
                  >
                    {(o.displayName ?? 'Mateusz') + ' · Technik (stały)'}
                  </span>
                );
              }
              return (
                <button
                  key={o.discordUserId}
                  type="button"
                  className="technik-role-chip"
                  role="listitem"
                  disabled={busy}
                  title={o.discordUserId}
                  onClick={() => removeOperator(o.discordUserId)}
                >
                  {(o.displayName ? o.displayName + ' · ' : '') + o.discordUserId} ×
                </button>
              );
            })}
          </div>
          <div className="ma-roles__paste" style={{ marginTop: '0.5rem' }}>
            <label className="technik-field" style={{ flex: 1, marginTop: 0 }}>
              <span>Discord user ID</span>
              <input
                value={opId}
                disabled={busy}
                onChange={(e) => setOpId(e.target.value)}
                placeholder="8080…"
                inputMode="numeric"
              />
            </label>
            <label className="technik-field" style={{ flex: 1, marginTop: 0 }}>
              <span>Nazwa (opcjonalnie)</span>
              <input
                value={opName}
                disabled={busy}
                onChange={(e) => setOpName(e.target.value)}
                placeholder="np. XiaoHu"
              />
            </label>
            <button
              type="button"
              className="technik-btn-ghost ma-btn"
              disabled={busy}
              onClick={addOperator}
            >
              Dodaj
            </button>
          </div>
        </div>
      </section>

      <section className="technik-panel technik-panel--wide ma-card ma-rank">
        <div className="technik-panel-head">
          <h2>Ranking: {sourceName}</h2>
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
        <p className="technik-help ma-rank__help">
          Każdy serwer ma własny ranking. Zmieniasz guildię powyżej — lista tylko z tego serwera
          (wszyscy na guildii).
        </p>

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
          help="Aktywność i dostęp wchodzą do szkicu powyżej, potem wspólny Apply."
          showStepper={false}
          compact
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
