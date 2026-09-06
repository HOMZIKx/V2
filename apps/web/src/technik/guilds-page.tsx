'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { D060Controls } from './d060-controls';
import {
  DEFAULT_GUILD_MODULES,
  DEFAULT_GUILD_RIGHTS,
  GUILD_MODULE_KEYS,
  GUILD_RIGHTS,
  TECHNIK_TEST_GUILD_ID,
  type GuildModules,
  type GuildRight,
  type TechnikaGuildDto,
  fetchGuilds,
  guildDisplayLabel,
  isTechnikGuildEditable,
  pickDefaultGuildId,
  putGuild,
  sortGuildsForTechnik,
} from './technika-config-api';
import { HonestGap, PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

const MODULE_META: Record<
  (typeof GUILD_MODULE_KEYS)[number],
  { title: string; help: string; player: string }
> = {
  characterTimers: {
    title: 'Timery postaci',
    help: 'PW o Księdze, Kamieniu, Dowodzeniu… (nie metiny na mapie).',
    player: 'Gracz dostaje prywatną wiadomość z timerem postaci i przyciskami Gotowe / Przypomnij później.',
  },
  kingdomWar: {
    title: 'Wojna królestw',
    help: 'PW przed wojną + limit claimów postaci.',
    player: 'Gracz dostaje PW przed wojną z możliwością zajęcia postaci (claim).',
  },
  panels: {
    title: 'Panele Discord',
    help: 'Zapis w config działa; runtime lab honoruje panel-test na guildii.',
    player: 'Na kanale guildii może pojawić się panel lab (/panel-test), jeśli włączysz też lab globalnie.',
  },
  channels: {
    title: 'Kanały / publikacja',
    help: 'Flaga w config (egzekucja hubów Centrum = później).',
    player: 'Na razie nie zmienia samodzielnie tego, co gracz widzi — zapisujesz intencję w config.',
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

function sourceLabel(source: TechnikaGuildDto['source']): string {
  if (source === 'both') return 'w config + bot online';
  if (source === 'configured') return 'tylko w config';
  if (source === 'discovered') return 'bot widzi (jeszcze bez config)';
  return '—';
}

export function TechnikGuildsPage() {
  const cfg = useTechnikaConfig();
  const [guilds, setGuilds] = useState<TechnikaGuildDto[]>([]);
  const [guildsRevision, setGuildsRevision] = useState<number | null>(null);
  const [guildsBotReady, setGuildsBotReady] = useState<boolean | null>(null);
  const [guildsError, setGuildsError] = useState<string | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [guildEdit, setGuildEdit] = useState<GuildEditState | null>(null);
  const [guildSaveMsg, setGuildSaveMsg] = useState<string | null>(null);

  const orderedGuilds = useMemo(() => sortGuildsForTechnik(guilds), [guilds]);
  const selectedGuild = useMemo(
    () => orderedGuilds.find((g) => g.id === selectedGuildId) ?? null,
    [orderedGuilds, selectedGuildId],
  );
  const guildEditable = Boolean(selectedGuildId && isTechnikGuildEditable(selectedGuildId));

  const loadGuilds = useCallback(async (preferId?: string | null) => {
    setGuildsError(null);
    const res = await fetchGuilds();
    if (!res.ok) {
      setGuilds([]);
      setGuildsRevision(null);
      setGuildsBotReady(null);
      setSelectedGuildId(null);
      setGuildEdit(null);
      const unreachable = res.error === 'gateway_unreachable' || res.error === 'network_error';
      setGuildsError(
        unreachable
          ? 'Brak połączenia z bramką Discord (' +
              res.error +
              ')' +
              (res.detail ? ' — ' + res.detail : '') +
              '. Uruchom discord-gateway albo sprawdź DISCORD_GATEWAY_BASE_URL.'
          : 'Nie udało się pobrać listy Discordów: ' +
              res.error +
              (res.detail ? ' — ' + res.detail : ''),
      );
      return;
    }
    const sorted = sortGuildsForTechnik(res.data.guilds);
    setGuilds(sorted);
    setGuildsRevision(res.data.revision);
    setGuildsBotReady(typeof res.data.botReady === 'boolean' ? res.data.botReady : null);
    const keep = pickDefaultGuildId(sorted, preferId);
    setSelectedGuildId(keep);
    const pick = sorted.find((g) => g.id === keep);
    setGuildEdit(pick ? toEditState(pick) : null);
  }, []);

  useEffect(() => {
    void loadGuilds(null);
  }, [loadGuilds]);

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
    if (!cfg.mutationsEnabled) {
      setGuildSaveMsg(
        'Zapis zablokowany — na serwerze web brakuje DISCORD_TECHNIKA_SHARED_SECRET (nie NEXT_PUBLIC_).',
      );
      return;
    }
    if (!isTechnikGuildEditable(selectedGuildId)) {
      setGuildSaveMsg(
        'HARD STOP: tylko Testowy może mieć włączony ruch. Destiled / Projekt Sojusz — tylko podgląd.',
      );
      return;
    }
    cfg.setBusy(true);
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
        const issues = (res.issues ?? []).map((i) => i.path + ': ' + i.message).join('; ');
        setGuildSaveMsg(
          'Nie zapisano szkicu guildii: ' +
            res.error +
            (res.detail ? ' — ' + res.detail : '') +
            (issues ? ' (' + issues + ')' : ''),
        );
        return;
      }
      setGuildSaveMsg(
        'Zapisano szkic Discorda „' +
          guildDisplayLabel(res.data.guild) +
          '”. To jeszcze NIE działa na produkcji — użyj Sprawdź → Zobacz → Zapisz i włącz.',
      );
      cfg.setLastAction('szkic guildii ' + res.data.guild.id);
      cfg.setSnapshot((prev) =>
        prev ? { ...prev, hasDraft: true, revision: res.data.revision } : prev,
      );
      await loadGuilds(selectedGuildId);
    } finally {
      cfg.setBusy(false);
    }
  };

  return (
    <>
      <h1>Discordy / guildie</h1>
      <p className="technik-lead">
        Najpierw wybierz serwer. <strong>Tylko Testowy</strong> (
        <code>{TECHNIK_TEST_GUILD_ID}</code>) może mieć włączony ruch bota. Destiled i Projekt Sojusz
        są na liście, ale zablokowane przed enable.
      </p>

      
      <PageJobNote>
        <p>
          Wybierasz serwer Discord (Testowy vs prod) i włączasz moduły bota per guildia. Publish na
          Destiled/Sojusz zostaje zablokowany do Twojego Apply.
        </p>
      </PageJobNote>
<PlayerSeesNote>
        <p>
          Gdy guildia jest włączona i moduł timerów/wojny jest ON + po Apply: członkowie tej guildii
          mogą dostać PW od bota. Wyłączona guildia = bot milczy dla tego serwera.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Lista Discordów</h2>
          <span
            className={
              guildsError ? 'technik-pill technik-pill--pending' : 'technik-pill technik-pill--live'
            }
          >
            {guildsError
              ? 'API niedostępne'
              : guildsBotReady === false
                ? 'lista z config (bot offline)'
                : 'GUILDS LIVE'}
          </span>
        </div>

        {guildsError ? (
          <div className="technik-error" role="alert" style={{ marginTop: '0.75rem' }}>
            <p>
              <strong>Bez atrapy listy.</strong> {guildsError}
            </p>
            <div className="technik-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={() => void loadGuilds(selectedGuildId)} disabled={cfg.busy}>
                Spróbuj ponownie
              </button>
            </div>
          </div>
        ) : orderedGuilds.length === 0 ? (
          <HonestGap>
            <p>
              API zwróciło pustą listę. Gdy bot jest online albo masz wpisy w config /{' '}
              <code>DISCORD_TEST_GUILD_ID</code>, pojawią się tutaj.
            </p>
          </HonestGap>
        ) : (
          <div className="technik-guild-layout" style={{ marginTop: '0.85rem' }}>
            <ul className="technik-guild-list" aria-label="Lista Discordów">
              {orderedGuilds.map((g, index) => {
                const label = guildDisplayLabel(g);
                const active = g.id === selectedGuildId;
                const editable = isTechnikGuildEditable(g.id);
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
                          {editable ? 'edytowalny · ' : 'ZABLOKOWANY · '}
                          {g.enabled ? 'włączony' : 'wyłączony'} · {sourceLabel(g.source)} ·{' '}
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
                  {guildsRevision !== null ? ' · rev ' + String(guildsRevision) : ''}
                </p>
                {!guildEditable ? (
                  <p className="technik-error" role="alert" style={{ marginTop: '0.5rem' }}>
                    HARD STOP: produkcyjne Discordy (Destiled / Projekt Sojusz) — tylko podgląd. Nie
                    włączaj ruchu ani nie zapisuj modułów.
                  </p>
                ) : (
                  <p className="technik-help" style={{ marginTop: '0.5rem' }}>
                    To jest Twój serwer testowy — tu możesz włączać ruch bota bezpiecznie.
                  </p>
                )}

                <label className="technik-check" style={{ marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={guildEdit.enabled}
                    disabled={!guildEditable}
                    onChange={(e) =>
                      setGuildEdit((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))
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
                    disabled={!guildEditable}
                    placeholder="np. DESTILED TEST"
                    onChange={(e) =>
                      setGuildEdit((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                    }
                  />
                </label>

                <fieldset className="technik-fieldset" style={{ marginTop: '0.85rem' }}>
                  <legend>Funkcje na tym Discordzie</legend>
                  {GUILD_MODULE_KEYS.map((key) => (
                    <label key={key} className="technik-check technik-check--block">
                      <input
                        type="checkbox"
                        checked={guildEdit.modules[key]}
                        disabled={!guildEditable}
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
                        <span className="technik-help">{MODULE_META[key].player}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="technik-fieldset" style={{ marginTop: '0.85rem' }}>
                  <legend>Prawa (OpenAPI)</legend>
                  {GUILD_RIGHTS.map((right) => (
                    <label key={right} className="technik-check">
                      <input
                        type="checkbox"
                        checked={guildEdit.rights.includes(right)}
                        disabled={!guildEditable}
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
                    disabled={cfg.busy || !cfg.canWrite || !guildEditable}
                    onClick={() => void saveGuildDraft()}
                  >
                    {cfg.busy ? '…' : 'Zapisz guildię do szkicu'}
                  </button>
                  <button
                    type="button"
                    className="technik-btn-ghost"
                    disabled={cfg.busy}
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
                    Przycisk zapisuje szkic <code>config.guilds[id]</code>. Produkcja = „Zapisz i
                    włącz” poniżej.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <div style={{ marginTop: '1rem' }}>
        <D060Controls
          step={cfg.step}
          onStep={cfg.setStep}
          snapshot={cfg.snapshot}
          canWrite={cfg.canWrite}
          metaLoaded={cfg.metaLoaded}
          writeBlockReason={cfg.writeBlockReason}
          busy={cfg.busy}
          lastAction={cfg.lastAction}
          gatewayLabel={cfg.gatewayLabel}
          onValidate={() => void cfg.runValidate()}
          onPreview={() => void cfg.runPreview()}
          onApply={() => void cfg.runApply()}
          onRollback={() => void cfg.runRollback()}
          onRefresh={() => {
            void cfg.load();
            void loadGuilds(selectedGuildId);
          }}
        />
      </div>
      {cfg.actionError ? (
        <p className="technik-error" role="alert" style={{ marginTop: '0.75rem' }}>
          {cfg.actionError}
        </p>
      ) : null}
    </>
  );
}
