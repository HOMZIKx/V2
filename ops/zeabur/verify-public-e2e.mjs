import fs from 'node:fs';

const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
fs.mkdirSync(outDir, { recursive: true });

const base = 'https://desapp.zeabur.app';

async function readJson(url, init = {}) {
  const response = await fetch(url, { ...init, redirect: init.redirect ?? 'follow' });
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function write(result, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  fs.writeFileSync(`${outDir}/summary.md`, `# Public production E2E probe\n\n- Web/Identity health: **${result.health?.status ?? 'n/a'}**\n- Identity unauthenticated /me: **${result.identityMe?.status ?? 'n/a'}**\n- Discord OAuth redirect host: **${result.oauth?.locationHost ?? 'n/a'}**\n- Discord gateway ready: **${result.discord?.state ?? 'n/a'}**\n- Member activity members: **${result.memberActivity?.totalMembers ?? 'n/a'}**\n- Member activity messages: **${result.memberActivity?.messageCount ?? 'n/a'}**\n- Member activity voice minutes: **${result.memberActivity?.voiceMinutes ?? 'n/a'}**\n`);
  process.exit(code);
}

try {
  const health = await readJson(`${base}/health/live`, { cache: 'no-store' });
  const me = await readJson(`${base}/identity/me`, { cache: 'no-store', redirect: 'manual' });

  const webBridge = `${base}/identity/web-bridge?to=${encodeURIComponent(base)}`;
  const oauthStart = `${base}/identity/web-oauth/discord?returnTo=${encodeURIComponent(webBridge)}`;
  const oauthResponse = await fetch(oauthStart, { redirect: 'manual', cache: 'no-store' });
  const location = oauthResponse.headers.get('location') || '';
  let locationHost = null;
  try { locationHost = new URL(location, base).hostname; } catch {}

  const discord = await readJson(`${base}/discord-gateway/health/discord`, { cache: 'no-store' });
  const ranking = await readJson(`${base}/discord-gateway/discord/v1/member-activity/ranking?window=since_bot&topN=500`, { cache: 'no-store' });
  const entries = Array.isArray(ranking.body?.entries) ? ranking.body.entries : [];
  const messageCount = entries.reduce((sum, row) => sum + (Number(row?.messageCount) || 0), 0);
  const voiceMinutes = entries.reduce((sum, row) => sum + (Number(row?.voiceMinutes) || 0), 0);

  const result = {
    ok: health.response.ok && [401, 403].includes(me.response.status) && oauthResponse.status >= 300 && oauthResponse.status < 400 && /(^|\.)discord(app)?\.com$/i.test(locationHost || '') && discord.response.ok && discord.body?.enabled === true && discord.body?.state === 'ready' && ranking.response.ok,
    at: new Date().toISOString(),
    health: { status: health.response.status, ok: health.response.ok },
    identityMe: { status: me.response.status, unauthenticatedAsExpected: [401, 403].includes(me.response.status) },
    oauth: {
      status: oauthResponse.status,
      locationHost,
      setCookiePresent: oauthResponse.headers.has('set-cookie'),
    },
    discord: {
      status: discord.response.status,
      enabled: discord.body?.enabled === true,
      state: discord.body?.state ?? null,
      isolationOk: discord.body?.isolationOk ?? null,
      joinedGuildCount: Number(discord.body?.joinedGuildCount) || 0,
      guildCacheSize: Number(discord.body?.guildCacheSize) || 0,
      commandsRegistered: discord.body?.commandsRegistered ?? null,
      lastErrorPresent: Boolean(discord.body?.lastError),
    },
    memberActivity: {
      status: ranking.response.status,
      ok: ranking.response.ok,
      collectorStartedAt: ranking.body?.collectorStartedAt ?? null,
      totalMembers: Number(ranking.body?.totalMembers) || 0,
      messageCount,
      voiceMinutes,
      window: ranking.body?.window ?? null,
      fromDayInclusive: ranking.body?.fromDayInclusive ?? null,
      toDayInclusive: ranking.body?.toDayInclusive ?? null,
    },
  };
  write(result, result.ok ? 0 : 1);
} catch (error) {
  write({ ok: false, at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }, 1);
}
