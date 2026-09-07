'use client';

import { useCallback, useEffect, useState } from 'react';

import type { D060StepId } from './d060-controls';
import {
  type BotCapability,
  type BotConfigDraftPartial,
  type CharacterTimersConfig,
  type ConfigSnapshot,
  type KingdomWarConfig,
  DEFAULT_CHARACTER_TIMERS,
  DEFAULT_KINGDOM_WAR,
  fetchActiveConfig,
  fetchCapabilities,
  fetchTechnikaMeta,
  pickCharacterTimers,
  postConfigApply,
  postConfigPreview,
  postConfigRollback,
  postConfigValidate,
  putConfigDraft,
} from './technika-config-api';

function looksLikeSecret(value: string): boolean {
  return /token|secret|password|api[_-]?key|Bearer\s|mongodb(\+srv)?:\/\//i.test(value);
}

const WAR_AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function useTechnikaConfig() {
  const [step, setStep] = useState<D060StepId>('Draft');
  const [charTimers, setCharTimers] = useState<CharacterTimersConfig>(DEFAULT_CHARACTER_TIMERS);
  const [timersApiKey, setTimersApiKey] = useState<'characterTimers' | 'timersNotify'>(
    'characterTimers',
  );
  const [warDraft, setWarDraft] = useState<KingdomWarConfig>(DEFAULT_KINGDOM_WAR);
  const [panelTestEnabled, setPanelTestEnabled] = useState(true);
  const [notifyTimerEnabled, setNotifyTimerEnabled] = useState(true);
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<readonly BotCapability[]>([]);
  const [mutationsEnabled, setMutationsEnabled] = useState(false);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [writeBlockReason, setWriteBlockReason] = useState<string | null>(null);
  const [gatewayLabel, setGatewayLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [previewText, setPreviewText] = useState('');
  const [lastAction, setLastAction] = useState<string | null>(null);

  const hasCharacterTimersCap = capabilities.some((c) => c.id === 'characterTimers');
  const hasPanelTestCap = capabilities.some((c) => c.id === 'panel-test-enabled');
  const canWrite = metaLoaded && mutationsEnabled;
  const isolationDisplay =
    snapshot?.strictGuildIsolation ??
    capabilities.find((c) => c.id === 'strict-guild-isolation')?.currentDisplayValue;

  const load = useCallback(async () => {
    const [meta, active, caps] = await Promise.all([
      fetchTechnikaMeta(),
      fetchActiveConfig(),
      fetchCapabilities(),
    ]);
    if (meta.ok) {
      setMetaLoaded(true);
      setMutationsEnabled(meta.data.mutationsEnabled);
      setGatewayLabel(meta.data.gateway);
      setWriteBlockReason(
        meta.data.mutationsEnabled
          ? null
          : 'Zapis zablokowany — brak DISCORD_TECHNIKA_SHARED_SECRET na WWW (nie NEXT_PUBLIC_). Uzupełnij apps/web/.env.local i zrestartuj Next.',
      );
    } else {
      setMetaLoaded(false);
      setMutationsEnabled(false);
      setWriteBlockReason(
        'Nie udało się sprawdzić uprawnień zapisu: ' +
          meta.error +
          (meta.detail ? ' — ' + meta.detail : '') +
          '. To nie jest automatycznie brak klucza.',
      );
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
        'Nie udało się pobrać ustawień: ' +
          active.error +
          (active.detail ? ' — ' + active.detail : ''),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buildDraftPartial = useCallback((): BotConfigDraftPartial => {
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
  }, [
    warDraft,
    notifyTimerEnabled,
    hasPanelTestCap,
    panelTestEnabled,
    timersApiKey,
    hasCharacterTimersCap,
    charTimers,
  ]);

  const runValidate = useCallback(async () => {
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
    if (
      !Number.isInteger(warDraft.maxClaimsPerUser) ||
      warDraft.maxClaimsPerUser < 1 ||
      warDraft.maxClaimsPerUser > 20
    ) {
      local.push('Wojna: ile postaci max na osobę — podaj liczbę od 1 do 20 (zwykle 3).');
    }
    if (warDraft.enabled && warDraft.messageTemplate.trim().length < 1) {
      local.push('Przypomnienie o wojnie jest włączone — wpisz treść wiadomości.');
    }
    if (looksLikeSecret(warDraft.messageTemplate)) {
      local.push('Treść wiadomości o wojnie wygląda na sekret — usuń tokeny i hasła.');
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
        const issueLines = (draftRes.issues ?? []).map((i) => i.path + ': ' + i.message);
        setValidationMessages([
          ...local,
          'Nie udało się zapisać szkicu: ' + draftRes.error,
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
          'Sprawdzanie nieudane: ' + valRes.error,
          ...(valRes.detail ? [valRes.detail] : []),
          ...(valRes.issues ?? []).map((i) => i.path + ': ' + i.message),
        ]);
        setStep('Validate');
        return;
      }
      const apiIssues = valRes.data.issues.map((i) => i.path + ': ' + i.message);
      setValidationMessages([
        ...local,
        valRes.data.ok ? 'Sprawdzanie: wszystko OK' : 'Sprawdzanie: są błędy',
        ...apiIssues,
      ]);
      setLastAction('zapisano szkic i sprawdzono');
      setStep('Validate');
      setSnapshot((prev) => (prev ? { ...prev, hasDraft: true } : prev));
    } finally {
      setBusy(false);
    }
  }, [charTimers, warDraft, mutationsEnabled, buildDraftPartial]);

  const runPreview = useCallback(async () => {
    setActionError(null);
    if (!mutationsEnabled) {
      setPreviewText(
        JSON.stringify(
          {
            mode: 'local-only',
            warning: 'Brak klucza na serwerze — podgląd tylko lokalny.',
            draft: buildDraftPartial(),
          },
          null,
          2,
        ),
      );
      setStep('Preview');
      return;
    }
    setBusy(true);
    try {
      const res = await postConfigPreview();
      if (!res.ok) {
        setActionError('Podgląd: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        setPreviewText(JSON.stringify(res.body ?? { error: res.error }, null, 2));
      } else {
        setPreviewText(JSON.stringify(res.data, null, 2));
        setLastAction('podgląd zmian');
      }
      setStep('Preview');
    } finally {
      setBusy(false);
    }
  }, [mutationsEnabled, buildDraftPartial]);

  const runApply = useCallback(async () => {
    if (!mutationsEnabled) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await postConfigApply();
      if (!res.ok) {
        setActionError('Zapisz i włącz: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        setStep('Apply');
        return;
      }
      setSnapshot(res.data);
      setLastAction('zapisano i włączono (wersja ' + String(res.data.revision) + ')');
      setStep('Apply');
      await load();
    } finally {
      setBusy(false);
    }
  }, [mutationsEnabled, load]);

  const runRollback = useCallback(async () => {
    if (!mutationsEnabled) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await postConfigRollback();
      if (!res.ok) {
        setActionError('Cofnij: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        setStep('Rollback');
        return;
      }
      setSnapshot(res.data);
      setLastAction('cofnięto do wersji ' + String(res.data.revision));
      setStep('Rollback');
      await load();
    } finally {
      setBusy(false);
    }
  }, [mutationsEnabled, load]);

  return {
    step,
    setStep,
    charTimers,
    setCharTimers,
    timersApiKey,
    warDraft,
    setWarDraft,
    panelTestEnabled,
    setPanelTestEnabled,
    notifyTimerEnabled,
    setNotifyTimerEnabled,
    snapshot,
    setSnapshot,
    capabilities,
    mutationsEnabled,
    metaLoaded,
    writeBlockReason,
    gatewayLabel,
    busy,
    setBusy,
    actionError,
    setActionError,
    validationMessages,
    previewText,
    lastAction,
    setLastAction,
    hasCharacterTimersCap,
    hasPanelTestCap,
    canWrite,
    isolationDisplay,
    load,
    buildDraftPartial,
    runValidate,
    runPreview,
    runApply,
    runRollback,
  };
}
