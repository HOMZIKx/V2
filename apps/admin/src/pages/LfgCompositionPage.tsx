import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, FormField, Panel, Select } from '@v2/design-system';

import {
  listLfgCompositionTemplates,
  upsertLfgCompositionTemplates,
  type LfgCompositionRoleKey,
} from '../api/lfg-composition.js';
import { readAdminSession } from '../auth/session.js';
import { Flash, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useRequiredGuildId } from '../layout/GuildContext.js';

type DungeonKey = 'azrael' | 'smok';

const DUNGEON_OPTIONS: readonly { value: DungeonKey; label: string }[] = [
  { value: 'azrael', label: 'Azrael' },
  { value: 'smok', label: 'Smok' },
];

const DEFAULT_COUNTS: Record<LfgCompositionRoleKey, number> = {
  TANK: 1,
  BUFF: 1,
  DPS: 3,
  FLEX: 0,
};

const EDITABLE_ROLES: readonly LfgCompositionRoleKey[] = ['TANK', 'BUFF', 'DPS'];

function resolveAdminOrgId(): string | null {
  const session = readAdminSession();
  if (session.orgId !== null && session.orgId.trim() !== '') {
    return session.orgId.trim();
  }
  for (const key of ['VITE_ADMIN_ORG_ID', 'VITE_ADMIN_DEV_ORG_ID'] as const) {
    const raw: unknown = import.meta.env[key];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.trim();
    }
  }
  return null;
}

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

export function LfgCompositionPage() {
  const guildId = useRequiredGuildId();
  const orgId = useMemo(() => resolveAdminOrgId(), []);
  const [dungeonKey, setDungeonKey] = useState<DungeonKey>('azrael');
  const [counts, setCounts] = useState<Record<LfgCompositionRoleKey, number>>(DEFAULT_COUNTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (guildId === null || orgId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listLfgCompositionTemplates(orgId, guildId, dungeonKey);
      setCounts(countsFromRoles(data.roles));
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setCounts(DEFAULT_COUNTS);
    } finally {
      setLoading(false);
    }
  }, [dungeonKey, guildId, orgId]);

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
        activityTypeKey: dungeonKey,
        roles: EDITABLE_ROLES.map((partyRoleKey) => ({
          partyRoleKey,
          requiredCount: counts[partyRoleKey],
          preferred: partyRoleKey === 'TANK',
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

  if (orgId === null) {
    return (
      <>
        <PageHeader
          title="Skład LFG"
          description="Domyślne wymagania ról dla dungeonów Azrael i Smok."
        />
        <Flash tone="error">
          Brak identyfikatora organizacji. Ustaw VITE_ADMIN_DEV_ORG_ID (dev) lub VITE_ADMIN_ORG_ID.
        </Flash>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Skład LFG"
        description="Domyślne liczby ról TANK / BUFF / DPS dla dopasowania ekip dungeonowych."
      />

      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <Panel title="Dungeon">
        <Select
          id="lfg-composition-dungeon"
          aria-label="Typ dungeonu"
          value={dungeonKey}
          options={DUNGEON_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
          onChange={(event) => {
            setDungeonKey(event.target.value as DungeonKey);
          }}
        />
      </Panel>

      {loading ? (
        <p className="state-loading">Ładowanie szablonu…</p>
      ) : (
        <Panel
          title={`Domyślny skład — ${DUNGEON_OPTIONS.find((entry) => entry.value === dungeonKey)?.label ?? dungeonKey}`}
        >
          <div className="form-grid">
            {EDITABLE_ROLES.map((roleKey) => (
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
              </FormField>
            ))}
          </div>
          <p className="muted">
            Organizacja: <code>{orgId}</code> · Serwer: <code>{guildId ?? '—'}</code>
          </p>
          <Button disabled={busy || guildId === null} onClick={() => void onSave()}>
            Zapisz szablon
          </Button>
        </Panel>
      )}
    </>
  );
}
