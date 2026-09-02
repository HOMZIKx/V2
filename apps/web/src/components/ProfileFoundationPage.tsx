'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge, Button, FormField, MultiSelect, Panel, Select } from '@v2/design-system';
import {
  DEFAULT_PARTY_ROLE_CATALOG,
  listEnabledClassSpecs,
  resolveHubClassSpecLabel,
  type PartyRoleKey,
} from '@v2/hub-core';

import { ApiClientError } from '../lib/api';
import {
  createIdentityCharacter,
  getIdentityProfile,
  updateIdentityCharacter,
  type IdentityProfileCharacterDto,
  type IdentityProfileDto,
} from '../lib/lfg-api';
import { mapApiError } from '../lib/load-state';
import { isAbortError, memberErrorCopy } from '../lib/member-copy';
import { createRequestIdentity } from '../lib/request-identity';
import { useSession } from './SessionProvider';
import { ErrorState, LoadingState, UnauthorizedState } from './StateViews';

const ALL_ROLES: readonly PartyRoleKey[] = ['TANK', 'BUFF', 'DPS', 'FLEX'];

type CharacterFormState = {
  nickname: string;
  classSpecKey: string;
  level: string;
  partyRoles: readonly PartyRoleKey[];
};

const EMPTY_FORM: CharacterFormState = {
  nickname: '',
  classSpecKey: listEnabledClassSpecs()[0]?.key ?? 'warrior_body',
  level: '',
  partyRoles: ['DPS'],
};

function resolveActiveCharacter(profile: IdentityProfileDto): IdentityProfileCharacterDto | null {
  if (profile.characters.length === 0) {
    return null;
  }
  if (profile.activeCharacterId !== undefined && profile.activeCharacterId !== null) {
    const active = profile.characters.find((entry) => entry.id === profile.activeCharacterId);
    if (active !== undefined) {
      return active;
    }
  }
  return (
    profile.characters.find((entry) => entry.isDefault === true) ?? profile.characters[0] ?? null
  );
}

function partyRoleLabels(roles: readonly PartyRoleKey[]): string {
  return roles
    .map((role) => DEFAULT_PARTY_ROLE_CATALOG.find((entry) => entry.key === role)?.label ?? role)
    .join(' · ');
}

function formFromCharacter(character: IdentityProfileCharacterDto): CharacterFormState {
  return {
    nickname: character.nickname,
    classSpecKey: character.classSpecKey,
    level: character.level !== undefined && character.level !== null ? String(character.level) : '',
    partyRoles: character.partyRoles.length > 0 ? character.partyRoles : ['DPS'],
  };
}

