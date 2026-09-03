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
for (const typeName of ['TriggerInput', 'DeploymentSpecification', 'GitTrigger']) {
  const result = await gql(
    token,
    `query($name: String!) {
      __type(name: $name) {
        name
        inputFields { name type { kind name ofType { name kind ofType { name } } } }
        fields { name type { kind name ofType { name } } }
      }
    }`,
    { name: typeName },
  );
  console.log(`\n=== ${typeName} ===`);
  console.log(JSON.stringify(result.data?.__type ?? result.errors, null, 2));
}
