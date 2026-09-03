#!/usr/bin/env node
/** Identity crash diagnosis (redact secrets). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectID = '6a720a3e472e2c91a9e660d5';
const environmentID = '6a720a3e5f062718bc7b3421';
const identityServiceID = '6a8211cfbdeaa87e2c52df39';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  return yaml.match(/token:\s*(\S+)/)?.[1];
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

function redact(message) {
  return String(message)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/redis:\/\/:[^@\s]+@/gi, 'redis://:[REDACTED]@')
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgresql://[REDACTED]@')
    .replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, '[PEM_REDACTED]')
    .replace(/"public_key_pem"\s*:\s*"[^"]+"/g, '"public_key_pem":"[REDACTED]"');
}

const token = readToken();
const deploys = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 2) {
      edges { node { _id status commitSHA createdAt } }
    }
  }`,
  { serviceID: identityServiceID, environmentID },
);
for (const e of deploys.data?.deployments?.edges ?? []) {
  console.log(
    `${e.node.status} ${e.node.createdAt} ${e.node._id} sha=${(e.node.commitSHA ?? '').slice(0, 12)}`,
  );
}
const latest = deploys.data?.deployments?.edges?.[0]?.node;
const logs = await gql(
  token,
  `query($projectID: ObjectID!, $serviceID: ObjectID!, $environmentID: ObjectID!, $deploymentID: ObjectID!) {
    runtimeLogs(projectID: $projectID, serviceID: $serviceID, environmentID: $environmentID, deploymentID: $deploymentID) {
      message
    }
  }`,
  { projectID, serviceID: identityServiceID, environmentID, deploymentID: latest._id },
);
for (const e of (logs.data?.runtimeLogs ?? []).slice(0, 40)) {
  const m = redact(e.message);
  if (/error|Error|Exception|fail|CONFIG|invalid|listen|migration|required|crash/i.test(m)) {
    console.log(m.slice(0, 300));
  }
}
