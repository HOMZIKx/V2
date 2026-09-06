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
import { KNOWN_GUILD_NAMES, putConfigDraft } from './technika-config-api';
import { HonestGap, PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';
import { usePlayerStore } from '../player-store-react';

const WINDOWS: { id: RankingWindow; label: string }[] = [
  { id: '7d', label: '7 dni' },
  { id: '14d', label: '14 dni' },
  { id: '30d', label: '30 dni' },
  { id: 'since_bot', label: 'Od startu bota' },
];

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
  const [rolesText, setRolesText] = useState('');

  useEffect(() => {
    const hit = cfg.capabilities.some(
      (c) => c.id === 'memberActivity' || c.id === 'member-activity',
    );
    setHasCap(hit);
    const fromSnap = readMemberActivityFromConfig(
      cfg.snapshot?.config as unknown as Record<string, unknown> | undefined,
    );
    setDraft(fromSnap);
    setRolesText(fromSnap.memberRoleIds.join(', '));
    setWindowId(windowDaysToRankingWindow(fromSnap.windowDays));
  }, [cfg.capabilities, cfg.snapshot]);

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
    setRolesText(next.memberRoleIds.join(', '));
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
      setMsg('Zapisano aktywność członków do szkicu — Sprawdź → Zobacz → Zapisz i włącz.');
      cfg.setLastAction('draft memberActivity');
      cfg.setStep('Draft');
      await cfg.load();
    } finally {
      setBusy(false);
    }
  };

  const applyRolesText = () => {
    const ids = rolesText
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((id) => /^\d{17,20}$/.test(id));
    void persistDraft({ ...draft, memberRoleIds: ids });
  };

  const sourceName = KNOWN_GUILD_NAMES[draft.guildId] ?? 'źródłowa guildia';

  return (
    <>
      <h1>Aktywność członków</h1>
      <p className="technik-lead">
        Źródło Destiled, role, metryki i pełny ranking z wyszukiwaniem. Okna: 7 / 14 / 30 dni albo od
        startu bota.
      </p>

      <PageJobNote>
        <p>
          Włączasz zbieranie aktywności, wskazujesz guildię źródłową i role, potem przeglądasz ranking.
          To ops — nie publiczny ranking na kanale.
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Ranking nie leci jako spam na kanale. Prywatne wiadomości nadal tylko do zespołu według
          powiadomień w Zarządzaniu zespołem.
        </p>
      </PlayerSeesNote>

      {!hasCap ? (
        <HonestGap>
          <p>
            Bot jeszcze nie wystawia możliwości „aktywność członków” w capabilities (albo gateway
            offline). Formularz jest gotowy — po live zapis pójdzie do szkicu → Apply.
          </p>
        </HonestGap>
      ) : (
        <span className="technik-pill technik-pill--live">memberActivity w capabilities</span>
      )}

      <section className="technik-panel technik-panel--live-config" style={{ marginTop: '1rem' }}>
        <h2>Konfiguracja (szkic → Apply)</h2>
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
          <span>Guildia źródłowa (Destiled)</span>
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
        <label className="technik-field">
          <span>Role członków (opcjonalnie, ID oddzielone przecinkiem)</span>
          <input
            value={rolesText}
            disabled={busy}
            onChange={(e) => setRolesText(e.target.value)}
            onBlur={() => applyRolesText()}
            placeholder="puste = wszyscy na guildii źródłowej"
          />
        </label>
        <div className="technik-row">
          <label className="technik-field">
            <span>Domyślne okno (dni)</span>
            <select
              value={String(draft.windowDays)}
              disabled={busy}
              onChange={(e) => {
                const days = Number(e.target.value);
                void persistDraft({ ...draft, windowDays: days });
                setWindowId(windowDaysToRankingWindow(days));
              }}
            >
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
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

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Ranking (pełny + szukaj)</h2>
          <span
            className={
              rankStatus === 'live'
                ? 'technik-pill technik-pill--live'
                : 'technik-pill technik-pill--pending'
            }
          >
            {rankStatus === 'checking'
              ? '…'
              : rankStatus === 'live'
                ? 'API gotowe'
                : rankStatus === 'offline'
                  ? 'Gateway offline (:4100)'
                  : 'API niedostępne'}
          </span>
        </div>

        {rankStatus === 'offline' ? (
          <HonestGap>
            <p>
              Discord gateway na <strong>:4100</strong> nie odpowiada. Ranking i /me są w OpenAPI —
              po starcie gateway ta zakładka odświeży się sama (albo kliknij Szukaj / odśwież).
            </p>
          </HonestGap>
        ) : null}

        {rankStatus === 'unavailable' ? (
          <HonestGap>
            <p>
              Endpoint rankingu jeszcze nie odpowiada (404). Okna i wyszukiwanie są gotowe w UI —
              podłączą się, gdy trasa będzie live.
            </p>
          </HonestGap>
        ) : null}

        {rankStatus === 'live' || rankStatus === 'offline' ? (
          <>
            <div className="technik-row">
              {WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={windowId === w.id ? 'technik-day-pill is-on' : 'technik-day-pill'}
                  onClick={() => setWindowId(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="technik-row" style={{ marginTop: '0.65rem' }}>
              <label className="technik-field" style={{ flex: 1 }}>
                <span>Szukaj (nick)</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="np. Mateusz"
                />
              </label>
              <button
                type="button"
                className="technik-test-dm-btn"
                disabled={busy}
                onClick={() => void loadRanking()}
              >
                {busy ? '…' : 'Szukaj / odśwież'}
              </button>
            </div>
            {myRow ? (
              <p className="technik-help">
                Ty: <strong>{myRow.displayName}</strong> — wynik {myRow.score}
                {typeof myRow.messages === 'number' ? ' · wiadomości ' + String(myRow.messages) : ''}
                {typeof myRow.voiceMinutes === 'number'
                  ? ' · VC ' + String(myRow.voiceMinutes) + ' min'
                  : ''}
              </p>
            ) : null}
            {totalMembers !== null ? (
              <p className="technik-muted">Członków w oknie: {totalMembers}</p>
            ) : null}
            {rows.length === 0 ? (
              <p className="technik-muted">Brak wierszy rankingu.</p>
            ) : (
              <table className="technik-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Gracz</th>
                    <th>Wynik</th>
                    <th>Wiadomości</th>
                    <th>VC min</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.discordUserId + String(i)}>
                      <td>{r.rank ?? i + 1}</td>
                      <td title={r.discordUserId}>{r.displayName}</td>
                      <td>{r.score}</td>
                      <td>{r.messages ?? '—'}</td>
                      <td>{r.voiceMinutes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : null}
      </section>

      <div style={{ marginTop: '1rem' }}>
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
          help="Aktywność członków wchodzi do szkicu powyżej, potem wspólny Apply."
        />
      </div>
      {cfg.actionError ? (
        <p className="technik-error" role="alert">
          {cfg.actionError}
        </p>
      ) : null}
    </>
  );
}
