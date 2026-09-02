import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, FormField, Panel, Select } from '@v2/design-system';

import { resolveAdminOrgId } from '../admin-org.js';
import { listTypes, type ActivityTypeDto } from '../api/activity-admin.js';
import {
  listLfgCompositionTemplates,
  upsertLfgCompositionTemplates,
  type LfgCompositionRoleKey,
} from '../api/lfg-composition.js';
import { Flash, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useRequiredGuildId } from '../layout/GuildContext.js';

/** Dungeon LFG v1 eligibility — keys only; labels from configured activity types. */
const LFG_V1_DUNGEON_TYPE_KEYS = new Set(['azrael', 'smok']);

const ALL_ROLES: readonly LfgCompositionRoleKey[] = ['TANK', 'BUFF', 'DPS', 'FLEX'];

const DEFAULT_COUNTS: Record<LfgCompositionRoleKey, number> = {
  TANK: 1,
  BUFF: 1,
  DPS: 3,
  FLEX: 0,
};

const DEFAULT_PREFERRED: Record<LfgCompositionRoleKey, boolean> = {
  TANK: false,
  BUFF: false,
  DPS: false,
  FLEX: false,
};

const ROLE_LABELS: Record<LfgCompositionRoleKey, string> = {
  TANK: 'Tank',
  BUFF: 'Buff',
  DPS: 'DPS',
  FLEX: 'Flex',
};

function roleLabel(key: LfgCompositionRoleKey): string {
  return ROLE_LABELS[key];
}

function countsFromRoles(
  roles: readonly { partyRoleKey: LfgCompositionRoleKey; requiredCount: number }[],
): Record<LfgCompositionRoleKey, number> {
  const next = { ...DEFAULT_COUNTS };
  for (const role of roles) {
    next[role.partyRoleKey] = role.requiredCount;
  }
  return next;
}

function preferredFromRoles(
  roles: readonly { partyRoleKey: LfgCompositionRoleKey; preferred: boolean }[],
): Record<LfgCompositionRoleKey, boolean> {
  const next = { ...DEFAULT_PREFERRED };
  for (const role of roles) {
    next[role.partyRoleKey] = role.preferred;
  }
  return next;
}

export function LfgCompositionPage() {
  const guildId = useRequiredGuildId();
  const orgId = useMemo(() => resolveAdminOrgId(), []);
  const [dungeonTypes, setDungeonTypes] = useState<readonly ActivityTypeDto[]>([]);
  const [activityTypeKey, setActivityTypeKey] = useState<string>('azrael');
  const [counts, setCounts] = useState<Record<LfgCompositionRoleKey, number>>(DEFAULT_COUNTS);
  const [preferred, setPreferred] =
    useState<Record<LfgCompositionRoleKey, boolean>>(DEFAULT_PREFERRED);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    if (guildId === null) {
      setDungeonTypes([]);
      return;
    }
    try {
      const types = await listTypes(guildId);
      const eligible = types.filter(
        (entry) => entry.enabled && LFG_V1_DUNGEON_TYPE_KEYS.has(entry.key),
      );
      setDungeonTypes(eligible);
      if (eligible.length > 0 && !eligible.some((entry) => entry.key === activityTypeKey)) {
        setActivityTypeKey(eligible[0]?.key ?? 'azrael');
      }
    } catch (err) {
      setError(errorFromUnknown(err).message);
      setDungeonTypes([]);
    }
  }, [activityTypeKey, guildId]);

  const load = useCallback(async () => {
    if (guildId === null || orgId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listLfgCompositionTemplates(orgId, guildId, activityTypeKey);
      setCounts(countsFromRoles(data.roles));
      setPreferred(preferredFromRoles(data.roles));
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setCounts(DEFAULT_COUNTS);
      setPreferred(DEFAULT_PREFERRED);
    } finally {
      setLoading(false);
    }
  }, [activityTypeKey, guildId, orgId]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    if (guildId === null || orgId === null) {
      return;
    }
    setBusy(true);
    setFlash(null);
    setError(null);
    try {
      await upsertLfgCompositionTemplates(orgId, guildId, {
        activityTypeKey,
        roles: ALL_ROLES.map((partyRoleKey) => ({
          partyRoleKey,
          requiredCount: counts[partyRoleKey],
          preferred: preferred[partyRoleKey],
        })),
      });
      setFlash('Szablony składu zapisane.');
      await load();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  const dungeonLabel =
    dungeonTypes.find((entry) => entry.key === activityTypeKey)?.label ?? activityTypeKey;

  if (orgId === null) {
    return (
      <>
        <PageHeader
          title="Skład LFG"
          description="Domyślne wymagania ról dla dungeonów LFG v1 (z katalogu typów aktywności)."
        />
        <Flash tone="error">
          Nie udało się ustalić konfiguracji tego serwera. Sprawdź diagnostykę V2 lub skontaktuj się
          z administratorem platformy.
        </Flash>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Skład LFG"
        description="Domyślne liczby i preferencje ról TANK / BUFF / DPS / FLEX dla dopasowania ekip dungeonowych."
      />

      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <Panel title="Typ aktywności (dungeon LFG v1)">
        {dungeonTypes.length === 0 ? (
          <p className="muted">
            Brak włączonych typów dungeonów LFG w katalogu serwera. Dodaj i włącz odpowiednie typy
            aktywności w sekcji Typy aktywności.
          </p>
        ) : (
          <Select
            id="lfg-composition-dungeon"
            aria-label="Typ dungeonu"
            value={activityTypeKey}
            options={dungeonTypes.map((entry) => ({ value: entry.key, label: entry.label }))}
            onChange={(event) => {
              setActivityTypeKey(event.target.value);
            }}
          />
        )}
      </Panel>

      {loading ? (
        <p className="state-loading">Ładowanie szablonu…</p>
      ) : (
        <Panel title={`Domyślny skład — ${dungeonLabel}`}>
          <div className="form-grid">
            {ALL_ROLES.map((roleKey) => (
              <FormField key={roleKey} label={roleLabel(roleKey)} htmlFor={`role-count-${roleKey}`}>
                <input
                  id={`role-count-${roleKey}`}
                  className="v2-input"
                  type="number"
                  min={0}
                  max={8}
                  value={counts[roleKey]}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    setCounts((prev) => ({
                      ...prev,
                      [roleKey]: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                    }));
                  }}
                />
                <label className="muted" style={{ display: 'block', marginTop: '0.35rem' }}>
                  <input
                    type="checkbox"
                    checked={preferred[roleKey]}
                    onChange={(event) => {
                      setPreferred((prev) => ({ ...prev, [roleKey]: event.target.checked }));
                    }}
                  />{' '}
                  Preferowana rola
                </label>
              </FormField>
            ))}
          </div>
          <p className="muted">
            Organizacja: <code>{orgId}</code> · Serwer: <code>{guildId ?? '—'}</code>
          </p>
          <Button
            disabled={busy || guildId === null || dungeonTypes.length === 0}
            onClick={() => void onSave()}
          >
            Zapisz szablon
          </Button>
        </Panel>
      )}
    </>
  );
}
