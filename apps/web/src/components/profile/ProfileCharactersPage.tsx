'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, FormField, Panel, Select } from '@v2/design-system';
import { listEnabledClassSpecs, resolveHubClassSpecLabel } from '@v2/hub-core';

import { ApiClientError } from '../../lib/api';
import {
  createGameAccount,
  createIdentityCharacter,
  getIdentityProfile,
  updateGameAccount,
  updateIdentityCharacter,
  type GameAccountDto,
  type IdentityProfileCharacterDto,
  type IdentityProfileDto,
} from '../../lib/lfg-api';
import { mapApiError } from '../../lib/load-state';
import { isAbortError, memberErrorCopy } from '../../lib/member-copy';
import { createRequestIdentity } from '../../lib/request-identity';
import { useSession } from '../SessionProvider';
import { ErrorState, LoadingState, UnauthorizedState } from '../StateViews';
import { groupCharactersByAccount } from './profile-utils';

type CharacterFormState = {
  nickname: string;
  classSpecKey: string;
  level: string;
  gameAccountId: string;
};

const EMPTY_FORM = (defaultAccountId: string): CharacterFormState => ({
  nickname: '',
  classSpecKey: listEnabledClassSpecs()[0]?.key ?? 'warrior_body',
  level: '',
  gameAccountId: defaultAccountId,
});

function formFromCharacter(
  character: IdentityProfileCharacterDto,
  fallbackAccountId: string,
): CharacterFormState {
  return {
    nickname: character.nickname,
    classSpecKey: character.classSpecKey,
    level: character.level !== undefined && character.level !== null ? String(character.level) : '',
    gameAccountId: character.gameAccountId ?? fallbackAccountId,
  };
}

