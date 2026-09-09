import fs from 'node:fs';
import { createHash } from 'node:crypto';

const API = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const serviceID = '6a8211a6bdeaa87e2c52df28';
const environmentID = '6a720a3e5f062718bc7b3421';
const base = 'https://desapp.zeabur.app';
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function finish(payload, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(payload, null, 2));
  fs.writeFileSync(`${outDir}/summary.md`, `# Discord persistence restart proof\n\n- Persistent volume: **${payload.volumeReady ?? false}**\n- Data dir /data: **${payload.dataDirReady ?? false}**\n- Activity collector enabled: **${payload.activityEnabled ?? false}**\n- Restart observed: **${payload.restartObserved ?? false}**\n- Config survived: **${payload.configSurvived ?? false}**\n- Collector metadata survived: **${payload.collectorMetaSurvived ?? false}**\n- Counters did not regress: **${payload.countersSurvived ?? false}**\n- Discord ready: **${payload.discordReady ?? false}**\n`);
  process.exit(code);
}

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map((e) => e.message).join('; ') || `Zeabur HTTP ${response.status}`);
  return body.data;
}

async function serviceState() {
  return gql(`query State($serviceID:ObjectID!,$environmentID:ObjectID!){service(_id:$serviceID){name status volumes(environmentID:$environmentID){id dir usage limit} variables(environmentID:$environmentID){key value readonly}}}`, { serviceID, environmentID });
}

async function publicJson(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, redirect: init.redirect ?? 'follow' });
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function configHash(config) {
  return createHash('sha256').update(JSON.stringify(canonical(config))).digest('hex');
}

async function snapshot() {
  const [config, ranking, discord] = await Promise.all([
    publicJson('/discord-gateway/discord/v1/config', { cache: 'no-store' }),
    publicJson('/discord-gateway/discord/v1/member-activity/ranking?window=since_bot&topN=500', { cache: 'no-store' }),
    publicJson('/discord-gateway/health/discord', { cache: 'no-store' }),
  ]);
  if (!config.response.ok || !config.body?.config) throw new Error(`config HTTP ${config.response.status}`);
  if (!ranking.response.ok) throw new Error(`ranking HTTP ${ranking.response.status}`);
  if (!discord.response.ok) throw new Error(`discord health HTTP ${discord.response.status}`);
  const entries = Array.isArray(ranking.body?.entries) ? ranking.body.entries : [];
  return {
    configHash: configHash(config.body.config),
    revision: Number(config.body.revision) || 0,
    activityEnabled: config.body.config?.memberActivity?.enabled === true,
    activityGuildConfigured: typeof config.body.config?.memberActivity?.guildId === 'string' && config.body.config.memberActivity.guildId.trim().length > 0,
    collectorStartedAt: ranking.body?.collectorStartedAt ?? null,
    totalMembers: Number(ranking.body?.totalMembers) || 0,
    messageCount: entries.reduce((sum, row) => sum + (Number(row?.messageCount) || 0), 0),
    voiceMinutes: entries.reduce((sum, row) => sum + (Number(row?.voiceMinutes) || 0), 0),
    discordState: discord.body?.state ?? null,
    discordEnabled: discord.body?.enabled === true,
    isolationOk: discord.body?.isolationOk === true,
    uptimeSeconds: Number(discord.body?.uptimeSeconds) || 0,
    lastErrorPresent: Boolean(discord.body?.lastError),
  };
}

