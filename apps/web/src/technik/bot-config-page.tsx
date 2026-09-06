'use client';

/**
 * Technik bot configurator (D-060) — live only.
 * 1) Discord guilds (TEST first when distinguishable, then MAIN)
 * 2) characterTimers + kingdomWar + Test DM
 * Mutations via /api/technik/* (server holds DISCORD_TECHNIKA_SHARED_SECRET).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_CHARACTER_TIMERS,
  DEFAULT_GUILD_MODULES,
  DEFAULT_GUILD_RIGHTS,
  DEFAULT_KINGDOM_WAR,
  GUILD_MODULE_KEYS,
  GUILD_RIGHTS,
  type BotCapability,
  type CharacterTimersConfig,
  type ConfigSnapshot,
  type GuildModules,
  type GuildRight,
  type KingdomWarConfig,
  type TechnikaGuildDto,
  computeNotifyAt,
  fetchActiveConfig,
  fetchCapabilities,
  fetchGuilds,
  fetchTechnikaMeta,
  TECHNIK_TEST_GUILD_ID,
  guildDisplayLabel,
  pickCharacterTimers,
  pickDefaultGuildId,
  postConfigApply,
  postConfigPreview,
  postConfigRollback,
  postConfigTestDm,
  postConfigValidate,
  putConfigDraft,
  putGuild,
  sortGuildsForTechnik,
} from './technika-config-api';

const STEPPER_STEPS = [
  { id: 'Draft', label: 'Szkic' },
  { id: 'Validate', label: 'Sprawdź' },
  { id: 'Preview', label: 'Zobacz co się zmieni' },
  { id: 'Apply', label: 'Zapisz i włącz' },
  { id: 'Audit', label: 'Historia' },
  { id: 'Rollback', label: 'Cofnij ostatnią zmianę' },
] as const;

type StepId = (typeof STEPPER_STEPS)[number]['id'];

const WAR_AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MODULE_META: Record<
  (typeof GUILD_MODULE_KEYS)[number],
  { title: string; help: string }
> = {
  characterTimers: {
    title: 'Timery postaci',
    help: 'Żywy moduł — PW o timerach postaci (np. Księga).',
  },
  kingdomWar: {
    title: 'Wojna królestw',
    help: 'Żywy moduł — PW przed wojną.',
  },
  panels: {
    title: 'Panele Discord',
    help: 'Zapis w config działa już teraz; egzekwowanie runtime dopina New Bot.',
  },
  channels: {
    title: 'Kanały / publikacja',
    help: 'Zapis w config działa już teraz; egzekwowanie runtime dopina New Bot.',
  },
};

const RIGHT_META: Record<GuildRight, string> = {
  'technika.config': 'Technika: konfiguracja',
  'technika.apply': 'Technika: włączanie (apply)',
  'technika.rollback': 'Technika: cofanie',
  'discord.notify': 'Discord: powiadomienia (PW)',
  'discord.panels': 'Discord: panele',
  'discord.commands': 'Discord: komendy',
};

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function looksLikeSecret(value: string): boolean {
  return /token|secret|password|api[_-]?key|Bearer\s|mongodb(\+srv)?:\/\//i.test(value);
}

function sourceLabel(source: TechnikaGuildDto['source']): string {
  if (source === 'both') return 'w config + bot online';
  if (source === 'configured') return 'tylko w config';
  if (source === 'discovered') return 'bot widzi (jeszcze bez config)';
  return '—';
}

type GuildEditState = {
  enabled: boolean;
  name: string;
  modules: {
    characterTimers: boolean;
    kingdomWar: boolean;
    panels: boolean;
    channels: boolean;
  };
  rights: GuildRight[];
};

function toEditState(g: TechnikaGuildDto): GuildEditState {
  const m = { ...DEFAULT_GUILD_MODULES, ...g.modules };
  const rights = (g.rights ?? []).filter((r): r is GuildRight =>
    (GUILD_RIGHTS as readonly string[]).includes(r),
  );
  return {
    enabled: Boolean(g.enabled),
    name: g.name ?? '',
    modules: {
      characterTimers: Boolean(m.characterTimers),
      kingdomWar: Boolean(m.kingdomWar),
      panels: Boolean(m.panels ?? true),
      channels: Boolean(m.channels ?? false),
    },
    rights: rights.length > 0 ? rights : [...DEFAULT_GUILD_RIGHTS],
  };
}

export function TechnikBotConfigPage() {
  const [step, setStep] = useState<StepId>('Draft');
  const [charTimers, setCharTimers] = useState<CharacterTimersConfig>(DEFAULT_CHARACTER_TIMERS);
  const [timersApiKey, setTimersApiKey] = useState<'characterTimers' | 'timersNotify'>(
    'characterTimers',
  );
  const [warDraft, setWarDraft] = useState<KingdomWarConfig>(DEFAULT_KINGDOM_WAR);
  const [panelTestEnabled, setPanelTestEnabled] = useState(true);
  const [notifyTimerEnabled, setNotifyTimerEnabled] = useState(true);
  const [testUserId, setTestUserId] = useState('');
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<readonly BotCapability[]>([]);
  const [mutationsEnabled, setMutationsEnabled] = useState(false);
  const [gatewayLabel, setGatewayLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [previewText, setPreviewText] = useState('');
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [testDmMsg, setTestDmMsg] = useState<string | null>(null);

  const [guilds, setGuilds] = useState<TechnikaGuildDto[]>([]);
  const [guildsRevision, setGuildsRevision] = useState<number | null>(null);
  const [guildsBotReady, setGuildsBotReady] = useState<boolean | null>(null);
  const [guildsError, setGuildsError] = useState<string | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [guildEdit, setGuildEdit] = useState<GuildEditState | null>(null);
  const [guildSaveMsg, setGuildSaveMsg] = useState<string | null>(null);

  const warNotifyAt = useMemo(
    () => computeNotifyAt(warDraft.warAt, warDraft.notifyMinutesBefore),
    [warDraft.warAt, warDraft.notifyMinutesBefore],
  );

  const hasCharacterTimersCap = useMemo(
    () => capabilities.some((c) => c.id === 'characterTimers'),
    [capabilities],
  );

  const hasPanelTestCap = useMemo(
    () => capabilities.some((c) => c.id === 'panel-test-enabled'),
    [capabilities],
  );

  const orderedGuilds = useMemo(() => sortGuildsForTechnik(guilds), [guilds]);

  const selectedGuild = useMemo(
    () => orderedGuilds.find((g) => g.id === selectedGuildId) ?? null,
    [orderedGuilds, selectedGuildId],
  );

  const loadGuilds = useCallback(async (preferId?: string | null) => {
    setGuildsError(null);
    const res = await fetchGuilds();
    if (!res.ok) {
      setGuilds([]);
      setGuildsRevision(null);
      setGuildsBotReady(null);
      setSelectedGuildId(null);
      setGuildEdit(null);
      const unreachable =
        res.error === 'gateway_unreachable' || res.error === 'network_error';
      setGuildsError(
        unreachable
          ? `Brak połączenia z bramką Discord (${res.error})${
              res.detail ? ` — ${res.detail}` : ''
            }. Uruchom discord-gateway lokalnie albo sprawdź DISCORD_GATEWAY_BASE_URL.`
          : `Nie udało się pobrać listy Discordów: ${res.error}${
              res.detail ? ` — ${res.detail}` : ''
            }`,
      );
      return;
    }
    const sorted = sortGuildsForTechnik(res.data.guilds);
    setGuilds(sorted);
    setGuildsRevision(res.data.revision);
    setGuildsBotReady(
      typeof res.data.botReady === 'boolean' ? res.data.botReady : null,
    );
    const keep = pickDefaultGuildId(sorted, preferId);
    setSelectedGuildId(keep);
    const pick = sorted.find((g) => g.id === keep);
    setGuildEdit(pick ? toEditState(pick) : null);
  }, []);

  const load = useCallback(async () => {
    const [meta, active, caps] = await Promise.all([
      fetchTechnikaMeta(),
      fetchActiveConfig(),
      fetchCapabilities(),
    ]);
    if (meta.ok) {
      setMutationsEnabled(meta.data.mutationsEnabled);
      setGatewayLabel(meta.data.gateway);
    }
    if (caps.ok) {
      setCapabilities(caps.data.capabilities);
    }
    if (active.ok) {
      setSnapshot(active.data);
      setActionError(null);
      const cfg = active.data.config;
      const picked = pickCharacterTimers(cfg);
      setCharTimers(picked.values);
      const preferCharacter =
        caps.ok && caps.data.capabilities.some((c) => c.id === 'characterTimers');
      setTimersApiKey(preferCharacter ? 'characterTimers' : picked.apiKey);
      if (cfg?.kingdomWar) {
        setWarDraft({ ...DEFAULT_KINGDOM_WAR, ...cfg.kingdomWar });
      }
      if (typeof cfg?.['panel-test-enabled'] === 'boolean') {
        setPanelTestEnabled(cfg['panel-test-enabled']);
      }
      if (typeof cfg?.['notify-timer-enabled'] === 'boolean') {
        setNotifyTimerEnabled(cfg['notify-timer-enabled']);
      }
    } else {
      setActionError(
        `Nie udało się pobrać ustawień: ${active.error}${
          active.detail ? ` — ${active.detail}` : ''
        }`,
      );
    }
    await loadGuilds(selectedGuildId);
  }, [loadGuilds, selectedGuildId]);

  useEffect(() => {
    void load();
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectGuild = (id: string) => {
    setGuildSaveMsg(null);
    setSelectedGuildId(id);
    const g = orderedGuilds.find((x) => x.id === id);
    setGuildEdit(g ? toEditState(g) : null);
  };

  const toggleRight = (right: GuildRight) => {
    setGuildEdit((prev) => {
      if (!prev) return prev;
      const has = prev.rights.includes(right);
      return {
        ...prev,
        rights: has ? prev.rights.filter((r) => r !== right) : [...prev.rights, right],
      };
    });
  };

  const saveGuildDraft = async () => {
    if (!selectedGuildId || !guildEdit) return;
    setGuildSaveMsg(null);
    setActionError(null);
    if (!mutationsEnabled) {
      setGuildSaveMsg(
        'Zapis zablokowany — na serwerze web brakuje DISCORD_TECHNIKA_SHARED_SECRET (nie NEXT_PUBLIC_).',
      );
      return;
    }
    setBusy(true);
    try {
      const modules: GuildModules = {
        characterTimers: guildEdit.modules.characterTimers,
        kingdomWar: guildEdit.modules.kingdomWar,
        panels: guildEdit.modules.panels,
        channels: guildEdit.modules.channels,
      };
      const res = await putGuild(selectedGuildId, {
        enabled: guildEdit.enabled,
        ...(guildEdit.name.trim() ? { name: guildEdit.name.trim() } : {}),
        modules,
        rights: guildEdit.rights,
      });
      if (!res.ok) {
        const issues = (res.issues ?? []).map((i) => `${i.path}: ${i.message}`).join('; ');
        setGuildSaveMsg(
          `Nie zapisano szkicu guildii: ${res.error}${
            res.detail ? ` — ${res.detail}` : ''
          }${issues ? ` (${issues})` : ''}`,
        );
        return;
      }
      setGuildSaveMsg(
        `Zapisano szkic Discorda „${guildDisplayLabel(res.data.guild)}”. ` +
          `To jeszcze NIE działa na produkcji — użyj kroków Sprawdź → Zobacz → Zapisz i włącz poniżej.`,
      );
      setLastAction(`szkic guildii ${res.data.guild.id} (rev draft)`);
      setSnapshot((prev) =>
        prev
          ? { ...prev, hasDraft: true, revision: res.data.revision }
          : prev,
      );
      await loadGuilds(selectedGuildId);
    } finally {
      setBusy(false);
    }
  };

  const buildDraftPartial = () => {
    const partial: Record<string, unknown> = {
      kingdomWar: warDraft,
      'notify-timer-enabled': notifyTimerEnabled,
    };
    if (hasPanelTestCap) {
      partial['panel-test-enabled'] = panelTestEnabled;
    }
    if (timersApiKey === 'characterTimers' || hasCharacterTimersCap) {
      partial.characterTimers = charTimers;
      partial.timersNotify = charTimers;
    } else {
      partial.timersNotify = charTimers;
    }
    return partial;
  };

  const runValidate = async () => {
    setActionError(null);
    const local: string[] = [];

    if (
      !Number.isInteger(charTimers.reminderMinutesBefore) ||
      charTimers.reminderMinutesBefore < 1 ||
      charTimers.reminderMinutesBefore > 24 * 60
    ) {
      local.push('Timery postaci: podaj liczbę minut od 1 do 1440 (zwykle 60).');
    }
    if (charTimers.enabled && charTimers.messageTemplate.trim().length < 1) {
      local.push('Timery postaci są włączone — wpisz treść wiadomości.');
    }
    if (looksLikeSecret(charTimers.messageTemplate)) {
      local.push('Treść wiadomości timerów wygląda na sekret — usuń tokeny i hasła.');
    }
    if (!WAR_AT_RE.test(warDraft.warAt)) {
      local.push('Godzina wojny: użyj formatu HH:MM (czas warszawski, 24h).');
    }
    if (
      !Number.isInteger(warDraft.notifyMinutesBefore) ||
      warDraft.notifyMinutesBefore < 1 ||
      warDraft.notifyMinutesBefore > 24 * 60
    ) {
      local.push('Przypomnienie o wojnie: podaj liczbę minut od 1 do 1440 (zwykle 30).');
    }
    if (warDraft.enabled && warDraft.messageTemplate.trim().length < 1) {
      local.push('Przypomnienie o wojnie jest włączone — wpisz treść wiadomości.');
    }
    if (looksLikeSecret(warDraft.messageTemplate)) {
      local.push('Treść wiadomości o wojnie wygląda na sekret — usuń tokeny i hasła.');
    }
    if (warNotifyAt) {
      local.push(
        `Wojna o ${warDraft.warAt} — bot przypomni o ${warNotifyAt} (czas warszawski).`,
      );
    }

    if (!mutationsEnabled) {
      setValidationMessages([
        ...local,
        'Zapis jest wyłączony — na serwerze web brakuje klucza DISCORD_TECHNIKA_SHARED_SECRET (nie NEXT_PUBLIC_).',
      ]);
      setStep('Validate');
      return;
    }

    setBusy(true);
    try {
      const draftRes = await putConfigDraft(buildDraftPartial());
      if (!draftRes.ok) {
        const issueLines = (draftRes.issues ?? []).map((i) => `${i.path}: ${i.message}`);
        setValidationMessages([
          ...local,
          `Nie udało się zapisać szkicu: ${draftRes.error}`,
          ...(draftRes.detail ? [draftRes.detail] : []),
          ...issueLines,
        ]);
        setStep('Validate');
        return;
      }

      const valRes = await postConfigValidate();
      if (!valRes.ok) {
        setValidationMessages([
          ...local,
          `Sprawdzanie nieudane: ${valRes.error}`,
          ...(valRes.detail ? [valRes.detail] : []),
          ...(valRes.issues ?? []).map((i) => `${i.path}: ${i.message}`),
        ]);
        setStep('Validate');
        return;
      }

      const apiIssues = valRes.data.issues.map((i) => `${i.path}: ${i.message}`);
      setValidationMessages([
        ...local,
        valRes.data.ok ? 'Sprawdzanie: wszystko OK' : 'Sprawdzanie: są błędy',
        ...apiIssues,
      ]);
      setLastAction('zapisano szkic i sprawdzono');
      setStep('Validate');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setActionError(null);
    if (!mutationsEnabled) {
      setPreviewText(
        pretty({
          mode: 'local-only',
          warning: 'Brak klucza na serwerze — podgląd tylko lokalny.',
          draft: buildDraftPartial(),
          kingdomWarNotifyAt: warNotifyAt,
        }),
      );
      setStep('Preview');
      return;
    }
    setBusy(true);
    try {
      const res = await postConfigPreview();
      if (!res.ok) {
        setActionError(`Podgląd: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setPreviewText(pretty(res.body ?? { error: res.error }));
      } else {
        setPreviewText(pretty(res.data));
        setLastAction('podgląd zmian');
      }
      setStep('Preview');
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    if (!mutationsEnabled) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await postConfigApply();
      if (!res.ok) {
        setActionError(`Zapisz i włącz: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setStep('Apply');
        return;
      }
      setSnapshot(res.data);
      setLastAction(`zapisano i włączono (wersja ${res.data.revision})`);
      setStep('Apply');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runRollback = async () => {
    if (!mutationsEnabled) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await postConfigRollback();
      if (!res.ok) {
        setActionError(`Cofnij: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setStep('Rollback');
        return;
      }
      setSnapshot(res.data);
      setLastAction(`cofnięto do wersji ${res.data.revision}`);
      setStep('Rollback');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runTestDm = async (module: 'timersNotify' | 'characterTimers' | 'kingdomWar') => {
    setTestDmMsg(null);
    setActionError(null);
    if (!mutationsEnabled) {
      setTestDmMsg('Brak klucza na serwerze — nie da się wysłać testowej PW.');
      return;
    }
    setBusy(true);
    try {
      const moduleKey =
        module === 'kingdomWar'
          ? 'kingdomWar'
          : hasCharacterTimersCap || timersApiKey === 'characterTimers'
            ? 'characterTimers'
            : 'timersNotify';
      const payload =
        module === 'kingdomWar'
          ? {
              module: 'kingdomWar' as const,
              messageTemplate: warDraft.messageTemplate,
              warAt: warDraft.warAt,
              notifyMinutesBefore: warDraft.notifyMinutesBefore,
              ...(testUserId.trim() ? { discordUserId: testUserId.trim() } : {}),
            }
          : {
              module: moduleKey,
              messageTemplate: charTimers.messageTemplate,
              reminderMinutesBefore: charTimers.reminderMinutesBefore,
              ...(testUserId.trim() ? { discordUserId: testUserId.trim() } : {}),
            };
      const res = await postConfigTestDm(payload);
      if (!res.ok) {
        setTestDmMsg(
          `Test PW nieudany: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`,
        );
        return;
      }
      setTestDmMsg(
        `Wysłano testową PW (${res.data.module}) → użytkownik ${res.data.discordUserId}, msg ${res.data.messageId}.`,
      );
      setLastAction('testowa PW');
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPPER_STEPS.findIndex((s) => s.id === step);
  const canApply = mutationsEnabled && !busy;
  const canRollback = mutationsEnabled && !busy && Boolean(snapshot?.canRollback);
  const isolationDisplay =
    snapshot?.strictGuildIsolation ??
    capabilities.find((c) => c.id === 'strict-guild-isolation')?.currentDisplayValue;

  return (
    <>
      <h1>Konfiguracja bota</h1>
      <p className="technik-lead">
        Najpierw wybierz Discordy, które obsługujemy (TEST, potem MAIN), włącz funkcje i prawa.
        Potem ustaw treści PW (timery postaci, wojna). Szkic guildii / ustawień → Sprawdź → Zapisz i
        włącz.
      </p>

      <section className="technik-panel technik-panel--wide">
        <div className="technik-panel-head">
          <h2>Discordy (guildie)</h2>
          <span
            className={
              guildsError
                ? 'technik-pill technik-pill--pending'
                : 'technik-pill technik-pill--live'
            }
          >
            {guildsError
              ? 'API niedostępne'
              : guildsBotReady === false
                ? 'lista z config (bot offline)'
                : 'GUILDS LIVE'}
          </span>
        </div>
        <p className="technik-help">
          Tu konfigurujesz <strong>które serwery Discord</strong> obsługujemy oraz które funkcje i
          prawa na nich działają. Najpierw ustaw <strong>testowy</strong> Discord (<code>1534228693017432124</code>) — logowanie + funkcje bota (timery postaci),
          potem <strong>MAIN</strong>. Zapis guildii idzie do <strong>szkicu</strong> — żeby weszło
          na produkcję, użyj kroków D-060 poniżej (Sprawdź → Zapisz i włącz).
        </p>

        {guildsError ? (
          <div className="technik-error" role="alert" style={{ marginTop: '0.75rem' }}>
            <p>
              <strong>Nie pokażemy atrapy listy.</strong> {guildsError}
            </p>
            <div className="technik-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={() => void loadGuilds(selectedGuildId)} disabled={busy}>
                Spróbuj ponownie
              </button>
            </div>
          </div>
        ) : orderedGuilds.length === 0 ? (
          <p className="technik-muted" style={{ marginTop: '0.75rem' }}>
            API zwróciło pustą listę. Gdy bot jest online albo masz wpisy w config /{' '}
            <code>DISCORD_TEST_GUILD_ID</code>, pojawią się tutaj.
          </p>
        ) : (
          <div className="technik-guild-layout" style={{ marginTop: '0.85rem' }}>
            <ul className="technik-guild-list" aria-label="Lista Discordów">
              {orderedGuilds.map((g, index) => {
                const label = guildDisplayLabel(g);
                const active = g.id === selectedGuildId;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={
                        active
                          ? 'technik-guild-list__btn technik-guild-list__btn--active'
                          : 'technik-guild-list__btn'
                      }
                      onClick={() => selectGuild(g.id)}
                    >
                      <span className="technik-guild-list__order">{index + 1}</span>
                      <span className="technik-guild-list__body">
                        <strong>{label}</strong>
                        <span className="technik-muted">
                          {g.id === TECHNIK_TEST_GUILD_ID ? 'priorytet TEST · ' : ''}{g.enabled ? 'włączony' : 'wyłączony'} · {sourceLabel(g.source)} ·{' '}
                          <code>{g.id}</code>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selectedGuild && guildEdit ? (
              <div className="technik-guild-editor">
                <h3>{guildDisplayLabel(selectedGuild)}</h3>
                <p className="technik-meta">
                  ID: <code>{selectedGuild.id}</code> · źródło: {sourceLabel(selectedGuild.source)}
                  {guildsRevision !== null ? ` · rev ${guildsRevision}` : ''}
                </p>

                <label className="technik-check" style={{ marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={guildEdit.enabled}
                    onChange={(e) =>
                      setGuildEdit((prev) =>
                        prev ? { ...prev, enabled: e.target.checked } : prev,
                      )
                    }
                  />
                  Włącz obsługę tego Discorda (bot + Technika)
                </label>

                <label className="technik-field" style={{ marginTop: '0.65rem' }}>
                  <span>Nazwa / etykieta (opcjonalnie)</span>
                  <input
                    type="text"
                    maxLength={100}
                    value={guildEdit.name}
                    placeholder="np. DESTILED TEST"
                    onChange={(e) =>
                      setGuildEdit((prev) =>
                        prev ? { ...prev, name: e.target.value } : prev,
                      )
                    }
                  />
                  <span className="technik-help">
                    Podpowiedź: w nazwie użyj „TEST” albo „MAIN”, żeby lista sortowała się czytelnie
                    (TEST pierwszy).
                  </span>
                </label>

                <fieldset className="technik-fieldset" style={{ marginTop: '0.85rem' }}>
                  <legend>Funkcje na tym Discordzie</legend>
                  {GUILD_MODULE_KEYS.map((key) => (
                    <label key={key} className="technik-check">
                      <input
                        type="checkbox"
                        checked={guildEdit.modules[key]}
                        onChange={(e) =>
                          setGuildEdit((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  modules: { ...prev.modules, [key]: e.target.checked },
                                }
                              : prev,
                          )
                        }
                      />
                      <span>
                        <strong>{MODULE_META[key].title}</strong>
                        <span className="technik-help"> — {MODULE_META[key].help}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="technik-fieldset" style={{ marginTop: '0.85rem' }}>
                  <legend>Prawa (z OpenAPI)</legend>
                  {GUILD_RIGHTS.map((right) => (
                    <label key={right} className="technik-check">
                      <input
                        type="checkbox"
                        checked={guildEdit.rights.includes(right)}
                        onChange={() => toggleRight(right)}
                      />
                      <span>
                        {RIGHT_META[right]} <code>{right}</code>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <div className="technik-row" style={{ marginTop: '0.85rem' }}>
                  <button
                    type="button"
                    disabled={busy || !mutationsEnabled}
                    onClick={() => void saveGuildDraft()}
                  >
                    {busy ? '…' : 'Zapisz guildię do szkicu'}
                  </button>
                  <button
                    type="button"
                    className="technik-btn-ghost"
                    disabled={busy}
                    onClick={() => void loadGuilds(selectedGuildId)}
                  >
                    Odśwież listę
                  </button>
                </div>
                {guildSaveMsg ? (
                  <p className="technik-muted" role="status" style={{ marginTop: '0.5rem' }}>
                    {guildSaveMsg}
                  </p>
                ) : (
                  <p className="technik-help" style={{ marginTop: '0.5rem' }}>
                    Przycisk zapisuje tylko szkic <code>config.guilds[id]</code>. Produkcja = „Zapisz
                    i włącz” w stepperze D-060.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Jak zapisać (D-060)</h2>
          <span
            className={
              mutationsEnabled
                ? 'technik-pill technik-pill--live'
                : 'technik-pill technik-pill--pending'
            }
          >
            {mutationsEnabled ? 'Możesz zapisywać' : 'Zapis zablokowany (brak klucza)'}
          </span>
        </div>
        <p className="technik-help">
          Dotyczy szkicu guildii <strong>oraz</strong> treści PW poniżej. Po „Zapisz guildię do
          szkicu” nadal kliknij Sprawdź → Zapisz i włącz.
        </p>
        <ol className="technik-stepper" aria-label="Kroki zapisu ustawień">
          {STEPPER_STEPS.map((item, index) => {
            const stateCls = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
            const locked =
              (!mutationsEnabled && (item.id === 'Apply' || item.id === 'Rollback')) ||
              (item.id === 'Rollback' && !snapshot?.canRollback);
            return (
              <li
                key={item.id}
                className={`technik-stepper__item technik-stepper__item--${stateCls}`}
              >
                <button
                  type="button"
                  className="technik-stepper__btn"
                  disabled={locked && (item.id === 'Apply' || item.id === 'Rollback')}
                  onClick={() => setStep(item.id)}
                >
                  <span className="technik-stepper__idx">{index + 1}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="technik-row" style={{ marginTop: '0.85rem' }}>
          <button type="button" onClick={() => setStep('Draft')} disabled={busy}>
            Szkic
          </button>
          <button type="button" onClick={() => void runValidate()} disabled={busy}>
            Sprawdź
          </button>
          <button type="button" onClick={() => void runPreview()} disabled={busy}>
            Zobacz co się zmieni
          </button>
          <button type="button" onClick={() => void runApply()} disabled={!canApply}>
            {busy ? '…' : 'Zapisz i włącz'}
          </button>
          <button type="button" onClick={() => setStep('Audit')} disabled={busy}>
            Historia
          </button>
          <button type="button" onClick={() => void runRollback()} disabled={!canRollback}>
            Cofnij ostatnią zmianę
          </button>
          <button type="button" onClick={() => void load()} disabled={busy}>
            Odśwież
          </button>
        </div>
        <p className="technik-muted" style={{ marginTop: '0.65rem' }}>
          Wersja: <code>{snapshot?.revision ?? '—'}</code>
          {snapshot?.hasDraft ? ' · szkic' : ''}
          {snapshot?.canRollback ? ' · można cofnąć' : ''}
          {lastAction ? ` · ${lastAction}` : ''}
        </p>
        <p className="technik-meta">
          Bramka: <code>{gatewayLabel || '—'}</code>
        </p>
        {actionError ? (
          <p className="technik-muted" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      {step === 'Validate' || step === 'Preview' || step === 'Apply' || step === 'Rollback' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>
            {step === 'Validate' && 'Wynik sprawdzania'}
            {step === 'Preview' && 'Co się zmieni'}
            {step === 'Apply' && 'Zapisano'}
            {step === 'Rollback' && 'Cofnięto'}
          </h2>
          {step === 'Validate' ? (
            <ul className="technik-message-list">
              {validationMessages.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
          {step === 'Preview' ? (
            previewText ? (
              <code className="technik-code technik-code--tall">{previewText}</code>
            ) : (
              <p className="technik-muted">Kliknij „Zobacz co się zmieni”.</p>
            )
          ) : null}
          {(step === 'Apply' || step === 'Rollback') && snapshot ? (
            <code className="technik-code technik-code--tall">{pretty(snapshot)}</code>
          ) : null}
        </section>
      ) : null}

      {step === 'Audit' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Historia</h2>
          {snapshot ? (
            <code className="technik-code">
              {pretty({
                revision: snapshot.revision,
                updatedAt: snapshot.updatedAt,
                hasDraft: snapshot.hasDraft,
                canRollback: snapshot.canRollback,
              })}
            </code>
          ) : (
            <p className="technik-muted">Brak danych.</p>
          )}
        </section>
      ) : null}

      <section className="technik-panel" style={{ marginTop: '1rem' }}>
        <h2>Odbiorca testowej PW</h2>
        <p className="technik-help">
          Zostaw puste = pierwszy ID z <code>DISCORD_TEST_OPERATOR_IDS</code> na bramce. Albo wpisz
          swój Discord User ID.
        </p>
        <label className="technik-field">
          <span>Discord User ID (opcjonalnie)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="np. 123456789012345678"
            value={testUserId}
            onChange={(e) => setTestUserId(e.target.value)}
          />
        </label>
        {testDmMsg ? (
          <p className="technik-muted" role="status" style={{ marginTop: '0.5rem' }}>
            {testDmMsg}
          </p>
        ) : null}
      </section>

      <div className="technik-panel-grid technik-panel-grid--status" style={{ marginTop: '1rem' }}>
        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">
            {timersApiKey}
            {hasCharacterTimersCap ? ' + characterTimers' : ''}
          </span>
          <h2>Timery postaci (PW)</h2>
          <p className="technik-help">
            Przypomnienia o timerach postaci (np. Księga). To nie są metiny na mapie. Działa globalnie;
            per-Discord włączasz powyżej w module „Timery postaci”.
          </p>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={notifyTimerEnabled}
                onChange={(e) => setNotifyTimerEnabled(e.target.checked)}
              />
              Przyjmuj powiadomienia z WWW (notify/timer)
            </label>
          </div>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={charTimers.enabled}
                onChange={(e) => setCharTimers((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Włącz moduł timerów postaci
            </label>
          </div>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={charTimers.resetNotifyEnabled}
                onChange={(e) =>
                  setCharTimers((prev) => ({ ...prev, resetNotifyEnabled: e.target.checked }))
                }
              />
              PW po resecie / potwierdzeniu
            </label>
          </div>

          <label className="technik-field">
            <span>Ile minut przed resetem przypomnieć</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={charTimers.reminderMinutesBefore}
              onChange={(e) =>
                setCharTimers((prev) => ({
                  ...prev,
                  reminderMinutesBefore: Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="technik-field">
            <span>Treść wiadomości (duży szablon)</span>
            <textarea
              className="technik-textarea--large"
              rows={12}
              value={charTimers.messageTemplate}
              onChange={(e) =>
                setCharTimers((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
            <span className="technik-help">
              Placeholdery: {'{{title}}'}, {'{{body}}'}, {'{{otherTimersSummary}}'},{' '}
              {'{{deepLinkUrl}}'}.
            </span>
          </label>

          <div className="technik-row" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              disabled={busy || !mutationsEnabled}
              onClick={() => void runTestDm('characterTimers')}
            >
              Wyślij testową PW (timery)
            </button>
          </div>
        </section>

        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">kingdomWar</span>
          <h2>Wojna królestw (PW)</h2>
          <p className="technik-help">
            Domyślnie wojna 18:00, ping 30 min wcześniej → 17:30 (Warszawa). Per-Discord włączasz
            powyżej w module „Wojna królestw”.
          </p>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={warDraft.enabled}
                onChange={(e) => setWarDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Włącz przypomnienie o wojnie
            </label>
          </div>

          <label className="technik-field">
            <span>Godzina wojny (Warszawa)</span>
            <input
              type="time"
              value={warDraft.warAt}
              onChange={(e) => setWarDraft((prev) => ({ ...prev, warAt: e.target.value }))}
            />
          </label>

          <label className="technik-field">
            <span>Ile minut wcześniej</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={warDraft.notifyMinutesBefore}
              onChange={(e) =>
                setWarDraft((prev) => ({
                  ...prev,
                  notifyMinutesBefore: Number(e.target.value),
                }))
              }
            />
            <span className="technik-help">
              {warNotifyAt
                ? `Ping o ${warNotifyAt} (Warszawa).`
                : 'Ustaw godzinę i minuty, żeby zobaczyć godzinę pingu.'}
            </span>
          </label>

          <label className="technik-field">
            <span>Treść wiadomości (duży szablon)</span>
            <textarea
              className="technik-textarea--large"
              rows={12}
              value={warDraft.messageTemplate}
              onChange={(e) =>
                setWarDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
            <span className="technik-help">
              Placeholdery: {'{{warAt}}'}, {'{{notifyMinutesBefore}}'}.
            </span>
          </label>

          <div className="technik-row" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              disabled={busy || !mutationsEnabled}
              onClick={() => void runTestDm('kingdomWar')}
            >
              Wyślij testową PW (wojna)
            </button>
          </div>
        </section>
      </div>

      {hasPanelTestCap ? (
        <section className="technik-panel" style={{ marginTop: '1rem' }}>
          <span className="technik-pill technik-pill--live">panel-test-enabled</span>
          <h2>Panel lab Discord</h2>
          <label className="technik-check">
            <input
              type="checkbox"
              checked={panelTestEnabled}
              onChange={(e) => setPanelTestEnabled(e.target.checked)}
            />
            Włącz komendę /panel-test (lab)
          </label>
          <p className="technik-help">
            Globalny przełącznik paneli z OpenAPI. Per-Discord flaga „Panele” jest w sekcji guildii.
          </p>
        </section>
      ) : null}

      {isolationDisplay !== undefined ? (
        <p className="technik-muted" style={{ marginTop: '0.75rem' }}>
          Izolacja guildii (tylko podgląd):{' '}
          <strong>{isolationDisplay ? 'włączona' : 'wyłączona'}</strong>
        </p>
      ) : null}

      <p className="technik-help" style={{ marginTop: '1rem' }}>
        Tokeny, sekrety i allowlista — poza Techniką (Owner). Bez atrap: jeśli API guildii nie
        odpowie, lista się nie pojawia.
      </p>
    </>
  );
}
