'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge, Button, Panel, Select } from '@v2/design-system';
import {
  DEFAULT_PARTY_ROLE_CATALOG,
  LFG_DUNGEON_ACTIVITY_TYPES,
  isPartyRoleKey,
  pickDeterministicJoinRole,
  type PartyRoleKey,
} from '@v2/hub-core';

import { getGuildConfig } from '../lib/api';
import { formatPolishDateTime } from '../lib/datetime';
import { getActivityOrganizationId } from '../lib/env';
import {
  cancelLfgWatch,
  createLfgWatch,
  getIdentityProfile,
  joinLfg,
  listLfgWatches,
  pauseLfgWatch,
  resumeLfgWatch,
  searchLfg,
  updateLfgWatch,
  type IdentityProfileCharacterDto,
  type LfgMatchDto,
  type LfgPartyRoleKey,
  type LfgWatchDto,
} from '../lib/lfg-api';
import { mapApiError, type LoadState } from '../lib/load-state';
import { GUILD_UNAVAILABLE_COPY, isAbortError, memberErrorCopy } from '../lib/member-copy';
import { createRequestIdentity } from '../lib/request-identity';
import type { StatusDefDto } from '../lib/types';
import { useGuild } from './GuildProvider';
import { useSession } from './SessionProvider';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnauthorizedState,
  UnavailableState,
} from './StateViews';

type TimePreset = 'now' | 'plus2h' | 'evening' | 'custom';

const ALL_ROLES: readonly PartyRoleKey[] = ['TANK', 'BUFF', 'DPS', 'FLEX'];

const TIME_PRESETS: readonly { value: TimePreset; label: string }[] = [
  { value: 'now', label: 'Teraz (do 2 h)' },
  { value: 'plus2h', label: 'Za 2 h (okno 2 h)' },
  { value: 'evening', label: 'Wieczór (18:00–23:00)' },
  { value: 'custom', label: 'Własne okno czasu' },
];

function deriveTimeWindow(
  preset: TimePreset,
  now: Date = new Date(),
): { windowStartAt: Date; windowEndAt: Date; label: string } {
  if (preset === 'now') {
    const start = now;
    const end = new Date(start.getTime() + 2 * 3_600_000);
    return { windowStartAt: start, windowEndAt: end, label: 'Teraz (do 2 h)' };
  }
  if (preset === 'plus2h') {
    const start = new Date(now.getTime() + 2 * 3_600_000);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    return { windowStartAt: start, windowEndAt: end, label: 'Za 2 h (okno 2 h)' };
  }
  const eveningStart = new Date(now);
  eveningStart.setHours(18, 0, 0, 0);
  if (eveningStart.getTime() <= now.getTime()) {
    eveningStart.setDate(eveningStart.getDate() + 1);
  }
  const eveningEnd = new Date(eveningStart);
  eveningEnd.setHours(23, 0, 0, 0);
  return { windowStartAt: eveningStart, windowEndAt: eveningEnd, label: 'Wieczór (18:00–23:00)' };
}

function resolveActiveCharacter(
  characters: readonly IdentityProfileCharacterDto[],
  activeCharacterId: string | null | undefined,
): IdentityProfileCharacterDto | null {
  if (characters.length === 0) {
    return null;
  }
  if (activeCharacterId !== undefined && activeCharacterId !== null) {
    const active = characters.find((entry) => entry.id === activeCharacterId);
    if (active !== undefined) {
      return active;
    }
  }
  return characters.find((entry) => entry.isDefault === true) ?? characters[0] ?? null;
}

function dungeonLabel(key: string | undefined): string {
  return LFG_DUNGEON_ACTIVITY_TYPES.find((entry) => entry.key === key)?.label ?? key ?? 'Dungeon';
}

function partyRoleLabel(key: string): string {
  return DEFAULT_PARTY_ROLE_CATALOG.find((entry) => entry.key === key)?.label ?? key;
}

function occupancyLabel(match: LfgMatchDto): string {
  if (match.occupancy !== undefined) {
    return `${String(match.occupancy.occupied)}/${String(match.occupancy.capacity)}`;
  }
  return '—';
}

function watchStatusLabel(watch: LfgWatchDto): string {
  if (watch.cancelledAt !== undefined && watch.cancelledAt !== null) {
    return 'Anulowane';
  }
  if (watch.fulfilledAt !== undefined && watch.fulfilledAt !== null) {
    return 'Zrealizowane';
  }
  if (watch.pausedAt !== undefined && watch.pausedAt !== null) {
    return 'Wstrzymane';
  }
  return 'Aktywne';
}

