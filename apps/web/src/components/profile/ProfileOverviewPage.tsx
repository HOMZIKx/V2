'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Panel } from '@v2/design-system';
import { resolveHubClassSpecLabel } from '@v2/hub-core';

import { getIdentityProfile, type IdentityProfileDto } from '../../lib/lfg-api';
import { mapApiError } from '../../lib/load-state';
import { isAbortError, memberErrorCopy } from '../../lib/member-copy';
import { createRequestIdentity } from '../../lib/request-identity';
import { useSession } from '../SessionProvider';
import { ErrorState, LoadingState, UnauthorizedState } from '../StateViews';
import { groupCharactersByAccount, resolveActiveCharacter } from './profile-utils';

export function ProfileOverviewPage() {
  const { status: sessionStatus } = useSession();
  const requests = useRef(createRequestIdentity());
  const [profile, setProfile] = useState<IdentityProfileDto | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

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

  if (
    sessionStatus === 'loading' ||
    (sessionStatus === 'authenticated' && loadState === 'loading')
  ) {
    return <LoadingState label="Ładowanie profilu…" />;
  }

  if (sessionStatus === 'anonymous') {
    return <UnauthorizedState />;
  }

  if (sessionStatus === 'error' || loadState === 'error') {
    return <ErrorState>{loadError ?? 'Nie udało się wczytać profilu.'}</ErrorState>;
  }

  const active = profile !== null ? resolveActiveCharacter(profile) : null;
  const accountCount = profile?.gameAccounts?.length ?? 0;
  const characterCount = profile?.characters.length ?? 0;
  const groups = profile !== null ? groupCharactersByAccount(profile) : [];

  return (
    <div className="member-page profile-page">
      <Panel title="Dzisiaj">
        {active === null ? (
          <p className="muted">Dodaj postać, aby korzystać z LFG i kolejnych narzędzi V2.</p>
        ) : (
          <p>
            Aktywna postać: <strong>{active.nickname}</strong>
            {' · '}
            {active.classSpecLabel ?? resolveHubClassSpecLabel(active.classSpecKey)}
            {active.level !== undefined && active.level !== null
              ? ` · ${String(active.level)}`
              : ''}
          </p>
        )}
      </Panel>

      <Panel title="Moje postacie">
        <p className="profile-summary-line">
          {characterCount}{' '}
          {characterCount === 1 ? 'postać' : characterCount < 5 ? 'postacie' : 'postaci'}
          {' · '}
          {accountCount} {accountCount === 1 ? 'konto' : accountCount < 5 ? 'konta' : 'kont'}
        </p>
        {groups.length === 0 ? (
          <p className="muted">Nie masz jeszcze postaci.</p>
        ) : (
          <div className="profile-account-groups">
            {groups.map((group) => (
              <section key={group.account?.id ?? 'orphan'} className="profile-account-group">
                <h3 className="profile-account-title">
                  {group.account?.displayName ?? 'Bez konta'}
                </h3>
                <ul className="profile-account-character-names">
                  {group.characters.map((character) => (
                    <li key={character.id}>{character.nickname}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <div className="profile-panel-actions">
          <Link href="/profil/postacie" className="v2-btn v2-btn-primary">
            Zarządzaj postaciami
          </Link>
        </div>
      </Panel>
    </div>
  );
}
