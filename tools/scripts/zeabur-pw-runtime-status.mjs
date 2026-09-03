#!/usr/bin/env node
/** Prove player-workspace-service health/ready + unauthorized + restart migrate NOOP. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const pwServiceID = '6a9885bb573ada8b3bbe5f1f';
const apiGatewayServiceID = '6a8211c9bdeaa87e2c52df34';

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

async function listVars(token, serviceID) {
  const result = await gql(
    token,
    `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
      service(_id: $serviceID) {
        variables(environmentID: $environmentID) { key value }
      }
    }`,
    { serviceID, environmentID },
  );
  return new Map((result.data?.service?.variables ?? []).map((row) => [row.key, row.value ?? '']));
}

function summarize(value) {
  if (!value) return 'EMPTY';
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.hostname}:${u.port || '-'}${u.pathname}`;
  } catch {
    return `LEN=${value.length}`;
  }
}

const token = readToken();

const status = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      name
      status(environmentID: $environmentID) {
        status
        domains { domain status }
      }
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
console.log('status query errors:', status.errors?.[0]?.message ?? 'none');
console.log(JSON.stringify(status.data ?? status, null, 2).slice(0, 2000));

// Try Service type fields for domains / deployments
const svcType = await gql(token, `{ __type(name: "Service") { fields { name } } }`);
const fields = (svcType.data?.__type?.fields ?? []).map((f) => f.name);
console.log(
  'Service fields matching:',
  fields.filter((n) => /status|domain|deploy|url|health/i.test(n)).join(', '),
);

const deploys = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    deployments(serviceID: $serviceID, environmentID: $environmentID, limit: 3) {
      edges {
        node {
          _id
          status
          createdAt
          codeVersion { git { commitSHA } }
        }
      }
    }
  }`,
  { serviceID: pwServiceID, environmentID },
);
if (deploys.errors) {
  console.log('deployments err:', deploys.errors[0]?.message);
} else {
  for (const edge of deploys.data?.deployments?.edges ?? []) {
    const n = edge.node;
    console.log(
      `deploy ${n._id} status=${n.status} sha=${n.codeVersion?.git?.commitSHA?.slice(0, 12) ?? '?'} at=${n.createdAt}`,
    );
  }
}

const pwVars = await listVars(token, pwServiceID);
const gwVars = await listVars(token, apiGatewayServiceID);
console.log('PW has DATABASE_URL:', Boolean(pwVars.get('PLAYER_WORKSPACE_DATABASE_URL')));
console.log('PW PORT:', pwVars.get('PORT') || '(missing)');
console.log('PW SERVICE_PORT:', pwVars.get('PLAYER_WORKSPACE_SERVICE_PORT') || '(missing)');
console.log('GW PW base:', summarize(gwVars.get('PLAYER_WORKSPACE_SERVICE_BASE_URL')));
console.log('GW ACTIVITY base:', summarize(gwVars.get('ACTIVITY_SERVICE_BASE_URL')));