function pickJoinStatusId(statuses: readonly StatusDefDto[]): string | null {
  const selectable = statuses.filter((status) => status.active && status.selectableByMember);
  const confirmed = selectable.find((status) => status.behavior === 'confirmed');
  return confirmed?.id ?? selectable[0]?.id ?? null;
}

export function LfgPage() {
  const { guildId, unavailable } = useGuild();
  const { session, status } = useSession();
  const organizationId = getActivityOrganizationId();
  const requests = useRef(createRequestIdentity());

  const [pageState, setPageState] = useState<LoadState>({ kind: 'loading' });
  const [characters, setCharacters] = useState<IdentityProfileCharacterDto[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [dungeonKey, setDungeonKey] = useState<string>('azrael');
  const [sessionRoles, setSessionRoles] = useState<PartyRoleKey[]>([]);
  const [supportedRoles, setSupportedRoles] = useState<PartyRoleKey[]>([]);
  const [classSpecKey, setClassSpecKey] = useState<string | null>(null);
  const [timePreset, setTimePreset] = useState<TimePreset>('now');
  const [customWindowRaw, setCustomWindowRaw] = useState('');
  const [matches, setMatches] = useState<LfgMatchDto[]>([]);
  const [watches, setWatches] = useState<LfgWatchDto[]>([]);
  const [joinStatusId, setJoinStatusId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCharacter = useMemo(
    () => characters.find((entry) => entry.id === characterId) ?? null,
    [characters, characterId],
  );

  const applyCharacter = useCallback((character: IdentityProfileCharacterDto | null) => {
    if (character === null) {
      setCharacterId(null);
      setClassSpecKey(null);
      setSupportedRoles([]);
      setSessionRoles([]);
      return;
    }
    const supported = character.partyRoles.filter(isPartyRoleKey);
    setCharacterId(character.id);
    setClassSpecKey(character.classSpecKey);
    setSupportedRoles(supported);
    setSessionRoles(supported);
  }, []);

  const loadWatches = useCallback(async () => {
    if (guildId === null) {
      return;
    }
    const listed = await listLfgWatches(guildId);
    setWatches(
      listed.filter((watch) => watch.cancelledAt === undefined || watch.cancelledAt === null),
    );
  }, [guildId]);

  const load = useCallback(async () => {
    const request = requests.current.next();
    setFlash(null);
    setActionError(null);

    if (status === 'loading') {
      setPageState({ kind: 'loading' });
      return;
    }
    if (status === 'anonymous' || session === null) {
      setPageState({ kind: 'unauthorized' });
      return;
    }
    if (unavailable || guildId === null) {
      setPageState({ kind: 'unavailable', message: GUILD_UNAVAILABLE_COPY });
      return;
    }
    if (organizationId === null) {
      setPageState({
        kind: 'unavailable',
        message:
          'Brak identyfikatora organizacji dla LFG. Skontaktuj się z administracją (NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID).',
      });
      return;
    }

    setPageState({ kind: 'loading' });
    try {
      const [profile, config] = await Promise.all([
        getIdentityProfile(request.signal),
        getGuildConfig(guildId, request.signal).catch(() => ({
          settings: {},
          statuses: [] as StatusDefDto[],
        })),
      ]);
      if (!request.isCurrent()) {
        return;
      }
      const chars = [...profile.characters];
      setCharacters(chars);
      applyCharacter(resolveActiveCharacter(chars, profile.activeCharacterId));
      setJoinStatusId(pickJoinStatusId(config.statuses));
      await loadWatches();
      if (!request.isCurrent()) {
        return;
      }
      setPageState({ kind: 'ready' });
    } catch (err) {
      if (isAbortError(err) || !request.isCurrent()) {
        return;
      }
      setPageState(mapApiError(err));
    }
  }, [applyCharacter, guildId, loadWatches, organizationId, session, status, unavailable]);

  useEffect(() => {
    void load();
    const identity = requests.current;
    return () => {
      identity.invalidate();
    };
  }, [load]);

  const wizardReady =
    dungeonKey.trim() !== '' &&
    characterId !== null &&
    classSpecKey !== null &&
    sessionRoles.length > 0 &&
    (timePreset !== 'custom' || customWindowRaw.trim().length > 0);

  const buildSearchBody = useCallback(() => {
    if (!wizardReady || guildId === null || organizationId === null || characterId === null) {
      return null;
    }
    let windowStartAt: string;
    let windowEndAt: string;
    if (timePreset === 'custom') {
      const split = customWindowRaw.split(/\s*[–-]\s*/u);
      if (split.length !== 2) {
        return null;
      }
      const start = new Date(split[0]!.trim());
      const end = new Date(split[1]!.trim());
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return null;
      }
      windowStartAt = start.toISOString();
      windowEndAt = end.toISOString();
    } else {
      const window = deriveTimeWindow(timePreset);
      windowStartAt = window.windowStartAt.toISOString();
      windowEndAt = window.windowEndAt.toISOString();
    }
    return {
      guildId,
      organizationId,
      activityTypeKey: dungeonKey,
      characterId,
      sessionRoles: sessionRoles,
      windowStartAt,
      windowEndAt,
    };
  }, [
    characterId,
    customWindowRaw,
    dungeonKey,
    guildId,
    organizationId,
    sessionRoles,
    timePreset,
    wizardReady,
  ]);

  async function onSearch() {
    const body = buildSearchBody();
    if (body === null) {
      setActionError('Uzupełnij dungeon, postać, role i czas przed wyszukiwaniem.');
      return;
    }
    setBusy(true);
    setActionError(null);
    setFlash(null);
    try {
      const result = await searchLfg(body);
      setMatches(result.matches.slice(0, 3));
      setFlash(
        result.matches.length > 0
          ? `Znaleziono ${String(result.matches.length)} dopasowań (pokazano ${String(Math.min(result.matches.length, 3))}).`
          : 'Brak dopasowań — możesz włączyć poszukiwanie.',
      );
    } catch (err) {
      setActionError(memberErrorCopy(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateWatch() {
    const body = buildSearchBody();
    if (body === null || characterId === null) {
      setActionError('Uzupełnij formularz przed włączeniem poszukiwania.');
      return;
    }
    setBusy(true);
    setActionError(null);
    setFlash(null);
    try {
      await createLfgWatch({
        guildId: body.guildId,
        organizationId: body.organizationId,
        characterId,
        activityTypeKey: body.activityTypeKey,
        sessionRoles: body.sessionRoles,
        windowStartAt: body.windowStartAt,
        windowEndAt: body.windowEndAt,
        ...(selectedCharacter?.classSpecKey !== undefined
          ? { classSpecKey: selectedCharacter.classSpecKey }
          : {}),
      });
      setFlash('Poszukiwanie włączone — powiadomimy Cię o dopasowaniu.');
      await loadWatches();
    } catch (err) {
      setActionError(memberErrorCopy(err));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(match: LfgMatchDto) {
    if (guildId === null || joinStatusId === null || sessionRoles.length === 0) {
      setActionError('Nie udało się dołączyć — brak statusu zapisu lub roli.');
      return;
    }
    const partyRoleKey = pickDeterministicJoinRole(sessionRoles) ?? sessionRoles[0];
    if (partyRoleKey === undefined) {
      setActionError('Wybierz co najmniej jedną rolę sesji.');
      return;
    }
    setBusy(true);
    setActionError(null);
    setFlash(null);
    try {
      const result = await joinLfg({
        activityId: match.activityId,
        statusDefId: joinStatusId,
        partyRoleKey,
        guildId,
        ...(characterId !== null ? { characterId } : {}),
      });
      const waitlist =
        typeof result.waitlistPosition === 'number'
          ? ` Lista rezerwowa: pozycja ${String(result.waitlistPosition)}.`
          : '';
      setFlash(`Dołączono do ekipy.${waitlist}`);
    } catch (err) {
      setActionError(memberErrorCopy(err));
    } finally {
      setBusy(false);
    }
  }

  async function onWatchAction(
    watchId: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<void> {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setFlash(null);
    try {
      if (action === 'pause') {
        await pauseLfgWatch(watchId, guildId);
        setFlash('Poszukiwanie wstrzymane.');
      } else if (action === 'resume') {
        await resumeLfgWatch(watchId, guildId);
        setFlash('Poszukiwanie wznowione.');
      } else {
        await cancelLfgWatch(watchId, guildId);
        setFlash('Poszukiwanie anulowane.');
      }
      await loadWatches();
    } catch (err) {
      setActionError(memberErrorCopy(err));
    } finally {
      setBusy(false);
    }
  }

  async function onEditWatch(watch: LfgWatchDto): Promise<void> {
    if (guildId === null) {
      return;
    }
    const rolesRaw = window.prompt(
      'Role sesji (TANK,BUFF,DPS,FLEX):',
      (watch.sessionRoles ?? []).join(','),
    );
    const windowRaw = window.prompt(
      'Okno czasu (ISO od – do):',
      watch.windowStartAt !== undefined && watch.windowEndAt !== undefined
        ? `${watch.windowStartAt} – ${watch.windowEndAt}`
        : '',
    );
    if (rolesRaw === null || windowRaw === null) {
      return;
    }
    const sessionRolesParsed = rolesRaw
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter((part): part is LfgPartyRoleKey =>
        ['TANK', 'BUFF', 'DPS', 'FLEX'].includes(part as LfgPartyRoleKey),
      );
    const split = windowRaw.split(/\s*[–-]\s*/u);
    if (sessionRolesParsed.length === 0 || split.length !== 2) {
      setActionError('Podaj role i okno w poprawnym formacie.');
      return;
    }
    setBusy(true);
    setActionError(null);
    setFlash(null);
    try {
      await updateLfgWatch(watch.id, {
        guildId,
        sessionRoles: sessionRolesParsed,
        windowStartAt: split[0]!.trim(),
        windowEndAt: split[1]!.trim(),
      });
      setFlash('Poszukiwanie zaktualizowane.');
      await loadWatches();
    } catch (err) {
      setActionError(memberErrorCopy(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleRole(role: PartyRoleKey) {
    if (!supportedRoles.includes(role)) {
      return;
    }
    const selected = new Set(sessionRoles);
    if (selected.has(role)) {
      selected.delete(role);
    } else {
      selected.add(role);
    }
    if (selected.size === 0) {
      return;
    }
    setSessionRoles(ALL_ROLES.filter((entry) => selected.has(entry)));
  }

  if (pageState.kind === 'loading') {
    return (
      <>
        <header className="page-hero">
          <h1>Szukam ekipy</h1>
        </header>
        <LoadingState label="Ładowanie LFG…" />
      </>
    );
  }
  if (pageState.kind === 'unauthorized') {
    return (
      <>
        <header className="page-hero">
          <h1>Szukam ekipy</h1>
        </header>
        <UnauthorizedState />
      </>
    );
  }
  if (pageState.kind === 'forbidden') {
    return (
      <>
        <header className="page-hero">
          <h1>Szukam ekipy</h1>
        </header>
        <ForbiddenState />
      </>
    );
  }
  if (pageState.kind === 'unavailable') {
    return (
      <>
        <header className="page-hero">
          <h1>Szukam ekipy</h1>
        </header>
        <UnavailableState title="LFG niedostępne">{pageState.message}</UnavailableState>
      </>
    );
  }
  if (pageState.kind === 'error') {
    return (
      <>
        <header className="page-hero">
          <h1>Szukam ekipy</h1>
        </header>
        <ErrorState>{pageState.message}</ErrorState>
      </>
    );
  }

  return (
    <>
      <header className="page-hero">
        <h1>Szukam ekipy</h1>
        <p>Dungeon LFG — dopasuj się do otwartej grupy lub włącz poszukiwanie.</p>
      </header>

      {flash !== null ? (
        <p className="flash flash-success" role="status">
          {flash}
        </p>
      ) : null}
      {actionError !== null ? (
        <p className="flash flash-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="member-page lfg-page">
        <Panel title="Dungeon">
          <Select
            id="lfg-dungeon"
            aria-label="Dungeon"
            value={dungeonKey}
            options={LFG_DUNGEON_ACTIVITY_TYPES.map((entry) => ({
              value: entry.key,
              label: entry.label,
            }))}
            onChange={(event) => {
              setDungeonKey(event.target.value);
              setMatches([]);
            }}
          />
        </Panel>

        <Panel title="Postać">
          {characters.length === 0 ? (
            <p className="muted">
              Brak postaci w profilu. Dodaj postać w Discordzie (/profil) lub przez Identity API.
            </p>
          ) : (
            <Select
              id="lfg-character"
              aria-label="Postać"
              value={characterId ?? ''}
              options={characters.map((entry) => ({
                value: entry.id,
                label: entry.nickname,
              }))}
              onChange={(event) => {
                const next = characters.find((entry) => entry.id === event.target.value) ?? null;
                applyCharacter(next);
                setMatches([]);
              }}
            />
          )}
          {selectedCharacter !== null ? (
            <p className="muted">
              Klasa/spec: {selectedCharacter.classSpecLabel ?? selectedCharacter.classSpecKey}
            </p>
          ) : null}
        </Panel>

        <Panel title="Role w tej sesji">
          <div className="lfg-role-grid">
            {ALL_ROLES.map((role) => {
              const supported = supportedRoles.includes(role);
              const active = sessionRoles.includes(role);
              return (
                <Button
                  key={role}
                  variant={active ? 'primary' : 'secondary'}
                  disabled={!supported || busy}
                  onClick={() => {
                    toggleRole(role);
                    setMatches([]);
                  }}
                >
                  {partyRoleLabel(role)}
                </Button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Kiedy grasz">
          <Select
            id="lfg-time"
            aria-label="Okno czasowe"
            value={timePreset}
            options={TIME_PRESETS.map((entry) => ({ value: entry.value, label: entry.label }))}
            onChange={(event) => {
              setTimePreset(event.target.value as TimePreset);
              setMatches([]);
            }}
          />
          {timePreset === 'custom' ? (
            <p className="muted">
              <label htmlFor="lfg-custom-window">
                Okno ISO lub lokalne (od – do), np. 2026-08-22T18:00:00.000Z –
                2026-08-22T21:00:00.000Z
              </label>
              <input
                id="lfg-custom-window"
                className="input"
                value={customWindowRaw}
                onChange={(event) => {
                  setCustomWindowRaw(event.target.value);
                  setMatches([]);
                }}
              />
            </p>
          ) : null}
        </Panel>

        <div className="toolbar lfg-actions">
          <Button variant="primary" disabled={!wizardReady || busy} onClick={() => void onSearch()}>
            Szukaj ekipy
          </Button>
          <Button
            variant="secondary"
            disabled={!wizardReady || busy}
            onClick={() => void onCreateWatch()}
          >
            Znajdź mi ekipę
          </Button>
        </div>

        <Panel title="Dopasowania (top 3)">
          {matches.length === 0 ? (
            <EmptyState title="Brak wyników">
              Użyj „Szukaj ekipy”, aby zobaczyć otwarte grupy pasujące do kryteriów.
            </EmptyState>
          ) : (
            <ul className="lfg-match-list">
              {matches.map((match, index) => (
                <li key={match.activityId}>
                  <div className="lfg-match-head">
                    <strong>
                      {index + 1}. {dungeonLabel(dungeonKey)}
                    </strong>
                    <Badge tone="info">{occupancyLabel(match)}</Badge>
                  </div>
                  <p>{match.roleNeedSummary ?? 'Potrzeby w trakcie ustalania'}</p>
                  <p className="muted">{match.matchReason ?? 'Dopasowanie czasu i dungeonu'}</p>
                  <Button variant="primary" disabled={busy} onClick={() => void onJoin(match)}>
                    Dołącz
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Moje poszukiwania">
          {watches.length === 0 ? (
            <EmptyState title="Brak aktywnych poszukiwań">
              Włącz „Znajdź mi ekipę”, aby otrzymać powiadomienie o pasującej grupie.
            </EmptyState>
          ) : (
            <ul className="lfg-watch-list">
              {watches.map((watch) => {
                const paused = watch.pausedAt !== undefined && watch.pausedAt !== null;
                const roles = (watch.sessionRoles ?? []).map(partyRoleLabel).join(', ');
                return (
                  <li key={watch.id}>
                    <div className="lfg-watch-head">
                      <strong>{dungeonLabel(watch.activityTypeKey)}</strong>
                      <Badge tone={paused ? 'warn' : 'info'}>{watchStatusLabel(watch)}</Badge>
                    </div>
                    <p className="muted">
                      Role: {roles.length > 0 ? roles : '—'}
                      {watch.windowStartAt !== undefined && watch.windowEndAt !== undefined
                        ? ` · ${formatPolishDateTime(watch.windowStartAt)} – ${formatPolishDateTime(watch.windowEndAt)}`
                        : null}
                    </p>
                    <div className="lfg-watch-actions">
                      {paused ? (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void onWatchAction(watch.id, 'resume')}
                        >
                          Wznów
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void onWatchAction(watch.id, 'pause')}
                        >
                          Wstrzymaj
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void onEditWatch(watch)}
                      >
                        Edytuj
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void onWatchAction(watch.id, 'cancel')}
                      >
                        Anuluj
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
