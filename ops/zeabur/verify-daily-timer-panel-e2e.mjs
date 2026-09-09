import fs from 'node:fs';

const API = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const projectId = '6a720a3e472e2c91a9e660d5';
const environmentId = '6a720a3e5f062718bc7b3421';

fs.mkdirSync(outDir, { recursive: true });

function finish(result, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  const lines = [
    '# Daily character timer panel E2E proof',
    '',
    `- Result: **${result.ok ? 'OK' : 'FAILED'}**`,
    `- Gateway running: **${String(result.gatewayRunning ?? false)}**`,
    `- Config found: **${String(result.configFound ?? false)}**`,
    `- Daily time: **${result.dailyTime ?? 'n/a'}**`,
    `- Recipient count: **${result.recipientCount ?? 'n/a'}**`,
    `- Config HTTP: **${result.configStatus ?? 'n/a'}**`,
    `- Refresh HTTP: **${result.refreshStatus ?? 'n/a'}**`,
    `- Panels sent/updated: **${result.updated ?? 'n/a'}**`,
  ];
  if (result.error) lines.push('', `Error: ${result.error}`);
  fs.writeFileSync(`${outDir}/summary.md`, `${lines.join('\n')}\n`);
  process.exit(code);
}

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(body.errors?.map((entry) => entry.message).join('; ') || `Zeabur HTTP ${response.status}`);
  }
  return body.data;
}

async function postJson(url, secret, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-notify-secret': secret,
    },
    body: JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {}
  return { status: response.status, ok: response.ok, body: parsed };
}

try {
  const command = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
  if (command.confirm !== 'DISCORD_TEST_DM_APPROVED') {
    finish({ ok: false, error: 'missing DISCORD_TEST_DM_APPROVED confirmation' }, 1);
  }
  if (!token) finish({ ok: false, error: 'missing Zeabur API token' }, 1);

  const workspaceId = String(command.workspaceId || '').trim();
  if (!workspaceId) finish({ ok: false, error: 'workspaceId is required' }, 1);

  const data = await gql(
    `query DailyTimerPanelProbe($projectID:ObjectID!,$environmentID:ObjectID!){services(projectID:$projectID){edges{node{name status variables(environmentID:$environmentID){key value} domains(environmentID:$environmentID){domain status}}}}}`,
    { projectID: projectId, environmentID: environmentId },
  );
  const gateway = data.services.edges.map((entry) => entry.node).find((service) => service.name === 'discord-gateway');
  if (!gateway) throw new Error('discord-gateway service not found');

  const secret = String((gateway.variables || []).filter((entry) => entry.key === 'DISCORD_NOTIFY_SHARED_SECRET').at(-1)?.value || '').trim();
  if (secret.length < 20) throw new Error('DISCORD_NOTIFY_SHARED_SECRET is missing or invalid');

  const domain = (gateway.domains || []).find((entry) => entry.status === 'PROVISIONED')?.domain;
  if (!domain) throw new Error('discord-gateway has no provisioned public domain');
  const baseUrl = `https://${domain}`;

  const configResponse = await postJson(
    `${baseUrl}/notify/daily-timer-panel-config/get`,
    secret,
    { workspaceId },
  );
  const config = configResponse.body?.config ?? null;
  const dailyTime = typeof config?.dailyTime === 'string' ? config.dailyTime : null;
  const recipientCount = Array.isArray(config?.recipients) ? config.recipients.length : 0;

  if (!configResponse.ok || !config) {
    finish({
      ok: false,
      gatewayRunning: gateway.status === 'RUNNING',
      configFound: false,
      configStatus: configResponse.status,
      refreshStatus: null,
      updated: null,
      error: configResponse.body?.error || 'daily timer panel config unavailable',
    }, 1);
  }

  const refreshResponse = await postJson(
    `${baseUrl}/notify/daily-timer-panel-refresh`,
    secret,
    { workspaceId },
  );
  const updated = typeof refreshResponse.body?.updated === 'number' ? refreshResponse.body.updated : null;
  const ok = refreshResponse.ok && refreshResponse.body?.ok === true && typeof updated === 'number' && updated > 0;

  finish({
    ok,
    gatewayRunning: gateway.status === 'RUNNING',
    configFound: true,
    dailyTime,
    recipientCount,
    configStatus: configResponse.status,
    refreshStatus: refreshResponse.status,
    updated,
    error: ok ? null : refreshResponse.body?.error || (updated === 0 ? 'no timer panels were sent or updated' : 'timer panel refresh failed'),
  }, ok ? 0 : 1);
} catch (error) {
  finish({ ok: false, error: error instanceof Error ? error.message : String(error) }, 1);
}
