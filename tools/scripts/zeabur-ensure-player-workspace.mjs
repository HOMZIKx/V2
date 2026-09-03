import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectID = '6a720a3e472e2c91a9e660d5';
const environmentID = '6a720a3e5f062718bc7b3421';
const yaml = fs.readFileSync(path.join(os.homedir(), '.config', 'zeabur', 'cli.yaml'), 'utf8');
const token = yaml.match(/token:\s*(\S+)/)?.[1];
if (!token) throw new Error('no zeabur token');

async function gql(query, variables = {}) {
  const response = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

const listed = await gql(
  `
  query ($projectID: ObjectID!) {
    services(projectID: $projectID) {
      edges {
        node {
          _id
          name
        }
      }
    }
  }
`,
  { projectID },
);

const services = (listed.data?.services?.edges ?? []).map((edge) => edge.node);
console.log('SERVICES');
for (const service of services) {
  console.log(`${service.name}\t${service._id}`);
}

let service = services.find((item) => item.name === 'player-workspace-service');
if (!service) {
  const created = await gql(
    `
    mutation ($projectID: ObjectID!, $name: String!) {
      createService(projectID: $projectID, name: $name, template: GIT) {
        _id
        name
      }
    }
  `,
    { projectID, name: 'player-workspace-service' },
  );
  console.log('CREATE', JSON.stringify(created, null, 2));
  if (created.errors) process.exit(1);
  service = created.data.createService;
}

console.log(`SERVICE_ID=${service._id}`);
