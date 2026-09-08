import fs from 'node:fs';

const API = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const environmentID = '6a720a3e5f062718bc7b3421';

const targets = [
  {
    serviceID: '6a8211c9bdeaa87e2c52df34',
    service: 'api-gateway',
    key: 'API_GATEWAY_CORS_ORIGINS',
    value: 'https://desapp.zeabur.app,https://v2-web.zeabur.app,https://v2222.zeabur.app,https://v2-admin.zeabur.app',
  },
  {
    serviceID: '6a8211cfbdeaa87e2c52df39',
    service: 'identity-service',
    key: 'IDENTITY_TRUSTED_ORIGINS',
    value: 'https://desapp.zeabur.app,https://v2-web.zeabur.app,https://v2-admin.zeabur.app,https://v2-api.zeabur.app,https://v2222.zeabur.app',
  },
];

fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function finish(payload, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(payload, null, 2));
  const lines = ['# Explicit Zeabur env snapshot deployment', '', payload.ok ? '✅ Completed' : '❌ Failed'];
  if (payload.deployments?.length) {
    lines.push('', 'Deployments:');
    for (const item of payload.deployments) lines.push(`- ${item.service}: ${item.deploymentID} — ${item.status}`);
  }
  if (payload.error) lines.push('', `Error: ${payload.error}`);
  fs.writeFileSync(`${outDir}/summary.md`, `${lines.join('\n')}\n`);
  process.exit(code);
}

if (!token) finish({ ok: false, error: 'missing Zeabur token' }, 1);
const command = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
if (command.confirm !== 'ZEABUR_WRITE_APPROVED') finish({ ok: false, error: 'missing write approval' }, 1);

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

async function readService(target) {
  const data = await gql(
    `query Read($serviceID:ObjectID!,$environmentID:ObjectID!){service(_id:$serviceID){_id name status gitTrigger(environmentID:$environmentID){repoID branchName} variables(environmentID:$environmentID){key value readonly exposed}}}`,
    { serviceID: target.serviceID, environmentID },
  );
  if (!data.service) throw new Error(`${target.service}: service not found`);
  return data.service;
}

async function readDeployments(target) {
  const data = await gql(
    `query Deployments($serviceID:ObjectID!,$environmentID:ObjectID!){service(_id:$serviceID){deployments(environmentID:$environmentID){_id status commitSHA createdAt startedAt finishedAt}}}`,
    { serviceID: target.serviceID, environmentID },
  );
  return data.service?.deployments || [];
}

function configuredVars(service) {
  const result = {};
  const counts = new Map();
  for (const entry of service.variables || []) {
    if (entry.readonly !== false || typeof entry.key !== 'string') continue;
    counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
    result[entry.key] = String(entry.value ?? '');
  }
  const duplicateManualKeys = [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicateManualKeys.length) throw new Error(`${service.name}: duplicate configured variables detected (${duplicateManualKeys.length})`);
  return result;
}

async function persistTarget(target) {
  let service = await readService(target);
  const matching = (service.variables || []).filter((entry) => entry.key === target.key);
  if (matching.some((entry) => entry.readonly)) throw new Error(`${target.service}.${target.key} is readonly`);

  if (matching.length) {
    await gql(
      `mutation Set($serviceID:ObjectID!,$environmentID:ObjectID!,$oldKey:String!,$newKey:String!,$value:String!){updateSingleEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,oldKey:$oldKey,newKey:$newKey,value:$value){key}}`,
      { serviceID: target.serviceID, environmentID, oldKey: target.key, newKey: target.key, value: target.value },
    );
  } else {
    await gql(
      `mutation Create($serviceID:ObjectID!,$environmentID:ObjectID!,$key:String!,$value:String!){createEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:$key,value:$value){key}}`,
      { serviceID: target.serviceID, environmentID, key: target.key, value: target.value },
    );
  }

  service = await readService(target);
  const vars = configuredVars(service);
  vars[target.key] = target.value;
  if (vars[target.key] !== target.value) throw new Error(`${target.service}: origin override verification failed`);

  const repoID = service.gitTrigger?.repoID;
  const branchName = String(service.gitTrigger?.branchName || '').trim();
  if (!repoID || !branchName) throw new Error(`${target.service}: Git trigger is incomplete`);

  const beforeIDs = new Set((await readDeployments(target)).map((entry) => entry._id));
  const deployed = await gql(
    `mutation Deploy($serviceID:ObjectID!,$environmentID:ObjectID!,$gitRef:GitRef!,$vars:Map!){deploy(serviceID:$serviceID,environmentID:$environmentID,gitRef:$gitRef,vars:$vars)}`,
    { serviceID: target.serviceID, environmentID, gitRef: { repoID, ref: `refs/heads/${branchName}` }, vars },
  );
  if (deployed.deploy !== true) throw new Error(`${target.service}: deploy returned false`);
  return { target, beforeIDs };
}

async function waitForDeployment(item) {
  const terminalFailure = new Set(['FAILED', 'CANCELED', 'CANCELLED', 'ERROR']);
  let deploymentID = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const deployments = await readDeployments(item.target);
    if (!deploymentID) {
      const created = deployments.find((entry) => !item.beforeIDs.has(entry._id));
      if (created) deploymentID = created._id;
    }
    if (deploymentID) {
      const deployment = deployments.find((entry) => entry._id === deploymentID);
      if (deployment?.status === 'RUNNING') {
        const service = await readService(item.target);
        return { service: item.target.service, deploymentID, status: 'RUNNING', serviceStatus: service.status, commitSHA: deployment.commitSHA || null };
      }
      if (terminalFailure.has(String(deployment?.status || ''))) {
        throw new Error(`${item.target.service}: deployment ${deploymentID} ended as ${deployment.status}`);
      }
    }
    await sleep(2000);
  }
  throw new Error(`${item.target.service}: explicit deployment did not reach RUNNING`);
}

try {
  const requested = [];
  for (const target of targets) requested.push(await persistTarget(target));
  const deployments = [];
  for (const item of requested) deployments.push(await waitForDeployment(item));
  finish({
    ok: true,
    message: 'API Gateway and Identity deployed with explicit current env snapshots',
    deployments,
    overridesVerified: targets.map((target) => ({ service: target.service, key: target.key, corrected: true })),
  });
} catch (error) {
  finish({ ok: false, error: error?.message || String(error) }, 1);
}
