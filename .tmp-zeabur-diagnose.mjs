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
const projectID = '6a720a3e472e2c91a9e660d5';
const environmentID = '6a720a3e5f062718bc7b3421';

const introspect = await gql(
  token,
  `{ __type(name: "Mutation") { fields { name args { name type { kind name ofType { name kind } } } } } } }`,
);
const mutationNames = (introspect.data?.__type?.fields ?? [])
  .map((f) => f.name)
  .filter((n) => /deploy|redeploy|build|git|trigger|resume|suspend/i.test(n));
console.log('deploy-like mutations:', mutationNames.join(', '));

const me = await gql(token, `{ me { _id username email plan credit } }`);
console.log('me:', JSON.stringify(me.data?.me ?? me.errors, null, 2));

const project = await gql(
  token,
  `query($projectID: ObjectID!) {
    project(_id: $projectID) {
      _id
      name
      suspendedAt
      services { edges { node { _id name suspendedAt } } }
    }
  }`,
  { projectID },
);
console.log('project:', JSON.stringify(project.data?.project ?? project.errors, null, 2));

const env = await gql(
  token,
  `query($environmentID: ObjectID!) {
    environment(_id: $environmentID) {
      _id
      name
      isDeleted
    }
  }`,
  { environmentID },
);
console.log('environment:', JSON.stringify(env.data?.environment ?? env.errors, null, 2));

const serviceID = '6a8211c2a21454a2cf6ad77b';
const svc = await gql(
  token,
  `query($serviceID: ObjectID!, $environmentID: ObjectID!) {
    service(_id: $serviceID) {
      _id
      name
      suspendedAt
      gitTrigger { branchName provider repoID }
    }
    deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: 3) {
      items { _id status commitSHA createdAt }
    }
  }`,
  { serviceID, environmentID },
);
console.log('activity-service:', JSON.stringify(svc.data ?? svc.errors, null, 2));
