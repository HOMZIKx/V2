import fs from 'node:fs';

const API = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const serviceID = '6a8211a6bdeaa87e2c52df28';
const environmentID = '6a720a3e5f062718bc7b3421';
const base = 'https://desapp.zeabur.app';
const dataDir = '/data';
const volumeID = 'discord-gateway-data';
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function finish(payload, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(payload, null, 2));
  fs.writeFileSync(
    `${outDir}/summary.md`,
    `# Discord Gateway persistence repair\n\n- Volume mounted: **${payload.volumeMounted ?? false}**\n- Data dir persisted: **${payload.dataDirVerified ?? false}**\n- Technika config restored: **${payload.configRestored ?? false}**\n- Config survived restart: **${payload.configSurvivedRestart ?? false}**\n- Activity metadata survived restart: **${payload.activityMetaSurvivedRestart ?? false}**\n- Discord ready after restart: **${payload.discordReadyAfterRestart ?? false}**\n`,
  );
  process.exit(code);
}

async function gql(query, variables = {}, allowErrors = false) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    if (allowErrors) return { data: body.data ?? null, errors: body.errors ?? [{ message: `HTTP ${response.status}` }] };
    throw new Error(body.errors?.map((e) => e.message).join('; ') || `Zeabur HTTP ${response.status}`);
  }
  return body.data;
}

async function serviceState() {
  return gql(`query State($serviceID:ObjectID!,$environmentID:ObjectID!){service(_id:$serviceID){name status volumes(environmentID:$environmentID){id dir usage limit} variables(environmentID:$environmentID){key value readonly}} deployments(serviceID:$serviceID,environmentID:$environmentID,perPage:2){edges{node{_id status commitSHA createdAt startedAt finishedAt}}}}`, { serviceID, environmentID });
}

async function publicJson(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, redirect: init.redirect ?? 'follow' });
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function same(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

async function waitForNewRunningDeployment(previousID, timeoutMs = 240000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const state = await serviceState();
    const latest = state.deployments?.edges?.[0]?.node ?? null;
    last = { serviceStatus: state.service?.status ?? null, latest };
    if (latest && latest._id !== previousID && latest.status === 'RUNNING' && state.service?.status === 'RUNNING') {
      return { state, latest };
    }
    await sleep(4000);
  }
  throw new Error(`Timed out waiting for new RUNNING discord-gateway deployment: ${JSON.stringify(last)}`);
}

async function restartWithRetry() {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const result = await gql(
      `mutation Restart($serviceID:ObjectID!,$environmentID:ObjectID!){restartService(serviceID:$serviceID,environmentID:$environmentID)}`,
      { serviceID, environmentID },
      true,
    );
    if (!result.errors?.length) return true;
    await sleep(5000);
  }
  throw new Error('Zeabur restartService was not accepted after retries');
}

async function waitPublicReady(timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await publicJson('/discord-gateway/health/ready', { cache: 'no-store' });
      if (health.response.ok && health.body?.discordEnabled === true && health.body?.discordState === 'ready') return true;
    } catch {}
    await sleep(3000);
  }
  return false;
}

async function rankingSnapshot() {
  const ranking = await publicJson('/discord-gateway/discord/v1/member-activity/ranking?window=since_bot&topN=500', { cache: 'no-store' });
  if (!ranking.response.ok) throw new Error(`member activity ranking HTTP ${ranking.response.status}`);
  const entries = Array.isArray(ranking.body?.entries) ? ranking.body.entries : [];
  return {
    collectorStartedAt: ranking.body?.collectorStartedAt ?? null,
    totalMembers: Number(ranking.body?.totalMembers) || 0,
    messageCount: entries.reduce((sum, row) => sum + (Number(row?.messageCount) || 0), 0),
    voiceMinutes: entries.reduce((sum, row) => sum + (Number(row?.voiceMinutes) || 0), 0),
  };
}

