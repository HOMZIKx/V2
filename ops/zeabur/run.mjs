import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const API_URL = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';

fs.mkdirSync(outDir, { recursive: true });

function fail(message, details = null) {
  const payload = { ok: false, message, details: sanitize(details), at: new Date().toISOString() };
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(payload, null, 2));
  fs.writeFileSync(`${outDir}/summary.md`, `# Zeabur operation\n\n❌ ${message}\n`);
  console.error(`::error::${message}`);
  process.exit(1);
}

function sensitiveKey(key) {
  return /(?:token|secret|password|passwd|private.?key|api.?key|authorization|cookie|credential|dsn|database.?url|redis.?url|connection.?string|value)$/i.test(String(key));
}

function sanitize(value, key = '') {
  if (value == null) return value;
  if (sensitiveKey(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    let text = value;
    if (token) text = text.split(token).join('[REDACTED_TOKEN]');
    text = text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]');
    text = text.replace(/(postgres(?:ql)?|mysql|redis):\/\/[^\s@]+@/gi, '$1://[REDACTED]@');
    text = text.replace(/([A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/g, '[REDACTED_JWT]');
    return text;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, k);
    return out;
  }
  return value;
}

function loadCommand() {
  if (!fs.existsSync(commandPath)) fail(`Missing command file: ${commandPath}`);
  try {
    return JSON.parse(fs.readFileSync(commandPath, 'utf8'));
  } catch (error) {
    fail('Invalid command JSON', String(error));
  }
}

async function gql(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) fail(`Zeabur API HTTP ${response.status}`, body);
  if (body?.errors?.length) fail('Zeabur GraphQL returned errors', body.errors);
  return body?.data ?? body;
}

function assertReadQuery(query) {
  if (typeof query !== 'string' || !query.trim()) fail('graphql_read requires query');
  const trimmed = query.replace(/^\s*(?:#[^\n]*\n\s*)*/g, '').trimStart();
  if (/^mutation\b/i.test(trimmed) || /^subscription\b/i.test(trimmed)) {
    fail('graphql_read only accepts queries');
  }
}

function assertWriteMutation(command) {
  const query = command.query;
  if (typeof query !== 'string' || !/^\s*mutation\b/i.test(query)) fail('graphql_write requires a mutation');
  if (command.confirm !== 'ZEABUR_WRITE_APPROVED') fail('graphql_write requires confirm=ZEABUR_WRITE_APPROVED');

  const destructive = /\b(delete|destroy|remove|purge|drop|terminate|suspend|executeCommand|deployTemplate)\b/i.test(query);
  if (destructive && command.confirmDestructive !== 'DESTILED_DESTRUCTIVE_APPROVED') {
    fail('Destructive Zeabur mutation blocked. Explicit destructive approval is required.');
  }
}

function cli(args, { allowFailure = false } = {}) {
  const result = spawnSync('npx', ['--yes', 'zeabur@latest', ...args], {
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 12 * 1024 * 1024,
  });
  const output = sanitize(`${result.stdout || ''}${result.stderr || ''}`);
  if (result.status !== 0 && !allowFailure) fail(`Zeabur CLI failed: ${args.join(' ')}`, output);
  return { exitCode: result.status, output };
}

function cliLogin() {
  const result = spawnSync('npx', ['--yes', 'zeabur@latest', 'auth', 'login', '--token', token], {
    encoding: 'utf8', env: { ...process.env }, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) fail('Zeabur CLI token login failed', sanitize(`${result.stdout || ''}${result.stderr || ''}`));
}

function buildCliArgs(command) {
  const action = command.action;
  const p = command.projectId;
  const e = command.environmentId;
  const s = command.serviceName;
  switch (action) {
    case 'workspace:list': return ['workspace', 'list'];
    case 'workspace:current': return ['workspace', 'current'];
    case 'project:list': return ['project', 'ls'];
    case 'service:list':
      if (!p) fail('service:list requires projectId');
      return ['-i=false', 'context', 'set', 'project', '--id', p, '&&', 'service', 'ls'];
    case 'deployment:get':
      if (!e || !s) fail('deployment:get requires environmentId and serviceName');
      return ['deployment', 'get', '--env-id', e, '--service-name', s];
    case 'logs:runtime':
      if (!e || !s) fail('logs:runtime requires environmentId and serviceName');
      return ['deployment', 'log', '-t=runtime', '--env-id', e, '--service-name', s];
    case 'logs:build':
      if (!e || !s) fail('logs:build requires environmentId and serviceName');
      return ['deployment', 'log', '-t=build', '--env-id', e, '--service-name', s];
    case 'service:restart':
      if (command.confirm !== 'ZEABUR_WRITE_APPROVED') fail('service:restart requires confirm=ZEABUR_WRITE_APPROVED');
      if (!e || !s) fail('service:restart requires environmentId and serviceName');
      return ['service', 'restart', '--env-id', e, '--service-name', s];
    default: fail(`Unsupported CLI action: ${action}`);
  }
}

async function run() {
  if (!token) fail("GitHub Actions secret 'zebur' is missing or empty");
  const command = loadCommand();
  const mode = command.mode || 'auth';
  const requestId = command.requestId || `zeabur-${Date.now()}`;
  let data;

  if (mode === 'auth') {
    data = await gql('query OpsAuth { me { username } }');
  } else if (mode === 'schema') {
    data = await gql(`query OpsSchema {
      __schema {
        queryType { fields { name args { name type { kind name ofType { kind name } } } } }
        mutationType { fields { name args { name type { kind name ofType { kind name } } } } }
      }
    }`);
  } else if (mode === 'graphql_read') {
    assertReadQuery(command.query);
    data = await gql(command.query, command.variables || {});
  } else if (mode === 'graphql_write') {
    assertWriteMutation(command);
    data = await gql(command.query, command.variables || {});
  } else if (mode === 'cli') {
    cliLogin();
    const args = buildCliArgs(command);
    if (args.includes('&&')) {
      const split = args.indexOf('&&');
      const first = cli(args.slice(0, split));
      const second = cli(args.slice(split + 1));
      data = { first, second };
    } else {
      data = cli(args);
    }
  } else {
    fail(`Unsupported mode: ${mode}`);
  }

  const payload = sanitize({ ok: true, requestId, mode, at: new Date().toISOString(), data });
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(payload, null, 2));
  fs.writeFileSync(`${outDir}/summary.md`, `# Zeabur operation\n\n✅ **${requestId}**\n\nMode: \`${mode}\`\n\nResult saved as workflow artifact.\n`);
  console.log(`::notice::Zeabur operation OK: ${requestId}`);
}

run().catch((error) => fail('Unhandled Zeabur bridge error', error?.stack || String(error)));