try {
  if (!token) throw new Error("GitHub secret 'zebur' is missing");
  const command = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
  if (command.confirm !== 'ZEABUR_WRITE_APPROVED') throw new Error('proof restart requires ZEABUR_WRITE_APPROVED');

  const state = await serviceState();
  const volume = (state.service?.volumes ?? []).find((v) => v.id === 'discord-gateway-data' && v.dir === '/data') ?? null;
  const dataDirReady = (state.service?.variables ?? []).some((v) => v.key === 'DISCORD_GATEWAY_DATA_DIR' && String(v.value ?? '').trim() === '/data');
  const volumeReady = Boolean(volume);
  if (!volumeReady || !dataDirReady) throw new Error('persistent Discord volume/data dir is not configured');

  const before = await snapshot();
  if (!before.activityEnabled || !before.activityGuildConfigured) throw new Error('member activity collector is not enabled/configured');
  if (before.discordState !== 'ready' || !before.discordEnabled || !before.isolationOk || before.lastErrorPresent) throw new Error('Discord gateway is not healthy before proof restart');

  const restart = await gql(`mutation Restart($serviceID:ObjectID!,$environmentID:ObjectID!){restartService(serviceID:$serviceID,environmentID:$environmentID)}`, { serviceID, environmentID });
  if (restart.restartService !== true) throw new Error('restartService returned false');

  let observedUnavailable = false;
  let after = null;
  let restartObserved = false;
  const deadline = Date.now() + 180000;
  await sleep(1500);
  while (Date.now() < deadline) {
    try {
      const probe = await publicJson('/discord-gateway/health/discord', { cache: 'no-store' });
      if (!probe.response.ok) {
        observedUnavailable = true;
      } else {
        const uptime = Number(probe.body?.uptimeSeconds) || 0;
        const ready = probe.body?.enabled === true && probe.body?.state === 'ready' && probe.body?.isolationOk === true && !probe.body?.lastError;
        if (uptime + 5 < before.uptimeSeconds) restartObserved = true;
        if ((restartObserved || observedUnavailable) && ready) {
          after = await snapshot();
          break;
        }
      }
    } catch {
      observedUnavailable = true;
    }
    await sleep(2000);
  }
  if (!after) throw new Error(`restart proof timeout; before uptime=${before.uptimeSeconds}, observedUnavailable=${observedUnavailable}`);

  const configSurvived = before.configHash === after.configHash;
  const collectorMetaSurvived = Boolean(before.collectorStartedAt) && before.collectorStartedAt === after.collectorStartedAt;
  // Live Discord activity can legitimately increase while the gateway is restarting.
  // Persistence is proven when accumulated values never go backwards.
  const countersSurvived =
    after.totalMembers >= before.totalMembers &&
    after.messageCount >= before.messageCount &&
    after.voiceMinutes >= before.voiceMinutes;
  const discordReady = after.discordState === 'ready' && after.discordEnabled && after.isolationOk && !after.lastErrorPresent;
  const finalState = await serviceState();
  const stillMounted = (finalState.service?.volumes ?? []).some((v) => v.id === 'discord-gateway-data' && v.dir === '/data');
  const stillDataDir = (finalState.service?.variables ?? []).some((v) => v.key === 'DISCORD_GATEWAY_DATA_DIR' && String(v.value ?? '').trim() === '/data');
  const ok = volumeReady && dataDirReady && restartObserved && configSurvived && collectorMetaSurvived && countersSurvived && discordReady && stillMounted && stillDataDir;

  finish({
    ok,
    at: new Date().toISOString(),
    volumeReady: stillMounted,
    dataDirReady: stillDataDir,
    volumeUsageBytes: volume?.usage ?? null,
    activityEnabled: before.activityEnabled,
    activityGuildConfigured: before.activityGuildConfigured,
    restartObserved,
    observedUnavailable,
    configSurvived,
    collectorMetaSurvived,
    countersSurvived,
    discordReady,
    before: {
      revision: before.revision,
      configHash: before.configHash,
      collectorStartedAt: before.collectorStartedAt,
      totalMembers: before.totalMembers,
      messageCount: before.messageCount,
      voiceMinutes: before.voiceMinutes,
      uptimeSeconds: before.uptimeSeconds,
    },
    after: {
      revision: after.revision,
      configHash: after.configHash,
      collectorStartedAt: after.collectorStartedAt,
      totalMembers: after.totalMembers,
      messageCount: after.messageCount,
      voiceMinutes: after.voiceMinutes,
      uptimeSeconds: after.uptimeSeconds,
    },
  }, ok ? 0 : 1);
} catch (error) {
  finish({ ok: false, at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }, 1);
}