export function ProfileCharactersPage() {
  const { status: sessionStatus } = useSession();
  const requests = useRef(createRequestIdentity());
  const [profile, setProfile] = useState<IdentityProfileDto | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterFormState | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [renamingAccountId, setRenamingAccountId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const defaultAccountId = profile?.gameAccounts?.[0]?.id ?? '';

  const classSpecOptions = useMemo(
    () =>
      listEnabledClassSpecs().map((entry) => ({
        value: entry.key,
        label: entry.label,
      })),
    [],
  );

  const accountOptions = useMemo(
    () =>
      (profile?.gameAccounts ?? []).map((account) => ({
        value: account.id,
        label: account.displayName,
      })),
    [profile?.gameAccounts],
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

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(null);
    setShowForm(false);
    setFormError(null);
  }, []);

  const startCreate = useCallback(
    (accountId?: string) => {
      const resolved = accountId ?? defaultAccountId;
      setEditingId(null);
      setForm(EMPTY_FORM(resolved));
      setShowForm(true);
      setFormError(null);
      setFlash(null);
    },
    [defaultAccountId],
  );

  const startEdit = useCallback(
    (character: IdentityProfileCharacterDto) => {
      setEditingId(character.id);
      setForm(formFromCharacter(character, defaultAccountId));
      setShowForm(true);
      setFormError(null);
      setFlash(null);
    },
    [defaultAccountId],
  );

  const submitCharacter = useCallback(async () => {
    if (form === null) {
      return;
    }
    const nickname = form.nickname.trim();
    if (nickname.length === 0) {
      setFormError('Podaj nick postaci.');
      return;
    }
    if (form.gameAccountId.length === 0) {
      setFormError('Wybierz konto.');
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
      gameAccountId: form.gameAccountId,
      partyRoles: ['DPS'] as const,
      ...(editingId === null && (profile?.characters.length ?? 0) === 0 ? { isDefault: true } : {}),
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

  const submitNewAccount = useCallback(async () => {
    const name = newAccountName.trim();
    if (name.length === 0) {
      setFormError('Podaj nazwę konta.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createGameAccount({ displayName: name });
      const next = await getIdentityProfile();
      setProfile(next);
      setNewAccountName('');
      setShowAccountForm(false);
      setFlash('Dodano konto.');
    } catch (error) {
      setFormError(error instanceof ApiClientError ? error.message : memberErrorCopy(error));
    } finally {
      setSaving(false);
    }
  }, [newAccountName]);

  const submitRenameAccount = useCallback(
    async (account: GameAccountDto) => {
      const name = renameValue.trim();
      if (name.length === 0) {
        setFormError('Podaj nazwę konta.');
        return;
      }
      setSaving(true);
      setFormError(null);
      try {
        await updateGameAccount(account.id, { displayName: name });
        const next = await getIdentityProfile();
        setProfile(next);
        setRenamingAccountId(null);
        setRenameValue('');
        setFlash('Zapisano nazwę konta.');
      } catch (error) {
        setFormError(error instanceof ApiClientError ? error.message : memberErrorCopy(error));
      } finally {
        setSaving(false);
      }
    },
    [renameValue],
  );

  if (
    sessionStatus === 'loading' ||
    (sessionStatus === 'authenticated' && loadState === 'loading')
  ) {
    return <LoadingState label="Ładowanie postaci…" />;
  }

  if (sessionStatus === 'anonymous') {
    return <UnauthorizedState />;
  }

  if (sessionStatus === 'error' || loadState === 'error') {
    return <ErrorState>{loadError ?? 'Nie udało się wczytać postaci.'}</ErrorState>;
  }

  const groups = profile !== null ? groupCharactersByAccount(profile) : [];
  const hasCharacters = (profile?.characters.length ?? 0) > 0;

  return (
    <div className="member-page profile-page">
      <p className="profile-hint muted">
        Konto w V2 służy tylko do organizacji Twoich postaci. Nie zapisujemy danych logowania do
        gry.
      </p>

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

      {!hasCharacters && !showForm ? (
        <Panel title="Nie masz jeszcze postaci">
          <p className="muted">
            Dodaj swoją pierwszą postać, aby korzystać z profilu, LFG i kolejnych narzędzi V2.
          </p>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => {
              startCreate();
            }}
          >
            Dodaj postać
          </Button>
        </Panel>
      ) : (
        <>
          <h2 className="profile-section-heading">Moje konta i postacie</h2>
          <div className="profile-account-groups">
            {groups.map((group) => (
              <section key={group.account?.id ?? 'orphan'} className="profile-account-card">
                <header className="profile-account-card-header">
                  <h3>{group.account?.displayName ?? 'Bez konta'}</h3>
                  {group.account !== null ? (
                    <div className="profile-account-card-actions">
                      {renamingAccountId === group.account.id ? (
                        <>
                          <input
                            className="v2-input profile-rename-input"
                            value={renameValue}
                            maxLength={64}
                            disabled={saving}
                            onChange={(event) => {
                              setRenameValue(event.target.value);
                            }}
                          />
                          <Button
                            variant="secondary"
                            disabled={saving}
                            onClick={() => {
                              void submitRenameAccount(group.account as GameAccountDto);
                            }}
                          >
                            Zapisz
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={saving}
                            onClick={() => {
                              setRenamingAccountId(null);
                            }}
                          >
                            Anuluj
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          disabled={saving}
                          onClick={() => {
                            setRenamingAccountId(group.account?.id ?? null);
                            setRenameValue(group.account?.displayName ?? '');
                          }}
                        >
                          Zmień nazwę
                        </Button>
                      )}
                    </div>
                  ) : null}
                </header>
                <ul className="profile-character-list">
                  {group.characters.map((character) => (
                    <li key={character.id} className="profile-character-row">
                      <div>
                        <strong>{character.nickname}</strong>
                        <p className="muted">
                          {character.classSpecLabel ??
                            resolveHubClassSpecLabel(character.classSpecKey)}
                          {character.level !== undefined && character.level !== null
                            ? ` · Lv ${String(character.level)}`
                            : ''}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={() => {
                          startEdit(character);
                        }}
                      >
                        Edytuj
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    startCreate(group.account?.id);
                  }}
                >
                  + Dodaj postać
                </Button>
              </section>
            ))}
          </div>

          {showAccountForm ? (
            <Panel title="Nowe konto">
              <FormField label="Nazwa konta" htmlFor="new-account-name">
                <input
                  id="new-account-name"
                  className="v2-input"
                  value={newAccountName}
                  maxLength={64}
                  disabled={saving}
                  placeholder="np. MAIN, DROP, BUFF"
                  onChange={(event) => {
                    setNewAccountName(event.target.value);
                  }}
                />
              </FormField>
              <div className="profile-form-actions">
                <Button variant="primary" disabled={saving} onClick={() => void submitNewAccount()}>
                  Dodaj konto
                </Button>
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setShowAccountForm(false);
                  }}
                >
                  Anuluj
                </Button>
              </div>
            </Panel>
          ) : (
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setShowAccountForm(true);
              }}
            >
              + Dodaj konto
            </Button>
          )}
        </>
      )}

      {showForm && form !== null ? (
        <Panel title={editingId === null ? 'Dodaj postać' : 'Edytuj postać'}>
          <div className="profile-form">
            <FormField label="Nick" htmlFor="character-nickname">
              <input
                id="character-nickname"
                className="v2-input"
                value={form.nickname}
                maxLength={64}
                disabled={saving}
                onChange={(event) => {
                  setForm((prev) =>
                    prev === null ? prev : { ...prev, nickname: event.target.value },
                  );
                }}
              />
            </FormField>

            <FormField label="Klasa" htmlFor="character-class">
              <Select
                id="character-class"
                value={form.classSpecKey}
                disabled={saving}
                options={classSpecOptions}
                onChange={(event) => {
                  setForm((prev) =>
                    prev === null ? prev : { ...prev, classSpecKey: event.target.value },
                  );
                }}
              />
            </FormField>

            <FormField label="Poziom" htmlFor="character-level">
              <input
                id="character-level"
                className="v2-input"
                inputMode="numeric"
                value={form.level}
                disabled={saving}
                onChange={(event) => {
                  setForm((prev) =>
                    prev === null ? prev : { ...prev, level: event.target.value },
                  );
                }}
              />
            </FormField>

            <FormField label="Konto" htmlFor="character-account">
              <Select
                id="character-account"
                value={form.gameAccountId}
                disabled={saving || accountOptions.length === 0}
                options={accountOptions}
                onChange={(event) => {
                  setForm((prev) =>
                    prev === null ? prev : { ...prev, gameAccountId: event.target.value },
                  );
                }}
              />
            </FormField>

            <div className="profile-form-actions">
              <Button variant="primary" disabled={saving} onClick={() => void submitCharacter()}>
                {saving ? 'Zapisywanie…' : editingId === null ? 'Dodaj postać' : 'Zapisz zmiany'}
              </Button>
              <Button variant="ghost" disabled={saving} onClick={resetForm}>
                Anuluj
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