try {
  if (!token) throw new Error("GitHub secret 'zebur' is missing");
  const command = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
  if (command.confirm !== 'ZEABUR_WRITE_APPROVED') throw new Error('repair requires ZEABUR_WRITE_APPROVED');

  const beforeState = await serviceState();
  const beforeDeploymentID = beforeState.deployments?.edges?.[0]?.node?._id ?? null;
  const configBeforeResponse = await publicJson('/discord-gateway/discord/v1/config', { cache: 'no-store' });
  if (!configBeforeResponse.response.ok || !configBeforeResponse.body?.config) throw new Error(`Cannot snapshot Technika config (HTTP ${configBeforeResponse.response.status})`);
  const configBefore = configBeforeResponse.body.config;
  const oldRevision = Number(configBeforeResponse.body.revision) || 0;
  const activityEnabled = configBefore?.memberActivity?.enabled === true;
  const activityGuildConfigured = typeof configBefore?.memberActivity?.guildId === 'string' && configBefore.memberActivity.guildId.trim().length > 0;
  const preRepairRanking = await rankingSnapshot();

  const existingVolume = (beforeState.service?.volumes ?? []).find((v) => v.dir === dataDir || v.id === volumeID);
  if (!existingVolume) {
    const mounted = await gql(`mutation Mount($serviceID:ObjectID!,$id:String!,$dir:String!){mountVolume(serviceID:$serviceID,id:$id,dir:$dir)}`, { serviceID, id: volumeID, dir: dataDir });
    if (mounted.mountVolume !== true) throw new Error('mountVolume returned false');
  } else if (existingVolume.dir !== dataDir) {
    throw new Error(`Existing volume ${existingVolume.id} uses unexpected dir ${existingVolume.dir}`);
  }

  const freshAfterMount = await serviceState();
  const manualEntries = (freshAfterMount.service?.variables ?? []).filter((entry) => entry.readonly === false);
  const envMap = {};
  for (const entry of manualEntries) envMap[entry.key] = String(entry.value ?? '');
  envMap.DISCORD_GATEWAY_DATA_DIR = dataDir;
  const envUpdated = await gql(`mutation UpdateEnv($serviceID:ObjectID!,$environmentID:ObjectID!,$data:Map!){updateEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,data:$data)}`, { serviceID, environmentID, data: envMap });
  if (envUpdated.updateEnvironmentVariable !== true) throw new Error('updateEnvironmentVariable returned false');

  await restartWithRetry();
  const firstRunning = await waitForNewRunningDeployment(beforeDeploymentID);
  if (!(await waitPublicReady())) throw new Error('Discord gateway did not become publicly ready after volume cutover');

  const afterCutoverState = await serviceState();
  const volumeMounted = (afterCutoverState.service?.volumes ?? []).some((v) => v.id === volumeID && v.dir === dataDir);
  const dataDirValues = (afterCutoverState.service?.variables ?? []).filter((v) => v.key === 'DISCORD_GATEWAY_DATA_DIR');
  const dataDirVerified = dataDirValues.some((v) => String(v.value ?? '').trim() === dataDir);
  if (!volumeMounted || !dataDirVerified) throw new Error('Volume or DISCORD_GATEWAY_DATA_DIR verification failed');

  const technikaSecret = String((afterCutoverState.service?.variables ?? []).filter((v) => v.key === 'DISCORD_TECHNIKA_SHARED_SECRET').at(-1)?.value ?? '');
  if (!technikaSecret) throw new Error('DISCORD_TECHNIKA_SHARED_SECRET missing');

  const draft = await publicJson('/discord-gateway/discord/v1/config/draft', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-technika-secret': technikaSecret },
    body: JSON.stringify({ config: configBefore }),
  });
  if (!draft.response.ok) throw new Error(`Technika draft restore failed HTTP ${draft.response.status}`);
  const apply = await publicJson('/discord-gateway/discord/v1/config/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-technika-secret': technikaSecret },
    body: '{}',
  });
  if (!apply.response.ok) throw new Error(`Technika apply restore failed HTTP ${apply.response.status}`);

  const restored = await publicJson('/discord-gateway/discord/v1/config', { cache: 'no-store' });
  const configRestored = restored.response.ok && same(restored.body?.config, configBefore);
  if (!configRestored) throw new Error('Technika config differs after restore');

  const rankingBeforeRestart = await rankingSnapshot();
  const deploymentBeforeProofRestart = firstRunning.latest?._id ?? null;
  await restartWithRetry();
  await waitForNewRunningDeployment(deploymentBeforeProofRestart);
  const discordReadyAfterRestart = await waitPublicReady();
  if (!discordReadyAfterRestart) throw new Error('Discord gateway not ready after persistence proof restart');

  const configAfterRestart = await publicJson('/discord-gateway/discord/v1/config', { cache: 'no-store' });
  const configSurvivedRestart = configAfterRestart.response.ok && same(configAfterRestart.body?.config, configBefore);
  const rankingAfterRestart = await rankingSnapshot();
  const activityMetaSurvivedRestart = Boolean(rankingBeforeRestart.collectorStartedAt) && rankingBeforeRestart.collectorStartedAt === rankingAfterRestart.collectorStartedAt;
  const countersSurvivedRestart = rankingBeforeRestart.totalMembers === rankingAfterRestart.totalMembers && rankingBeforeRestart.messageCount === rankingAfterRestart.messageCount && rankingBeforeRestart.voiceMinutes === rankingAfterRestart.voiceMinutes;

  const finalState = await serviceState();
  const finalVolume = (finalState.service?.volumes ?? []).find((v) => v.id === volumeID && v.dir === dataDir) ?? null;

  const ok = volumeMounted && dataDirVerified && configRestored && configSurvivedRestart && activityMetaSurvivedRestart && countersSurvivedRestart && discordReadyAfterRestart && activityEnabled && activityGuildConfigured;
  finish({
    ok,
    at: new Date().toISOString(),
    volumeMounted,
    dataDirVerified,
    volumeUsageBytes: finalVolume?.usage ?? null,
    volumeLimitBytes: finalVolume?.limit ?? null,
    activityEnabled,
    activityGuildConfigured,
    oldTechnikaRevision: oldRevision,
    configRestored,
    configSurvivedRestart,
    activityMetaSurvivedRestart,
    countersSurvivedRestart,
    discordReadyAfterRestart,
    preRepairRanking,
    rankingBeforeRestart,
    rankingAfterRestart,
    finalServiceStatus: finalState.service?.status ?? null,
    finalDeploymentStatus: finalState.deployments?.edges?.[0]?.node?.status ?? null,
  }, ok ? 0 : 1);
} catch (error) {
  finish({ ok: false, at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }, 1);
}