export function ProfileFoundationPage() {
  const { status: sessionStatus } = useSession();
  const requests = useRef(createRequestIdentity());
  const [profile, setProfile] = useState<IdentityProfileDto | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const classSpecOptions = useMemo(
    () =>
      listEnabledClassSpecs().map((entry) => ({
        value: entry.key,
        label: entry.label,
      })),
    [],
  );

  const partyRoleOptions = useMemo(
    () =>
      DEFAULT_PARTY_ROLE_CATALOG.filter((entry) => entry.enabled).map((entry) => ({
        value: entry.key,
        label: entry.label,
        hint: entry.description,
      })),
    [],
  );

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setLoadState('loading');
    setLoadError(null);
    try {
      const next = await getIdentityProfile(signal);
      setProfile(next);
      setLoadState('ready');
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      setProfile(null);
      setLoadState('error');
      const mapped = mapApiError(error);
      setLoadError(
        mapped.kind === 'error' || mapped.kind === 'unavailable'
          ? mapped.message
          : memberErrorCopy(error),
      );
    }
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      return;
    }
    const request = requests.current.next();
    void loadProfile(request.signal);
    return () => {
      requests.current.invalidate();
    };
  }, [sessionStatus, loadProfile]);

  const activeCharacter = profile !== null ? resolveActiveCharacter(profile) : null;

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  const startEdit = useCallback((character: IdentityProfileCharacterDto) => {
    setEditingId(character.id);
    setForm(formFromCharacter(character));
    setFormError(null);
    setFlash(null);
  }, []);

  const submitCharacter = useCallback(async () => {
    const nickname = form.nickname.trim();
    if (nickname.length === 0) {
      setFormError('Podaj nick postaci w grze.');
      return;
    }
    if (form.partyRoles.length === 0) {
      setFormError('Wybierz co najmniej jedną rolę w ekipie.');
      return;
    }
    const levelTrimmed = form.level.trim();
    let level: number | null = null;
    if (levelTrimmed !== '') {
      const parsed = Number.parseInt(levelTrimmed, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 999) {
        setFormError('Poziom musi być liczbą od 1 do 999.');
        return;
      }
      level = parsed;
    }

    const payload = {
      nickname,
      classSpecKey: form.classSpecKey,
      level,
      partyRoles: form.partyRoles,
      ...(editingId === null && profile?.characters.length === 0 ? { isDefault: true } : {}),
    };

    setSaving(true);
    setFormError(null);
    try {
      const next =
        editingId === null
          ? await createIdentityCharacter(payload)
          : await updateIdentityCharacter(editingId, payload);
      setProfile(next);
      setFlash(editingId === null ? 'Dodano postać.' : 'Zapisano zmiany postaci.');
      resetForm();
    } catch (error) {
      setFormError(error instanceof ApiClientError ? error.message : memberErrorCopy(error));
    } finally {
      setSaving(false);
    }
  }, [editingId, form, profile?.characters.length, resetForm]);

  const setActiveCharacter = useCallback(
    async (character: IdentityProfileCharacterDto) => {
      setSaving(true);
      setFormError(null);
      try {
        const next = await updateIdentityCharacter(character.id, {
          nickname: character.nickname,
          classSpecKey: character.classSpecKey,
          level: character.level ?? null,
          partyRoles: character.partyRoles,
          isDefault: true,
        });
        setProfile(next);
        setFlash(`Aktywna postać: ${character.nickname}.`);
        if (editingId === character.id) {
          resetForm();
        }
      } catch (error) {
        setFormError(error instanceof ApiClientError ? error.message : memberErrorCopy(error));
      } finally {
        setSaving(false);
      }
    },
    [editingId, resetForm],
  );

  if (
    sessionStatus === 'loading' ||
    (sessionStatus === 'authenticated' && loadState === 'loading')
  ) {
    return (
      <>
        <header className="page-hero">
          <h1>Mój profil</h1>
        </header>
        <LoadingState label="Ładowanie profilu…" />
      </>
    );
  }

  if (sessionStatus === 'anonymous') {
    return (
      <>
        <header className="page-hero">
          <h1>Mój profil</h1>
        </header>
        <UnauthorizedState />
      </>
    );
  }

  if (sessionStatus === 'error' || loadState === 'error') {
    return (
      <>
        <header className="page-hero">
          <h1>Mój profil</h1>
        </header>
        <ErrorState>{loadError ?? 'Nie udało się wczytać profilu.'}</ErrorState>
      </>
    );
  }

  return (
    <>
      <header className="page-hero">
        <h1>Mój profil</h1>
        <p>Twoje postacie, profesje i role — wspólne dla Discorda i WWW.</p>
      </header>

      {flash !== null ? (
        <p className="flash flash-success" role="status">
          {flash}
        </p>
      ) : null}
      {formError !== null ? (
        <p className="flash flash-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="member-page profile-page">
        <Panel title="Aktywna postać">
          {activeCharacter === null ? (
            <p className="muted">Nie masz jeszcze postaci. Dodaj pierwszą poniżej.</p>
          ) : (
            <>
              <p>
                <strong>{activeCharacter.nickname}</strong>
                {' · '}
                {activeCharacter.classSpecLabel ??
                  resolveHubClassSpecLabel(activeCharacter.classSpecKey)}
                {activeCharacter.level !== undefined && activeCharacter.level !== null
                  ? ` · ${String(activeCharacter.level)}`
                  : ''}
              </p>
              <p className="muted">Role: {partyRoleLabels(activeCharacter.partyRoles)}</p>
            </>
          )}
        </Panel>

        <Panel title="Twoje postacie">
          {profile?.characters.length === 0 ? (
            <p className="muted">Lista jest pusta.</p>
          ) : (
            <ul className="profile-character-list">
              {profile?.characters.map((character) => {
                const isActive = activeCharacter?.id === character.id;
                return (
                  <li key={character.id} className="profile-character-row">
                    <div>
                      <strong>{character.nickname}</strong>
                      {isActive ? <Badge tone="ok">Aktywna</Badge> : null}
                      <p className="muted">
                        {character.classSpecLabel ??
                          resolveHubClassSpecLabel(character.classSpecKey)}
                        {' · '}
                        {partyRoleLabels(character.partyRoles)}
                      </p>
                    </div>
                    <div className="profile-character-actions">
                      {!isActive ? (
                        <Button
                          variant="secondary"
                          disabled={saving}
                          onClick={() => {
                            void setActiveCharacter(character);
                          }}
                        >
                          Ustaw aktywną
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        disabled={saving}
                        onClick={() => {
                          startEdit(character);
                        }}
                      >
                        Edytuj
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={editingId === null ? 'Dodaj postać' : 'Edytuj postać'}>
          <div className="profile-form">
            <FormField label="Nick w grze" htmlFor="profile-nickname">
              <input
                id="profile-nickname"
                className="v2-input"
                value={form.nickname}
                maxLength={64}
                disabled={saving}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, nickname: event.target.value }));
                }}
              />
            </FormField>

            <FormField label="Profesja" htmlFor="profile-class">
              <Select
                id="profile-class"
                value={form.classSpecKey}
                disabled={saving}
                options={classSpecOptions}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, classSpecKey: event.target.value }));
                }}
              />
            </FormField>

            <FormField label="Poziom (opcjonalnie)" htmlFor="profile-level">
              <input
                id="profile-level"
                className="v2-input"
                inputMode="numeric"
                value={form.level}
                disabled={saving}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, level: event.target.value }));
                }}
              />
            </FormField>

            <MultiSelect
              legend="Role w ekipie"
              options={partyRoleOptions}
              selected={[...form.partyRoles]}
              disabled={saving}
              onChange={(next) => {
                setForm((prev) => ({
                  ...prev,
                  partyRoles: next.filter((role): role is PartyRoleKey =>
                    ALL_ROLES.includes(role as PartyRoleKey),
                  ),
                }));
              }}
            />

            <div className="profile-form-actions">
              <Button variant="primary" disabled={saving} onClick={() => void submitCharacter()}>
                {saving ? 'Zapisywanie…' : editingId === null ? 'Dodaj postać' : 'Zapisz zmiany'}
              </Button>
              {editingId !== null ? (
                <Button variant="ghost" disabled={saving} onClick={resetForm}>
                  Anuluj
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
