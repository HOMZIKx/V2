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
for (const name of ['updateGitTrigger', 'bindServiceGitRepo', 'redeployService', 'restartService', 'deployFromSpecification']) {
  const result = await gql(
    token,
    `{ __type(name: "Mutation") { fields(includeDeprecated: true) { name args { name type { kind name ofType { name kind ofType { name kind ofType { name } } } } } } } }`,
  );
  const field = (result.data?.__type?.fields ?? []).find((f) => f.name === name);
  console.log(`\n=== ${name} ===`);
  if (!field) {
    console.log('not found');
    continue;
  }
  for (const arg of field.args) {
    const t = arg.type;
    const typeName =
      t.name ??
      t.ofType?.name ??
      t.ofType?.ofType?.name ??
      t.ofType?.ofType?.ofType?.name ??
      JSON.stringify(t);
    console.log(`  ${arg.name}: ${typeName}`);
  }
}
