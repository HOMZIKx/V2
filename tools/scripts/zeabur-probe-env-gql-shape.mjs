#!/usr/bin/env node
/** Discover Zeabur GraphQL path to service env vars (keys only). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const environmentID = '6a720a3e5f062718bc7b3421';
const activityServiceID = '6a8211c2a21454a2cf6ad77b';
const postgresServiceID = '6a821138a21454a2cf6ad74d';

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

const token = readToken();

for (const typeName of ['Environment', 'Service', 'Query']) {
  const t = await gql(
    token,
    `query($n: String!) { __type(name: $n) { name fields { name args { name type { name kind ofType { name } } } } } }`,
    { n: typeName },
  );
  const fields = t.data?.__type?.fields ?? [];
  const interesting = fields.filter((f) => /var|env|secret|service|postgres|conn/i.test(f.name));
  console.log(
    `\n=== ${typeName} ===`,
    interesting
      .map((f) => `${f.name}(${(f.args ?? []).map((a) => a.name).join(',')})`)
      .join(' | ') || '(none matched)',
  );
}

const probes = [
  [
    'env.variables',
    `query($e: ObjectID!) {
      environment(_id: $e) {
        variables { key value exposed serviceID readonly }
      }
    }`,
    { e: environmentID },
  ],
  [
    'env.serviceVariables',
    `query($e: ObjectID!, $s: ObjectID!) {
      environment(_id: $e) {
        service(_id: $s) {
          name
          variables { key value exposed }
        }
      }
    }`,
    { e: environmentID, s: activityServiceID },
  ],
  [
    'environments.variables',
    `query($e: ObjectID!) {
      environments(_id: $e) {
        variables { key }
      }
    }`,
    { e: environmentID },
  ],
];

for (const [label, query, variables] of probes) {
  const result = await gql(token, query, variables);
  const err = result.errors?.[0]?.message;
  if (err) {
    console.log(`\n${label}: ERR ${err}`);
    continue;
  }
  const json = JSON.stringify(result.data);
  // Redact any postgres:// or long values
  const redacted = json.replace(/postgres(?:ql)?:\/\/[^"\\]+/gi, 'postgres://[REDACTED]');
  const keys = redacted.match(/"key":"[^"]+"/g)?.map((m) => m.slice(7, -1)) ?? [];
  console.log(`\n${label}: ok keys=${keys.length}`);
  console.log(
    '  sample keys:',
    keys
      .filter((k) => /DATABASE|PORT|POSTGRES|URL|PASSWORD/i.test(k))
      .slice(0, 40)
      .join(', '),
  );
}

// Mutation field names for create env var
const mut = await gql(token, `{ __type(name: "Mutation") { fields { name } } }`);
const mutNames = (mut.data?.__type?.fields ?? [])
  .map((f) => f.name)
  .filter((n) => /var|env|secret|restart/i.test(n));
console.log('\nmutation fields:', mutNames.join(', '));
