import { createHash } from 'node:crypto';
import fs from 'node:fs';

const API = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const projectId = '6a720a3e472e2c91a9e660d5';
const environmentId = '6a720a3e5f062718bc7b3421';
const notifyUrl = 'https://desapp.zeabur.app/api/discord-notify';

fs.mkdirSync(outDir, { recursive: true });

function finish(result, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  fs.writeFileSync(
    `${outDir}/summary.md`,
    `# Character timer live DM proof\n\n- HTTP: **${result.status ?? 'n/a'}**\n- Delivery: **${result.delivery ?? 'n/a'}**\n- Message ID present: **${String(result.messageIdPresent ?? false)}**\n- Skipped: **${result.skipped ?? 'none'}**\n- Operator fingerprint: \`${result.operatorFingerprint ?? 'n/a'}\`\n`,
  );
  process.exit(code);
}

async function gql(query, variables) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(body.errors?.map((item) => item.message).join('; ') || `Zeabur HTTP ${response.status}`);
  }
  return body.data;
}

try {
  const command = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
  if (command.confirm !== 'DISCORD_TEST_DM_APPROVED') {
    finish({ ok: false, error: 'missing DISCORD_TEST_DM_APPROVED confirmation' }, 1);
  }
  if (!token) {
    finish({ ok: false, error: "GitHub secret 'zebur' is missing" }, 1);
  }

  const query = `query Operator($projectID:ObjectID!,$environmentID:ObjectID!){services(projectID:$projectID){edges{node{name variables(environmentID:$environmentID){key value}}}}}`;
  const data = await gql(query, { projectID: projectId, environmentID: environmentId });
  const gateway = data.services.edges.map((edge) => edge.node).find((service) => service.name === 'discord-gateway');
  if (!gateway) throw new Error('discord-gateway service not found');

  const operatorRaw = gateway.variables?.find((item) => item.key === 'DISCORD_TEST_OPERATOR_IDS')?.value || '';
  const operatorId = String(operatorRaw)
    .split(',')
    .map((value) => value.trim())
    .find((value) => /^\d{17,20}$/.test(value));
  if (!operatorId) throw new Error('no configured Discord test operator');

  const operatorFingerprint = createHash('sha256').update(operatorId).digest('hex').slice(0, 10);
  const idempotencyKey = `technika-live-dm-proof:${Date.now()}`;
  const response = await fetch(notifyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'timer',
      discordUserId: operatorId,
      title: 'E2E Technika · live timer',
      body: 'Test produkcyjnej ścieżki live DM po wdrożeniu poprawki szablonu timerów postaci.',
      deepLinkUrl: 'https://desapp.zeabur.app/technik/timery',
      workspaceId: 'e2e-technika',
      characterId: 'e2e-character',
      characterName: 'E2E Technika',
      timerId: 'e2e-template-proof',
      timerLabel: 'Test szablonu live DM',
      kind: 'manual',
      includeButtons: false,
      idempotencyKey,
    }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {}

  const ok =
    response.ok &&
    body?.ok === true &&
    body?.delivery === 'dm' &&
    typeof body?.messageId === 'string' &&
    body.messageId.length > 0 &&
    body?.skipped === undefined;

  finish(
    {
      ok,
      at: new Date().toISOString(),
      status: response.status,
      delivery: body?.delivery ?? null,
      duplicate: body?.duplicate === true,
      messageIdPresent: typeof body?.messageId === 'string' && body.messageId.length > 0,
      skipped: body?.skipped ?? null,
      operatorFingerprint,
      error: ok ? null : body?.error ?? null,
    },
    ok ? 0 : 1,
  );
} catch (error) {
  finish(
    {
      ok: false,
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    },
    1,
  );
}
