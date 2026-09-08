import fs from 'node:fs';
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';

const API = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const out = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const projectId = '6a720a3e472e2c91a9e660d5';
const environmentId = '6a720a3e5f062718bc7b3421';
const serviceName = 'webapp-dest';
const tempKeyName = 'OPS_SECRET_BRIDGE_PRIVATE_KEY';
const allowedSecretKeys = new Set(['GEMINI_API_KEY']);
fs.mkdirSync(out, { recursive: true });

function finish(payload, code = 0) {
  fs.writeFileSync(`${out}/result.json`, JSON.stringify(payload, null, 2));
  const lines = [
    '# Zeabur encrypted secret bridge',
    '',
    payload.ok ? '✅ Completed' : '❌ Failed',
    '',
    `Phase: \`${payload.phase || 'unknown'}\``,
  ];
  if (payload.actions?.length) {
    lines.push('', 'Actions:');
    for (const action of payload.actions) lines.push(`- ${action}`);
  }
  if (payload.error) lines.push('', `Error: ${payload.error}`);
  fs.writeFileSync(`${out}/summary.md`, `${lines.join('\n')}\n`);
  process.exit(code);
}

if (!token) finish({ ok: false, error: 'missing Zeabur token' }, 1);
const command = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
if (command.confirm !== 'ZEABUR_WRITE_APPROVED') {
  finish({ ok: false, phase: command.phase, error: 'missing write approval' }, 1);
}

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error((body.errors || []).map((entry) => entry.message).join('; ') || `HTTP ${response.status}`);
  }
  return body.data;
}

async function getService() {
  const data = await gql(
    `query SecretBridgeInventory($projectID:ObjectID!,$environmentID:ObjectID!){services(projectID:$projectID){edges{node{_id name variables(environmentID:$environmentID){key value readonly exposed}}}}}`,
    { projectID: projectId, environmentID: environmentId },
  );
  const service = data.services.edges.map((entry) => entry.node).find((entry) => entry.name === serviceName);
  if (!service) throw new Error(`${serviceName} not found`);
  return service;
}

async function setEnv(service, key, value) {
  const entries = (service.variables || []).filter((entry) => entry.key === key);
  if (entries.some((entry) => entry.readonly)) throw new Error(`${key} is readonly`);
  if (entries.length === 0) {
    await gql(
      `mutation CreateEnv($serviceID:ObjectID!,$environmentID:ObjectID!,$key:String!,$value:String!){createEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:$key,value:$value){key}}`,
      { serviceID: service._id, environmentID: environmentId, key, value },
    );
  } else {
    await gql(
      `mutation UpdateEnv($serviceID:ObjectID!,$environmentID:ObjectID!,$oldKey:String!,$newKey:String!,$value:String!){updateSingleEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,oldKey:$oldKey,newKey:$newKey,value:$value){key}}`,
      { serviceID: service._id, environmentID: environmentId, oldKey: key, newKey: key, value },
    );
  }
}

async function deleteEnv(service, key) {
  const entries = (service.variables || []).filter((entry) => entry.key === key);
  if (entries.length === 0) return;
  if (entries.some((entry) => entry.readonly)) throw new Error(`${key} is readonly`);
  await gql(
    `mutation DeleteEnv($serviceID:ObjectID!,$environmentID:ObjectID!,$key:String!){deleteSingleEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:$key)}`,
    { serviceID: service._id, environmentID: environmentId, key },
  );
}

async function redeploy(service) {
  await gql(
    `mutation Redeploy($serviceID:ObjectID!,$environmentID:ObjectID!){redeployService(serviceID:$serviceID,environmentID:$environmentID)}`,
    { serviceID: service._id, environmentID: environmentId },
  );
}

const actions = [];

try {
  if (command.phase === 'prepare') {
    const service = await getService();
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    await setEnv(service, tempKeyName, privateKey);
    actions.push('one-time private decrypt key stored temporarily in Zeabur');
    finish({ ok: true, phase: 'prepare', publicKey, actions });
  }

  if (command.phase === 'apply') {
    const targetKey = String(command.targetKey || '').trim();
    const ciphertext = String(command.ciphertext || '').trim();
    if (!allowedSecretKeys.has(targetKey)) throw new Error('target key is not allowlisted');
    if (!ciphertext) throw new Error('ciphertext missing');

    let service = await getService();
    const privateEntry = (service.variables || []).filter((entry) => entry.key === tempKeyName).at(-1);
    const privateKey = String(privateEntry?.value || '');
    if (!privateKey.includes('PRIVATE KEY')) throw new Error('one-time private decrypt key missing');

    let plaintext;
    try {
      plaintext = privateDecrypt(
        { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(ciphertext, 'base64'),
      ).toString('utf8');
    } catch {
      throw new Error('ciphertext decryption failed');
    }
    if (plaintext.length < 20 || plaintext.length > 500) throw new Error('decrypted secret has invalid length');

    await setEnv(service, targetKey, plaintext);
    actions.push(`${targetKey} created/updated without exposing its value`);
    service = await getService();
    await setEnv(service, 'GEMINI_VISION_MODEL', 'gemini-3-flash-preview');
    actions.push('GEMINI_VISION_MODEL set to gemini-3-flash-preview');
    service = await getService();
    await deleteEnv(service, tempKeyName);
    actions.push('one-time private decrypt key deleted from Zeabur');
    service = await getService();
    await redeploy(service);
    actions.push('webapp-dest redeploy requested');
    finish({ ok: true, phase: 'apply', actions });
  }

  throw new Error(`unknown phase ${command.phase}`);
} catch (error) {
  finish({ ok: false, phase: command.phase, actions, error: error?.message || String(error) }, 1);
}
