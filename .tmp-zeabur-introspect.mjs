import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function readToken() {
  const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
  const match = yaml.match(/token:\s*(\S+)/);
  if (match === null) throw new Error('no token');
  return match[1];
}

async function gql(token, query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const token = readToken();
const environmentID = '6a720a3e5f062718bc7b3421';
const serviceID = '6a8211c2a21454a2cf6ad77b';

const mutations = await gql(
  token,
  `{ __type(name: "Mutation") { fields { name args { name type { kind name ofType { name kind ofType { name } } } } } } }`,
);
const names = (mutations.data?.__type?.fields ?? []).map((f) => f.name);
console.log('all mutations count', names.length);
for (const needle of ['deploy', 'redeploy', 'git', 'build', 'trigger', 'resume', 'suspend', 'restart']) {
  console.log(`\n${needle}:`, names.filter((n) => n.toLowerCase().includes(needle)).join(', '));
}

const gitTrigger = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      _id
      name
      gitTrigger(environmentID: $environmentID) {
        branchName
        provider
        repoID
      }
    }
  }`,
  { serviceID, environmentID },
);
console.log('\ngitTrigger:', JSON.stringify(gitTrigger.data ?? gitTrigger.errors, null, 2));

const billing = await gql(token, `{ me { _id username email } }`);
console.log('\nme:', JSON.stringify(billing.data ?? billing.errors, null, 2));
